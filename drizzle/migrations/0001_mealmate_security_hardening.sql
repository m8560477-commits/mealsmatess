CREATE POLICY "Backend manages audit logs" ON public.audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Backend manages payments" ON public.payments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Backend manages promo codes" ON public.promo_codes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Backend manages rate limits" ON public.rate_limits FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Backend manages subscription events" ON public.subscription_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

ALTER FUNCTION public.can_access_order(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.is_restaurant_member(uuid, uuid) SET SCHEMA private;
GRANT EXECUTE ON FUNCTION private.can_access_order(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.is_restaurant_member(uuid, uuid) TO authenticated, service_role;

DROP POLICY "Order users access items" ON public.order_items;
CREATE POLICY "Order users access items" ON public.order_items FOR ALL TO authenticated USING(private.can_access_order(order_id,auth.uid())) WITH CHECK(private.can_access_order(order_id,auth.uid()));
DROP POLICY "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL TO authenticated USING(private.has_role(auth.uid(),'admin')) WITH CHECK(private.has_role(auth.uid(),'admin'));
DROP POLICY "Customers view orders" ON public.restaurant_orders;
CREATE POLICY "Customers view orders" ON public.restaurant_orders FOR SELECT TO authenticated USING(customer_id=auth.uid() OR private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin'));
DROP POLICY "Team updates orders" ON public.restaurant_orders;
CREATE POLICY "Team updates orders" ON public.restaurant_orders FOR UPDATE TO authenticated USING(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin'));
DROP POLICY "Users read staff memberships" ON public.restaurant_staff;
CREATE POLICY "Users read staff memberships" ON public.restaurant_staff FOR SELECT TO authenticated USING(user_id=auth.uid() OR private.has_role(auth.uid(),'admin'));
DROP POLICY "Team manages restaurants" ON public.restaurants;
CREATE POLICY "Team manages restaurants" ON public.restaurants FOR ALL TO authenticated USING(owner_id=auth.uid() OR private.is_restaurant_member(auth.uid(),id) OR private.has_role(auth.uid(),'admin')) WITH CHECK(owner_id=auth.uid() OR private.has_role(auth.uid(),'admin'));
DROP POLICY "Team manages menus" ON public.restaurant_menus;
CREATE POLICY "Team manages menus" ON public.restaurant_menus FOR ALL TO authenticated USING(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin')) WITH CHECK(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin'));
DROP POLICY "Team manages items" ON public.menu_items;
CREATE POLICY "Team manages items" ON public.menu_items FOR ALL TO authenticated USING(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin')) WITH CHECK(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin'));
DROP POLICY "Team manages locations" ON public.restaurant_locations;
CREATE POLICY "Team manages locations" ON public.restaurant_locations FOR ALL TO authenticated USING(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin')) WITH CHECK(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin'));

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_dish_search(text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_premium(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_premium(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.recalc_recipe_rating(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_rate_limit(text, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_dish_search(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_premium(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.recalc_recipe_rating(uuid) TO service_role;
