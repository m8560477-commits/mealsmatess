import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

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
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertManagedAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await (supabaseAdmin as any)
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
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => RestaurantIdSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertManagedAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update({ approval_status: "approved" })
      .eq("id", data.restaurantId);
    if (error) throw error;
    return { restaurantId: data.restaurantId, launched: true };
  });

export const createManagedRestaurant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((value: unknown) => CreateManagedRestaurantSchema.parse(value))
  .handler(async ({ data, context }) => {
    await assertManagedAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();
    const { data: invite, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        data: { full_name: data.ownerName, account_type: "restaurant" },
      },
    );
    if (inviteError && !inviteError.message.toLowerCase().includes("already registered"))
      throw inviteError;

    let ownerId = invite.user?.id ?? null;
    if (!ownerId) {
      const { data: existing } = await supabaseAdmin.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
      ownerId = existing.users.find((user) => user.email?.toLowerCase() === email)?.id ?? null;
    }

    if (!ownerId) throw new Error("Could not find or invite the owner account.");
    const slug = `${data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${crypto.randomUUID().slice(0, 8)}`;
    const { data: restaurant, error: restaurantError } = await supabaseAdmin
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
    await supabaseAdmin
      .from("restaurant_staff")
      .insert({ restaurant_id: restaurant.id, user_id: ownerId, role: "owner" });
    return {
      restaurant: { ...restaurant, owner_email: restaurant.email },
      trialEndsAt: null,
      invited: Boolean(invite.user),
      sponsored: false,
    };
  });

export { ADMIN_EMAIL };
