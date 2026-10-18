import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";

const ADMIN_EMAIL = "tatendamkhwanazi6@gmail.com";
const CreateManagedRestaurantSchema = z.object({
  email: z.string().email(),
  name: z.string().trim().min(2).max(120),
  ownerName: z.string().trim().min(2).max(120),
});
const RestaurantIdSchema = z.object({ restaurantId: z.string().uuid() });

async function assertManagedAdmin(context: { userId: string }) {
  const { isAdmin } = await import("@/lib/marketplace.server");
  // Admin rights come only from the server-side role table, never from an email match.
  if (!(await isAdmin(context.userId))) {
    throw new Error("Admin access required");
  }
}

export const listManagedRestaurants = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(async ({ context }) => {
    await assertManagedAdmin(context);
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const { data, error } = await (firebaseAdmin as any)
      .from("restaurants")
      .select("id,name,email,owner_name,approval_status,created_at")
      .order("created_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as any[]).map((r) => ({
      ...r,
      owner_email: r.email,
      onboarding_complete: r.approval_status === "approved",
      is_suspended: r.approval_status === "suspended",
    }));
  });

export const launchManagedRestaurant = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((value: unknown) => RestaurantIdSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertManagedAdmin(context);
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const { error } = await firebaseAdmin
      .from("restaurants")
      .update({ approval_status: "approved" })
      .eq("id", data.restaurantId);
    if (error) throw error;
    return { restaurantId: data.restaurantId, launched: true };
  });

export const createManagedRestaurant = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((value: unknown) => CreateManagedRestaurantSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertManagedAdmin(context);
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const email = data.email.trim().toLowerCase();
    const { getOrCreateFirebaseUser } = await loadFirebaseAdmin();
    const { user: owner, created: ownerCreated } = await getOrCreateFirebaseUser(
      email,
      data.ownerName.trim(),
    );
    const ownerId = owner.uid;
    const { error: profileError } = await firebaseAdmin.from("profiles").upsert(
      {
        id: ownerId,
        email,
        display_name: owner.displayName || data.ownerName.trim(),
        created_at: owner.metadata.creationTime ?? new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (profileError) throw new Error(profileError.message);

    const slug = `${data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
    const { data: restaurant, error: restaurantError } = await firebaseAdmin
      .from("restaurants")
      .insert({
        name: data.name.trim(),
        slug,
        owner_id: ownerId,
        owner_name: data.ownerName.trim(),
        email,
        approval_status: "pending",
      })
      .select("id,name,slug,email")
      .single();
    if (restaurantError) throw restaurantError;
    await firebaseAdmin
      .from("restaurant_staff")
      .insert({ restaurant_id: restaurant.id, user_id: ownerId, role: "owner" });
    return {
      restaurant: { ...restaurant, owner_email: restaurant.email },
      trialEndsAt: null,
      invited: ownerCreated,
      sponsored: false,
    };
  });

export { ADMIN_EMAIL };
