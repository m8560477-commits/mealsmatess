import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { changeGrant, GrantInput, grantId, listGrants } from "@/lib/premium-grants.server";
import { requireAdmin } from "@/lib/admin-access.server";
import { getFirebaseServerServices } from "@/server/firebase-admin";

export const managePremiumGrant = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .validator((input: unknown) =>
    GrantInput.extend({ action: z.enum(["grant", "extend", "revoke"]) }).parse(input),
  )
  .handler(({ context, data }) => changeGrant(context.userId, data.action, data));
export const getPremiumGrants = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .handler(({ context }) => listGrants(context.userId));
export const getPremiumGrantHistory = createServerFn({ method: "GET" })
  .middleware([requireFirebaseAuth])
  .validator((input: unknown) =>
    z.object({ email: z.string().trim().email().max(254) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    await requireAdmin(context.userId);
    const rows = await getFirebaseServerServices()
      .db.collection("premium_grants")
      .doc(grantId(data.email))
      .collection("history")
      .orderBy("occurred_at", "desc")
      .limit(100)
      .get();
    return rows.docs.map((doc) => {
      const row = doc.data();
      return {
        id: doc.id,
        action: String(row.action),
        actorId: String(row.actor_id),
        occurredAt: String(row.occurred_at),
        days: Number(row.days ?? 0),
        expiresAt: row.after?.expires_at ?? row.expires_at ?? null,
      };
    });
  });
