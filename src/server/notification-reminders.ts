import { FieldPath } from "firebase-admin/firestore";
import { getFirebaseAdminFirestore } from "@/server/firebase-admin";
import { localClock, preferencesFrom } from "@/lib/notification-policy";
import {
  createUserNotification,
  deliverPendingNotifications,
  type NotificationEvent,
} from "@/server/user-notifications";

// Page cursor survives invocations; a lease prevents overlapping cron workers.
export async function processNotificationReminders(now = new Date()) {
  const db = getFirebaseAdminFirestore();
  const state = db.collection("notification_jobs").doc("reminders");
  const claim = await db.runTransaction(async (tx) => {
    const snapshot = await tx.get(state);
    if (Number(snapshot.get("leaseUntil") ?? 0) > now.getTime()) return null;
    const cursor = snapshot.get("cursor") as string | undefined;
    tx.set(state, { leaseUntil: now.getTime() + 10 * 60_000 }, { merge: true });
    return { cursor };
  });
  if (!claim) return { processed: 0, busy: true };
  let processed = 0;
  try {
    let query = db.collection("users").orderBy(FieldPath.documentId()).limit(25);
    if (claim.cursor) query = query.startAfter(claim.cursor);
    const users = await query.get();
    for (const user of users.docs) {
      const p = preferencesFrom(
        (await user.ref.collection("notification_settings").doc("preferences").get()).data(),
      );
      const clock = localClock(now, p.timeZone);
      // Daily digest at the user's chosen local time. Late jobs catch up once per date.
      if (
        clock.time >= p.reminderTime &&
        !user.get("deleted") &&
        !user.get("disabled") &&
        !user.get("account_disabled")
      ) {
        const emit = (key: string, event: Omit<NotificationEvent, "eventId">) =>
          createUserNotification(user.id, { ...event, eventId: `${key}:${clock.date}` });
        if (p.mealPlanningEnabled) {
          const meals = await user.ref
            .collection("mealPlans")
            .where("plan_date", "==", clock.date)
            .limit(20)
            .get();
          if (!meals.empty)
            await emit("planned-meals", {
              category: "meal_planning",
              title: "Your meals for today",
              body: `You have ${meals.size} saved meal${meals.size === 1 ? "" : "s"} planned today. Take a moment to check preparation and ingredients.`,
              destination: "/planner",
            });
          else if (new Date(`${clock.date}T12:00:00Z`).getUTCDay() === 0)
            await emit("weekly-plan", {
              category: "meal_planning",
              title: "A little planning for the week",
              body: "Choose meals that fit your week when you’re ready.",
              destination: "/planner",
            });
        }
        if (p.pantryShoppingEnabled) {
          const grocery = await user.ref
            .collection("grocery")
            .where("checked", "==", false)
            .limit(50)
            .get();
          if (!grocery.empty)
            await emit("shopping", {
              category: "pantry_shopping",
              title: "Your shopping list is ready",
              body: "You have unchecked items on your saved shopping list.",
              destination: "/list",
            });
          const through = new Date(`${clock.date}T12:00:00Z`);
          through.setUTCDate(through.getUTCDate() + 2);
          const pantry = await user.ref
            .collection("pantry")
            .where("expires_at", ">=", clock.date)
            .where("expires_at", "<=", through.toISOString().slice(0, 10))
            .limit(50)
            .get();
          for (const item of pantry.docs)
            await createUserNotification(user.id, {
              eventId: `pantry:${item.id}:${item.get("expires_at")}`,
              category: "pantry_shopping",
              title: "Check your pantry dates",
              body: `${String(item.get("name") ?? "An ingredient").slice(0, 100)} has a saved expiry date approaching. Check its label and condition before use.`,
              destination: "/pantry",
            });
        }
        if (p.recipesEnabled) {
          const restrictions = user.get("preferences.dietary_restrictions");
          const dietary = Array.isArray(restrictions)
            ? restrictions
                .filter((v): v is string => typeof v === "string")
                .map((v) => v.toLowerCase())
            : [];
          if (dietary.length) {
            const recent = await db
              .collection("recipes")
              .where("created_at", ">=", new Date(now.getTime() - 7 * 86400000).toISOString())
              .orderBy("created_at", "desc")
              .limit(30)
              .get();
            const match = recent.docs.find((recipe) => {
              const tags = recipe.get("diet_tags");
              return (
                Array.isArray(tags) &&
                dietary.every((tag) =>
                  tags.some((value) => typeof value === "string" && value.toLowerCase() === tag),
                ) &&
                typeof recipe.get("slug") === "string" &&
                /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(recipe.get("slug"))
              );
            });
            if (match)
              await createUserNotification(user.id, {
                eventId: `recipe:${match.id}`,
                category: "recipes",
                title: "A recipe matching your saved preferences",
                body: `${String(match.get("name") ?? "A new recipe").slice(0, 100)} has matching dietary tags. Review its ingredients and allergens yourself before cooking.`,
                destination: `/recipe/${match.get("slug")}`,
              });
          }
          if (new Date(`${clock.date}T12:00:00Z`).getUTCDay() === 0) {
            const saved = await user.ref.collection("favorites").limit(1).get();
            if (!saved.empty)
              await emit("saved-recipes", {
                category: "recipes",
                title: "Revisit a saved favourite",
                body: "Your cookbook has saved recipes to inspire your next meal.",
                destination: "/cookbook",
              });
          }
        }
        const goal = user.get("preferences.goal");
        if (p.nutritionEnabled && typeof goal === "string" && goal.trim())
          await emit("personal-goal", {
            category: "healthy_eating",
            title: "A moment for your goals",
            body: "If it suits your day, check in with your saved food goals. Small, comfortable steps count.",
            destination: "/coach",
          });
      }
      await deliverPendingNotifications(user.id, now);
      processed++;
    }
    await state.set(
      {
        cursor: users.size === 25 ? users.docs.at(-1)!.id : null,
        leaseUntil: 0,
        lastRunAt: now.toISOString(),
        processed,
      },
      { merge: true },
    );
    return { processed, more: users.size === 25 };
  } catch (error) {
    await state.set(
      { leaseUntil: 0, lastError: "Reminder processing failed; retry required." },
      { merge: true },
    );
    throw error;
  }
}
