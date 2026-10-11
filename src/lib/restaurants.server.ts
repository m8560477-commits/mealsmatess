// Server-only restaurant marketplace logic. Never import from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { slugify } from "@/lib/slug";
import { auditLog } from "@/lib/security.server";
import {
  NEXT_STATUS,
  type ApplicationInput,
  type MenuItemInput,
  type OrderInput,
  type OrderStatus,
  type ProfileUpdateInput,
} from "@/lib/restaurants.schemas";

const BUCKET = "restaurant-media";
const SIGNED_URL_TTL = 60 * 60 * 24 * 365 * 5;

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return !!data;
}

/** Throws unless the user owns (or staffs) the restaurant, or is an admin. */
async function assertMember(userId: string, restaurantId: string): Promise<void> {
  const { data: owned } = await supabaseAdmin
    .from("restaurants")
    .select("id")
    .eq("id", restaurantId)
    .eq("owner_id", userId)
    .maybeSingle();
  if (owned) return;
  const { data: staff } = await supabaseAdmin
    .from("restaurant_staff")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userId)
    .maybeSingle();
  if (staff) return;
  if (await isAdmin(userId)) return;
  throw new Response("Forbidden", { status: 403 });
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "restaurant";
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const { data } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("slug", candidate)
      .maybeSingle();
    if (!data) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export async function createApplication(userId: string, input: ApplicationInput) {
  const { data: existing } = await supabaseAdmin
    .from("restaurants")
    .select("id,approval_status")
    .eq("owner_id", userId)
    .maybeSingle();
  if (existing) {
    return { restaurantId: existing.id, status: existing.approval_status, alreadyExists: true };
  }

  const slug = await uniqueSlug(input.name);
  const { data: restaurant, error } = await supabaseAdmin
    .from("restaurants")
    .insert({
      owner_id: userId,
      slug,
      name: input.name,
      owner_name: input.owner_name,
      description: input.description ?? null,
      cuisine: input.cuisine ?? null,
      phone: input.phone,
      email: input.email,
      whatsapp: input.whatsapp ?? null,
      address: input.address,
      business_registration: input.business_registration ?? null,
      price_range: input.price_range ?? null,
      currency: input.currency,
      delivery_fee: input.delivery_fee,
      min_order_amount: input.min_order_amount,
      delivery_radius_km: input.delivery_radius_km,
      delivery_estimate_minutes: input.delivery_estimate_minutes,
      opening_hours: (input.opening_hours ?? {}) as never,
      approval_status: "pending",
    })
    .select("id,slug,approval_status")
    .single();
  if (error) throw new Error(error.message);

  if (typeof input.latitude === "number" && typeof input.longitude === "number") {
    await supabaseAdmin.from("restaurant_locations").insert({
      restaurant_id: restaurant.id,
      label: "Main",
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
    });
  }

  await supabaseAdmin
    .from("restaurant_staff")
    .insert({ restaurant_id: restaurant.id, user_id: userId, role: "owner" });

  await supabaseAdmin.from("restaurant_applications").insert({
    restaurant_id: restaurant.id,
    applicant_id: userId,
    status: "pending",
    submitted_data: input as never,
  });

  await auditLog({
    actor_id: userId,
    action: "restaurant_application_submitted",
    target_table: "restaurants",
    target_id: restaurant.id,
  });

  return { restaurantId: restaurant.id, status: restaurant.approval_status, alreadyExists: false };
}

export async function fetchMyRestaurant(userId: string) {
  const { data: restaurant } = await supabaseAdmin
    .from("restaurants")
    .select("*,restaurant_locations(id,label,address,latitude,longitude)")
    .eq("owner_id", userId)
    .maybeSingle();

  if (!restaurant) {
    const { data: staff } = await supabaseAdmin
      .from("restaurant_staff")
      .select("restaurant_id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!staff) return { restaurant: null, application: null, menu: [] };
    const { data: viaStaff } = await supabaseAdmin
      .from("restaurants")
      .select("*,restaurant_locations(id,label,address,latitude,longitude)")
      .eq("id", staff.restaurant_id)
      .maybeSingle();
    if (!viaStaff) return { restaurant: null, application: null, menu: [] };
    const { data: menu } = await supabaseAdmin
      .from("menu_items")
      .select("*")
      .eq("restaurant_id", viaStaff.id)
      .order("sort_order");
    return { restaurant: viaStaff, application: null, menu: menu ?? [] };
  }

  const [{ data: application }, { data: menu }] = await Promise.all([
    supabaseAdmin
      .from("restaurant_applications")
      .select("id,status,rejection_reason,requested_changes,admin_notes,reviewed_at,created_at")
      .eq("restaurant_id", restaurant.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin.from("menu_items").select("*").eq("restaurant_id", restaurant.id).order("sort_order"),
  ]);

  return { restaurant, application: application ?? null, menu: menu ?? [] };
}

export async function updateRestaurantProfile(userId: string, input: ProfileUpdateInput) {
  const { restaurantId, latitude, longitude, opening_hours, ...rest } = input;
  await assertMember(userId, restaurantId);

  const patch: Record<string, unknown> = { ...rest };
  if (opening_hours) patch["opening_hours"] = opening_hours;
  Object.keys(patch).forEach((k) => patch[k] === undefined && delete patch[k]);

  if (Object.keys(patch).length > 0) {
    const { error } = await supabaseAdmin
      .from("restaurants")
      .update(patch as never)
      .eq("id", restaurantId);
    if (error) throw new Error(error.message);
  }

  if (typeof latitude === "number" && typeof longitude === "number") {
    const { data: loc } = await supabaseAdmin
      .from("restaurant_locations")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .limit(1)
      .maybeSingle();
    if (loc) {
      await supabaseAdmin
        .from("restaurant_locations")
        .update({ latitude, longitude, address: rest.address ?? null })
        .eq("id", loc.id);
    } else {
      await supabaseAdmin.from("restaurant_locations").insert({
        restaurant_id: restaurantId,
        label: "Main",
        latitude,
        longitude,
        address: rest.address ?? null,
      });
    }
  }

  return { ok: true };
}

export async function uploadMedia(
  userId: string,
  input: {
    restaurantId?: string | undefined;
    kind: "logo" | "cover" | "food" | "menu-item";
    fileName: string;
    contentType: string;
    base64: string;
  },
) {
  if (!input.contentType.startsWith("image/")) {
    throw new Response("Only images are allowed", { status: 400 });
  }
  let restaurantId = input.restaurantId;
  if (restaurantId) {
    await assertMember(userId, restaurantId);
  } else {
    const { data } = await supabaseAdmin
      .from("restaurants")
      .select("id")
      .eq("owner_id", userId)
      .maybeSingle();
    if (!data) throw new Response("No restaurant found", { status: 404 });
    restaurantId = data.id;
  }

  const raw = input.base64.includes(",") ? input.base64.split(",")[1]! : input.base64;
  const bytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
  if (bytes.byteLength > 6 * 1024 * 1024) {
    throw new Response("Image too large (max 6MB)", { status: 400 });
  }
  const ext = (input.fileName.split(".").pop() ?? "jpg").toLowerCase().slice(0, 5);
  const path = `${restaurantId}/${input.kind}-${Date.now()}.${ext}`;

  const { error } = await supabaseAdmin.storage
    .from(BUCKET)
    .upload(path, bytes, { contentType: input.contentType, upsert: true });
  if (error) throw new Error(error.message);

  const { data: signed, error: signErr } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL);
  if (signErr || !signed) throw new Error(signErr?.message ?? "Could not sign media URL");

  if (input.kind === "logo") {
    await supabaseAdmin.from("restaurants").update({ logo_url: signed.signedUrl }).eq("id", restaurantId);
  } else if (input.kind === "cover") {
    await supabaseAdmin
      .from("restaurants")
      .update({ cover_image_url: signed.signedUrl })
      .eq("id", restaurantId);
  } else if (input.kind === "food") {
    const { data: r } = await supabaseAdmin
      .from("restaurants")
      .select("food_photos")
      .eq("id", restaurantId)
      .maybeSingle();
    const photos = Array.isArray(r?.food_photos) ? (r!.food_photos as string[]) : [];
    await supabaseAdmin
      .from("restaurants")
      .update({ food_photos: [...photos, signed.signedUrl].slice(0, 20) as never })
      .eq("id", restaurantId);
  }

  return { url: signed.signedUrl, path };
}

export async function persistMenuItem(userId: string, input: MenuItemInput) {
  await assertMember(userId, input.restaurantId);
  const row = {
    restaurant_id: input.restaurantId,
    name: input.name,
    description: input.description ?? null,
    image_url: input.image_url ?? null,
    price: input.price,
    category: input.category ?? null,
    is_available: input.is_available,
    sort_order: input.sort_order,
  };
  if (input.id) {
    const { data, error } = await supabaseAdmin
      .from("menu_items")
      .update(row)
      .eq("id", input.id)
      .eq("restaurant_id", input.restaurantId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return data;
  }
  const { data, error } = await supabaseAdmin.from("menu_items").insert(row).select("*").single();
  if (error) throw new Error(error.message);
  return data;
}

export async function removeMenuItem(userId: string, id: string) {
  const { data: item } = await supabaseAdmin
    .from("menu_items")
    .select("id,restaurant_id")
    .eq("id", id)
    .maybeSingle();
  if (!item) return { ok: true };
  await assertMember(userId, item.restaurant_id);
  const { error } = await supabaseAdmin.from("menu_items").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

const ACTIVE_STATUSES: OrderStatus[] = ["new", "accepted", "preparing", "ready", "out_for_delivery"];

export async function fetchRestaurantOrders(
  userId: string,
  restaurantId: string,
  scope: "active" | "completed",
) {
  await assertMember(userId, restaurantId);
  const statuses = scope === "active" ? ACTIVE_STATUSES : (["completed", "cancelled"] as OrderStatus[]);
  const { data, error } = await supabaseAdmin
    .from("restaurant_orders")
    .select(
      "id,status,subtotal,delivery_fee,total,currency,delivery_address,contact_phone,notes,placed_at,completed_at,rejection_reason,order_items(id,name,unit_price,quantity,notes)",
    )
    .eq("restaurant_id", restaurantId)
    .in("status", statuses)
    .order("placed_at", { ascending: false })
    .limit(100);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function setOrderStatus(
  userId: string,
  orderId: string,
  status: OrderStatus,
  reason?: string,
) {
  const { data: order } = await supabaseAdmin
    .from("restaurant_orders")
    .select("id,restaurant_id,status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) throw new Response("Order not found", { status: 404 });
  await assertMember(userId, order.restaurant_id);

  const allowed = NEXT_STATUS[order.status as OrderStatus] ?? [];
  if (!allowed.includes(status)) {
    throw new Response(`Cannot move order from ${order.status} to ${status}`, { status: 400 });
  }

  const patch: Record<string, unknown> = { status };
  if (status === "completed") patch["completed_at"] = new Date().toISOString();
  if (status === "cancelled") patch["rejection_reason"] = reason ?? null;

  const { error } = await supabaseAdmin
    .from("restaurant_orders")
    .update(patch as never)
    .eq("id", orderId);
  if (error) throw new Error(error.message);

  await auditLog({
    actor_id: userId,
    action: "restaurant_order_status_changed",
    target_table: "restaurant_orders",
    target_id: orderId,
    metadata: { from: order.status, to: status },
  });

  return { ok: true, status };
}

export async function fetchRestaurantStats(userId: string, restaurantId: string) {
  await assertMember(userId, restaurantId);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from("restaurant_orders")
    .select("status,total,placed_at")
    .eq("restaurant_id", restaurantId)
    .gte("placed_at", since);
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  const completed = rows.filter((r) => r.status === "completed");
  const revenue = completed.reduce((s, r) => s + Number(r.total ?? 0), 0);
  const byDay = new Map<string, number>();
  for (const r of completed) {
    const day = String(r.placed_at).slice(0, 10);
    byDay.set(day, (byDay.get(day) ?? 0) + Number(r.total ?? 0));
  }
  return {
    orders30d: rows.length,
    completed30d: completed.length,
    active: rows.filter((r) => ACTIVE_STATUSES.includes(r.status as OrderStatus)).length,
    revenue30d: Math.round(revenue * 100) / 100,
    avgOrder: completed.length ? Math.round((revenue / completed.length) * 100) / 100 : 0,
    daily: [...byDay.entries()].sort().map(([date, total]) => ({ date, total })),
  };
}

export async function persistOrder(userId: string, input: OrderInput) {
  const { data: restaurant } = await supabaseAdmin
    .from("restaurants")
    .select("id,approval_status,is_accepting_orders,delivery_fee,min_order_amount,currency")
    .eq("id", input.restaurantId)
    .maybeSingle();
  if (!restaurant || restaurant.approval_status !== "approved") {
    throw new Response("Restaurant unavailable", { status: 404 });
  }
  if (!restaurant.is_accepting_orders) {
    throw new Response("This restaurant is not accepting orders right now", { status: 400 });
  }

  const ids = input.items.map((i) => i.menu_item_id);
  const { data: menuItems, error: menuErr } = await supabaseAdmin
    .from("menu_items")
    .select("id,name,price,is_available,is_hidden,restaurant_id")
    .in("id", ids)
    .eq("restaurant_id", input.restaurantId);
  if (menuErr) throw new Error(menuErr.message);

  const map = new Map((menuItems ?? []).map((m) => [m.id, m]));
  const lines = input.items.map((i) => {
    const item = map.get(i.menu_item_id);
    if (!item || item.is_hidden || !item.is_available) {
      throw new Response("An item in your cart is no longer available", { status: 400 });
    }
    return {
      menu_item_id: item.id,
      name: item.name,
      unit_price: Number(item.price),
      quantity: i.quantity,
      notes: i.notes ?? null,
    };
  });

  // Prices always come from the database, never from the client.
  const subtotal = Math.round(lines.reduce((s, l) => s + l.unit_price * l.quantity, 0) * 100) / 100;
  if (subtotal < Number(restaurant.min_order_amount ?? 0)) {
    throw new Response(`Minimum order is ${restaurant.min_order_amount}`, { status: 400 });
  }
  const deliveryFee = Number(restaurant.delivery_fee ?? 0);
  const total = Math.round((subtotal + deliveryFee) * 100) / 100;

  const { data: order, error } = await supabaseAdmin
    .from("restaurant_orders")
    .insert({
      order_number: `MM-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
      restaurant_id: restaurant.id,
      customer_id: userId,
      status: "new",
      subtotal,
      delivery_fee: deliveryFee,
      total,
      currency: restaurant.currency,
      delivery_address: input.delivery_address,
      contact_phone: input.contact_phone,
      notes: input.notes ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { error: itemsErr } = await supabaseAdmin
    .from("order_items")
    .insert(lines.map((l) => ({ ...l, order_id: order.id })));
  if (itemsErr) throw new Error(itemsErr.message);

  return { orderId: order.id, subtotal, deliveryFee, total, currency: restaurant.currency };
}

/* ---------------- Admin review ---------------- */

async function assertAdmin(userId: string) {
  if (!(await isAdmin(userId))) throw new Response("Forbidden", { status: 403 });
}

export async function adminListApplications(userId: string, status: string) {
  await assertAdmin(userId);
  let q = supabaseAdmin
    .from("restaurant_applications")
    .select(
      "id,status,created_at,reviewed_at,rejection_reason,requested_changes,admin_notes,restaurant_id,submitted_data,restaurants(name,slug,cuisine,address,phone,email,owner_name,logo_url,approval_status)",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (status !== "all") q = q.eq("status", status as never);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function adminReviewApplication(
  userId: string,
  input: {
    applicationId: string;
    decision: "approved" | "rejected" | "changes_requested" | "suspended";
    notes?: string | undefined;
  },
) {
  await assertAdmin(userId);
  const { data: app } = await supabaseAdmin
    .from("restaurant_applications")
    .select("id,restaurant_id")
    .eq("id", input.applicationId)
    .maybeSingle();
  if (!app) throw new Response("Application not found", { status: 404 });

  await supabaseAdmin
    .from("restaurant_applications")
    .update({
      status: input.decision,
      admin_notes: input.notes ?? null,
      rejection_reason: input.decision === "rejected" ? (input.notes ?? null) : null,
      requested_changes: input.decision === "changes_requested" ? (input.notes ?? null) : null,
      reviewed_by: userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", input.applicationId);

  if (app.restaurant_id) {
    await supabaseAdmin
      .from("restaurants")
      .update({
        approval_status: input.decision,
        is_verified: input.decision === "approved",
      })
      .eq("id", app.restaurant_id);
  }

  await auditLog({
    actor_id: userId,
    action: "restaurant_application_reviewed",
    target_table: "restaurant_applications",
    target_id: input.applicationId,
    metadata: { decision: input.decision },
  });

  return { ok: true };
}
