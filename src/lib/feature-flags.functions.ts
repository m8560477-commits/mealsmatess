import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireFirebaseAuth } from "@/lib/firebase-auth-middleware";
import { loadFirebaseAdmin } from "@/lib/firebase-admin-access";

async function assertAdmin(userId: string) {
  const { firebaseAdmin } = await loadFirebaseAdmin();
  const { data } = await firebaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

// Public read (anon + authenticated) — flags drive UI availability
export const listFeatureFlags = createServerFn({ method: "GET" }).handler(async () => {
  const { firebaseAdmin } = await loadFirebaseAdmin();
  const { data, error } = await firebaseAdmin
    .from("feature_flags")
    .select("key, enabled, description, rollout_percent")
    .order("key");
  if (error) throw new Error(error.message);
  return data ?? [];
});

export const adminUpsertFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((v: unknown) =>
    z
      .object({
        key: z.string().min(1).max(80),
        enabled: z.boolean(),
        description: z.string().max(500).optional(),
        rollout_percent: z.number().int().min(0).max(100).default(100),
      })
      .parse(v),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const { error } = await firebaseAdmin.from("feature_flags").upsert(
      {
        key: data.key,
        enabled: data.enabled,
        description: data.description ?? null,
        rollout_percent: data.rollout_percent,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const adminDeleteFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireFirebaseAuth])
  .inputValidator((v: unknown) => z.object({ key: z.string().min(1) }).parse(v))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { firebaseAdmin } = await loadFirebaseAdmin();
    const { error } = await firebaseAdmin.from("feature_flags").delete().eq("key", data.key);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
