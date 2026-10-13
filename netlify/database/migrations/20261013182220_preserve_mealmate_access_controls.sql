CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('mealmate.user_id', true), '')::uuid $$;
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER LANGUAGE plpgsql SET search_path=public AS $$ BEGIN NEW.updated_at=now(); RETURN NEW; END; $$;
CREATE OR REPLACE FUNCTION public.has_role(user_id uuid,_role public.app_role) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.user_roles ur WHERE ur.user_id=has_role.user_id AND ur.role=_role) $$;
CREATE OR REPLACE FUNCTION public.is_restaurant_member(_user_id uuid,_restaurant_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.restaurant_staff s WHERE s.user_id=_user_id AND s.restaurant_id=_restaurant_id) $$;
CREATE OR REPLACE FUNCTION public.can_access_order(_order_id uuid,_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.restaurant_orders o WHERE o.id=_order_id AND (o.customer_id=_user_id OR public.is_restaurant_member(_user_id,o.restaurant_id) OR public.has_role(_user_id,'admin'))) $$;
CREATE OR REPLACE FUNCTION public.check_rate_limit(_bucket text,_identifier text,_max_per_minute integer) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path=public AS $$ DECLARE n integer; BEGIN INSERT INTO public.rate_limits(bucket,identifier,window_start,count) VALUES(_bucket,_identifier,date_trunc('minute',now()),1) ON CONFLICT(bucket,identifier,window_start) DO UPDATE SET count=rate_limits.count+1 RETURNING count INTO n; RETURN n<=_max_per_minute; END $$;
CREATE OR REPLACE FUNCTION public.increment_dish_search(_name text) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path=public AS $$ DECLARE n integer; BEGIN INSERT INTO public.dish_searches(name,count,updated_at) VALUES(lower(trim(_name)),1,now()) ON CONFLICT(name) DO UPDATE SET count=dish_searches.count+1,updated_at=now() RETURNING count INTO n; RETURN n; END $$;
CREATE OR REPLACE FUNCTION public.is_premium(_user_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path=public AS $$ SELECT EXISTS(SELECT 1 FROM public.subscriptions s WHERE s.user_id=_user_id AND s.status IN ('trialing','active','in_grace') AND (s.tier='lifetime' OR s.period_end IS NULL OR s.period_end>now())) $$;
CREATE OR REPLACE FUNCTION public.recalc_recipe_rating(_recipe_id uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path=public AS $$ UPDATE public.recipes SET avg_rating=(SELECT avg(rating) FROM public.recipe_ratings WHERE recipe_id=_recipe_id),rating_count=(SELECT count(*) FROM public.recipe_ratings WHERE recipe_id=_recipe_id) WHERE id=_recipe_id $$;
CREATE POLICY "Public reads recipes" ON public.recipes FOR SELECT USING(true);
CREATE POLICY "Public reads announcements" ON public.announcements FOR SELECT USING(true);
CREATE POLICY "Public reads feature flags" ON public.feature_flags FOR SELECT USING(true);
CREATE POLICY "Public reads premium features" ON public.premium_features FOR SELECT USING(true);
CREATE POLICY "Public reads challenges" ON public.challenges FOR SELECT USING(true);
CREATE POLICY "Public reads dish searches" ON public.dish_searches FOR SELECT USING(true);
CREATE POLICY "Public reads hashtags" ON public.hashtags FOR SELECT USING(true);
CREATE POLICY "Public reads approved restaurants" ON public.restaurants FOR SELECT USING(approval_status='approved');
CREATE POLICY "Public reads active menus" ON public.restaurant_menus FOR SELECT USING(is_active=true AND EXISTS(SELECT 1 FROM public.restaurants r WHERE r.id=restaurant_id AND r.approval_status='approved'));
CREATE POLICY "Public reads available menu items" ON public.menu_items FOR SELECT USING(is_available=true AND is_hidden=false AND EXISTS(SELECT 1 FROM public.restaurants r WHERE r.id=restaurant_id AND r.approval_status='approved'));
CREATE POLICY "Public reads profiles" ON public.profiles FOR SELECT USING(true);
CREATE POLICY "Public reads visible posts" ON public.posts FOR SELECT USING(is_hidden=false);
CREATE POLICY "Public reads visible comments" ON public.post_comments FOR SELECT USING(is_hidden=false);
CREATE POLICY "Public reads post hashtags" ON public.post_hashtags FOR SELECT USING(true);
CREATE POLICY "Public reads reviews" ON public.restaurant_reviews FOR SELECT USING(true);
CREATE POLICY "Users manage own profiles" ON public.profiles FOR ALL USING(id=auth.uid()) WITH CHECK(id=auth.uid());
CREATE POLICY "Users manage own favorites" ON public.favorites FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users manage own groceries" ON public.grocery_items FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users manage own pantry" ON public.pantry_items FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users manage own meal plans" ON public.meal_plans FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users manage own nutrition" ON public.nutrition_logs FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users manage own viewed" ON public.recently_viewed FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users manage own ratings" ON public.recipe_ratings FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users manage own posts" ON public.posts FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users manage own comments" ON public.post_comments FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users manage own likes" ON public.post_likes FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users manage own saves" ON public.post_saves FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users manage own follows" ON public.follows FOR ALL USING(follower_id=auth.uid()) WITH CHECK(follower_id=auth.uid());
CREATE POLICY "Users manage own subscriptions" ON public.subscriptions FOR SELECT USING(user_id=auth.uid());
CREATE POLICY "Users manage own usage" ON public.usage_limits FOR SELECT USING(user_id=auth.uid());
CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT USING(user_id=auth.uid());
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING(public.has_role(auth.uid(),'admin')) WITH CHECK(public.has_role(auth.uid(),'admin'));
CREATE POLICY "Customers view orders" ON public.restaurant_orders FOR SELECT USING(customer_id=auth.uid() OR public.is_restaurant_member(auth.uid(),restaurant_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Customers create orders" ON public.restaurant_orders FOR INSERT WITH CHECK(customer_id=auth.uid());
CREATE POLICY "Team updates orders" ON public.restaurant_orders FOR UPDATE USING(public.is_restaurant_member(auth.uid(),restaurant_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Order users access items" ON public.order_items FOR ALL USING(public.can_access_order(order_id,auth.uid())) WITH CHECK(public.can_access_order(order_id,auth.uid()));
CREATE POLICY "Users read staff memberships" ON public.restaurant_staff FOR SELECT USING(user_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Team manages restaurants" ON public.restaurants FOR ALL USING(owner_id=auth.uid() OR public.is_restaurant_member(auth.uid(),id) OR public.has_role(auth.uid(),'admin')) WITH CHECK(owner_id=auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Team manages menus" ON public.restaurant_menus FOR ALL USING(public.is_restaurant_member(auth.uid(),restaurant_id) OR public.has_role(auth.uid(),'admin')) WITH CHECK(public.is_restaurant_member(auth.uid(),restaurant_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Team manages items" ON public.menu_items FOR ALL USING(public.is_restaurant_member(auth.uid(),restaurant_id) OR public.has_role(auth.uid(),'admin')) WITH CHECK(public.is_restaurant_member(auth.uid(),restaurant_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Team manages locations" ON public.restaurant_locations FOR ALL USING(public.is_restaurant_member(auth.uid(),restaurant_id) OR public.has_role(auth.uid(),'admin')) WITH CHECK(public.is_restaurant_member(auth.uid(),restaurant_id) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "Users add reviews" ON public.restaurant_reviews FOR INSERT WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users edit reviews" ON public.restaurant_reviews FOR UPDATE USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users delete reviews" ON public.restaurant_reviews FOR DELETE USING(user_id=auth.uid());
CREATE POLICY "Users apply as restaurant" ON public.restaurant_applications FOR ALL USING(applicant_id=auth.uid()) WITH CHECK(applicant_id=auth.uid());
CREATE POLICY "Users read achievements" ON public.user_achievements FOR SELECT USING(user_id=auth.uid());
CREATE POLICY "Users read challenges" ON public.user_challenges FOR SELECT USING(user_id=auth.uid());
CREATE POLICY "Users read stats" ON public.user_stats FOR SELECT USING(user_id=auth.uid());
CREATE POLICY "Users read xp" ON public.xp_events FOR SELECT USING(user_id=auth.uid());
CREATE POLICY "Users manage referral code" ON public.referral_codes FOR ALL USING(user_id=auth.uid()) WITH CHECK(user_id=auth.uid());
CREATE POLICY "Users read referrals" ON public.referrals FOR SELECT USING(referrer_id=auth.uid() OR referred_id=auth.uid());
CREATE POLICY "Users read promo redemptions" ON public.promo_redemptions FOR SELECT USING(user_id=auth.uid());
CREATE POLICY "Users add telemetry" ON public.telemetry_events FOR INSERT WITH CHECK(user_id=auth.uid() OR user_id IS NULL);
CREATE POLICY "Users read own telemetry" ON public.telemetry_events FOR SELECT USING(user_id=auth.uid());
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_recipes_updated_at BEFORE UPDATE ON public.recipes FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_restaurants_updated_at BEFORE UPDATE ON public.restaurants FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_locations_updated_at BEFORE UPDATE ON public.restaurant_locations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_menus_updated_at BEFORE UPDATE ON public.restaurant_menus FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_items_updated_at BEFORE UPDATE ON public.menu_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_orders_updated_at BEFORE UPDATE ON public.restaurant_orders FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON public.subscriptions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_flags_updated_at BEFORE UPDATE ON public.feature_flags FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_ratings_updated_at BEFORE UPDATE ON public.recipe_ratings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
ALTER TABLE public.favorites ADD FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;
ALTER TABLE public.grocery_items ADD FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;
ALTER TABLE public.meal_plans ADD FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;
ALTER TABLE public.nutrition_logs ADD FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;
ALTER TABLE public.recently_viewed ADD FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;
ALTER TABLE public.recipe_ratings ADD FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_locations ADD FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_menus ADD FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.menu_items ADD FOREIGN KEY (menu_id) REFERENCES public.restaurant_menus(id) ON DELETE SET NULL;
ALTER TABLE public.menu_items ADD FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_staff ADD FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_orders ADD FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.order_items ADD FOREIGN KEY (menu_item_id) REFERENCES public.menu_items(id) ON DELETE SET NULL;
ALTER TABLE public.order_items ADD FOREIGN KEY (order_id) REFERENCES public.restaurant_orders(id) ON DELETE CASCADE;
ALTER TABLE public.restaurant_reviews ADD FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.posts ADD FOREIGN KEY (recipe_id) REFERENCES public.recipes(id) ON DELETE SET NULL;
ALTER TABLE public.post_comments ADD FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE public.post_hashtags ADD FOREIGN KEY (hashtag_id) REFERENCES public.hashtags(id) ON DELETE CASCADE;
ALTER TABLE public.post_hashtags ADD FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE public.post_likes ADD FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE public.post_saves ADD FOREIGN KEY (post_id) REFERENCES public.posts(id) ON DELETE CASCADE;
ALTER TABLE public.promo_redemptions ADD FOREIGN KEY (code_id) REFERENCES public.promo_codes(id) ON DELETE CASCADE;
ALTER TABLE public.user_challenges ADD FOREIGN KEY (challenge_id) REFERENCES public.challenges(id) ON DELETE CASCADE;
CREATE SCHEMA IF NOT EXISTS private;
ALTER FUNCTION public.can_access_order(uuid, uuid) SET SCHEMA private;
ALTER FUNCTION public.has_role(uuid, public.app_role) SET SCHEMA private;
ALTER FUNCTION public.is_restaurant_member(uuid, uuid) SET SCHEMA private;
DROP POLICY "Order users access items" ON public.order_items;
CREATE POLICY "Order users access items" ON public.order_items FOR ALL USING(private.can_access_order(order_id,auth.uid())) WITH CHECK(private.can_access_order(order_id,auth.uid()));
DROP POLICY "Admins manage roles" ON public.user_roles;
CREATE POLICY "Admins manage roles" ON public.user_roles FOR ALL USING(private.has_role(auth.uid(),'admin')) WITH CHECK(private.has_role(auth.uid(),'admin'));
DROP POLICY "Customers view orders" ON public.restaurant_orders;
CREATE POLICY "Customers view orders" ON public.restaurant_orders FOR SELECT USING(customer_id=auth.uid() OR private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin'));
DROP POLICY "Team updates orders" ON public.restaurant_orders;
CREATE POLICY "Team updates orders" ON public.restaurant_orders FOR UPDATE USING(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin'));
DROP POLICY "Users read staff memberships" ON public.restaurant_staff;
CREATE POLICY "Users read staff memberships" ON public.restaurant_staff FOR SELECT USING(user_id=auth.uid() OR private.has_role(auth.uid(),'admin'));
DROP POLICY "Team manages restaurants" ON public.restaurants;
CREATE POLICY "Team manages restaurants" ON public.restaurants FOR ALL USING(owner_id=auth.uid() OR private.is_restaurant_member(auth.uid(),id) OR private.has_role(auth.uid(),'admin')) WITH CHECK(owner_id=auth.uid() OR private.has_role(auth.uid(),'admin'));
DROP POLICY "Team manages menus" ON public.restaurant_menus;
CREATE POLICY "Team manages menus" ON public.restaurant_menus FOR ALL USING(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin')) WITH CHECK(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin'));
DROP POLICY "Team manages items" ON public.menu_items;
CREATE POLICY "Team manages items" ON public.menu_items FOR ALL USING(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin')) WITH CHECK(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin'));
DROP POLICY "Team manages locations" ON public.restaurant_locations;
CREATE POLICY "Team manages locations" ON public.restaurant_locations FOR ALL USING(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin')) WITH CHECK(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin'));
CREATE POLICY "Anyone can view active promotions of approved restaurants" ON public.restaurant_promotions FOR SELECT USING (is_active=true AND EXISTS(SELECT 1 FROM public.restaurants r WHERE r.id=restaurant_id AND r.approval_status='approved'));
CREATE POLICY "Restaurant team manages its promotions" ON public.restaurant_promotions FOR ALL USING(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin')) WITH CHECK(private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin'));
CREATE TRIGGER restaurant_promotions_updated_at BEFORE UPDATE ON public.restaurant_promotions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE UNIQUE INDEX restaurant_promotions_code_uq ON public.restaurant_promotions(restaurant_id,lower(code)) WHERE code IS NOT NULL;
CREATE POLICY "Customer or restaurant team can view redemptions" ON public.promotion_redemptions FOR SELECT USING(user_id=auth.uid() OR private.is_restaurant_member(auth.uid(),restaurant_id) OR private.has_role(auth.uid(),'admin'));
CREATE POLICY "Anyone can view branches of approved restaurants" ON public.restaurant_locations FOR SELECT USING(EXISTS(SELECT 1 FROM public.restaurants r WHERE r.id=restaurant_id AND r.approval_status='approved'));
CREATE INDEX idx_menu_items_restaurant_visible ON public.menu_items(restaurant_id,is_hidden,sort_order);
CREATE INDEX idx_orders_restaurant_status ON public.restaurant_orders(restaurant_id,status,placed_at DESC);
CREATE INDEX idx_orders_customer ON public.restaurant_orders(customer_id,placed_at DESC);
CREATE INDEX idx_promotions_restaurant_active ON public.restaurant_promotions(restaurant_id,is_active);
CREATE INDEX idx_promo_redemptions_user ON public.promotion_redemptions(promotion_id,user_id);
CREATE INDEX idx_branches_restaurant ON public.restaurant_locations(restaurant_id,is_active);
ALTER TABLE public.restaurant_promotions ADD FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.promotion_redemptions ADD FOREIGN KEY (promotion_id) REFERENCES public.restaurant_promotions(id) ON DELETE CASCADE;
ALTER TABLE public.promotion_redemptions ADD FOREIGN KEY (restaurant_id) REFERENCES public.restaurants(id) ON DELETE CASCADE;
ALTER TABLE public.promotion_redemptions ADD FOREIGN KEY (order_id) REFERENCES public.restaurant_orders(id) ON DELETE SET NULL;
ALTER TABLE public.menu_items ADD FOREIGN KEY (branch_id) REFERENCES public.restaurant_locations(id) ON DELETE SET NULL;
ALTER TABLE public.restaurant_orders ADD FOREIGN KEY (branch_id) REFERENCES public.restaurant_locations(id) ON DELETE SET NULL;
CREATE UNIQUE INDEX IF NOT EXISTS usage_limits_user_feature_period_uq ON public.usage_limits(user_id,feature_key,period_key);
CREATE UNIQUE INDEX IF NOT EXISTS user_challenges_user_challenge_period_uq ON public.user_challenges(user_id,challenge_id,period_key);
CREATE UNIQUE INDEX IF NOT EXISTS xp_events_dedupe_key_uq ON public.xp_events(dedupe_key);
CREATE UNIQUE INDEX IF NOT EXISTS restaurant_orders_order_number_uq ON public.restaurant_orders(order_number);
DROP POLICY IF EXISTS "Public reads profiles" ON public.profiles;
DROP POLICY IF EXISTS "Public reads dish searches" ON public.dish_searches;
DROP POLICY IF EXISTS "Anyone reads active placements" ON public.ad_placements;
CREATE POLICY "Anyone reads active placements"
  ON public.ad_placements FOR SELECT
  USING (is_active = true);
CREATE TRIGGER update_ad_placements_updated_at
  BEFORE UPDATE ON public.ad_placements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE INDEX IF NOT EXISTS ad_placements_slot_idx ON public.ad_placements (slot) WHERE is_active;
ALTER TABLE public.subscription_events ADD FOREIGN KEY (subscription_id) REFERENCES public.subscriptions(id) ON DELETE SET NULL;
CREATE POLICY "Anyone reads app settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage app settings" ON public.app_settings FOR ALL
  USING (private.has_role(auth.uid(),'admin')) WITH CHECK (private.has_role(auth.uid(),'admin'));
CREATE TRIGGER update_app_settings_updated_at BEFORE UPDATE ON public.app_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
INSERT INTO public.app_settings(key, value, description) VALUES
  ('free_ai_per_day', '3'::jsonb, 'Mia AI requests per day on the Free plan'),
  ('free_ai_per_month', '12'::jsonb, 'Mia AI requests per month on the Free plan'),
  ('free_max_favorites', '10'::jsonb, 'Saved favourite recipes on the Free plan'),
  ('free_max_active_meal_plans', '2'::jsonb, 'Active weekly meal plans on the Free plan'),
  ('premium_ai_per_day', '100'::jsonb, 'Fair-use Mia AI requests per day on Premium')
ON CONFLICT (key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.setting_int(_key text, _default integer)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path=public AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::integer FROM public.app_settings WHERE key=_key), _default)
$$;
CREATE OR REPLACE FUNCTION public.consume_ai_credit(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path=public AS $$
DECLARE
  premium boolean := public.is_premium(_user_id);
  day_key text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD');
  month_key text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM');
  day_max integer; month_max integer; day_used integer; month_used integer;
  day_reset timestamptz := (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC';
  month_reset timestamptz := (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC';
BEGIN
  IF premium THEN
    day_max := public.setting_int('premium_ai_per_day', 100); month_max := NULL;
  ELSE
    day_max := public.setting_int('free_ai_per_day', 3);
    month_max := public.setting_int('free_ai_per_month', 12);
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('ai_credit:' || _user_id::text));
  SELECT COALESCE(SUM(count),0) INTO day_used FROM public.usage_limits WHERE user_id=_user_id AND feature_key='ai_day' AND period_key=day_key;
  SELECT COALESCE(SUM(count),0) INTO month_used FROM public.usage_limits WHERE user_id=_user_id AND feature_key='ai_month' AND period_key=month_key;
  IF day_used >= day_max THEN
    RETURN jsonb_build_object('allowed',false,'reason','daily','premium',premium,'day_used',day_used,'day_max',day_max,'month_used',month_used,'month_max',month_max,'resets_at',day_reset);
  END IF;
  IF month_max IS NOT NULL AND month_used >= month_max THEN
    RETURN jsonb_build_object('allowed',false,'reason','monthly','premium',premium,'day_used',day_used,'day_max',day_max,'month_used',month_used,'month_max',month_max,'resets_at',month_reset);
  END IF;
  INSERT INTO public.usage_limits(user_id, feature, feature_key, period_key, period_start, count)
  VALUES (_user_id,'ai_day','ai_day',day_key,now(),1)
  ON CONFLICT (user_id,feature_key,period_key) DO UPDATE SET count=usage_limits.count+1, updated_at=now();
  INSERT INTO public.usage_limits(user_id, feature, feature_key, period_key, period_start, count)
  VALUES (_user_id,'ai_month','ai_month',month_key,now(),1)
  ON CONFLICT (user_id,feature_key,period_key) DO UPDATE SET count=usage_limits.count+1, updated_at=now();
  RETURN jsonb_build_object('allowed',true,'premium',premium,'day_used',day_used+1,'day_max',day_max,'month_used',month_used+1,'month_max',month_max);
END $$;
CREATE OR REPLACE FUNCTION public.my_ai_usage()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path=public AS $$
  SELECT jsonb_build_object(
    'premium', public.is_premium(auth.uid()),
    'day_used', COALESCE((SELECT SUM(count) FROM public.usage_limits WHERE user_id=auth.uid() AND feature_key='ai_day' AND period_key=to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD')),0),
    'month_used', COALESCE((SELECT SUM(count) FROM public.usage_limits WHERE user_id=auth.uid() AND feature_key='ai_month' AND period_key=to_char(now() AT TIME ZONE 'UTC','YYYY-MM')),0),
    'day_max', CASE WHEN public.is_premium(auth.uid()) THEN public.setting_int('premium_ai_per_day',100) ELSE public.setting_int('free_ai_per_day',3) END,
    'month_max', CASE WHEN public.is_premium(auth.uid()) THEN NULL ELSE public.setting_int('free_ai_per_month',12) END,
    'favorites_used', (SELECT count(*) FROM public.favorites WHERE user_id=auth.uid()),
    'favorites_max', CASE WHEN public.is_premium(auth.uid()) THEN NULL ELSE public.setting_int('free_max_favorites',10) END,
    'plans_used', (SELECT count(DISTINCT date_trunc('week', plan_date)) FROM public.meal_plans WHERE user_id=auth.uid() AND plan_date >= date_trunc('week', current_date)::date),
    'plans_max', CASE WHEN public.is_premium(auth.uid()) THEN NULL ELSE public.setting_int('free_max_active_meal_plans',2) END,
    'day_resets_at', (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC',
    'month_resets_at', (date_trunc('month', now() AT TIME ZONE 'UTC') + interval '1 month') AT TIME ZONE 'UTC'
  )
$$;
CREATE OR REPLACE FUNCTION public.enforce_favorite_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path=public AS $$
DECLARE n integer; mx integer;
BEGIN
  IF public.is_premium(NEW.user_id) THEN RETURN NEW; END IF;
  mx := public.setting_int('free_max_favorites', 10);
  SELECT count(*) INTO n FROM public.favorites WHERE user_id=NEW.user_id;
  IF n >= mx THEN
    RAISE EXCEPTION 'MEALMATE_LIMIT_FAVORITES: Free plan saves up to % favourite recipes', mx USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER favorites_free_limit BEFORE INSERT ON public.favorites FOR EACH ROW EXECUTE FUNCTION public.enforce_favorite_limit();
CREATE OR REPLACE FUNCTION public.enforce_meal_plan_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path=public AS $$
DECLARE n integer; mx integer; wk date := date_trunc('week', NEW.plan_date)::date;
BEGIN
  IF NEW.plan_date < date_trunc('week', current_date)::date OR public.is_premium(NEW.user_id) THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.meal_plans WHERE user_id=NEW.user_id AND date_trunc('week', plan_date)::date = wk) THEN RETURN NEW; END IF;
  mx := public.setting_int('free_max_active_meal_plans', 2);
  SELECT count(DISTINCT date_trunc('week', plan_date)) INTO n FROM public.meal_plans
    WHERE user_id=NEW.user_id AND plan_date >= date_trunc('week', current_date)::date;
  IF n >= mx THEN
    RAISE EXCEPTION 'MEALMATE_LIMIT_MEAL_PLANS: Free plan keeps up to % active weekly meal plans', mx USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER meal_plans_free_limit BEFORE INSERT ON public.meal_plans FOR EACH ROW EXECUTE FUNCTION public.enforce_meal_plan_limit();
INSERT INTO public.app_settings(key, value, description) VALUES
 ('free_ai_images_per_day', '5'::jsonb, 'AI recipe photos a free user can trigger per day'),
 ('premium_ai_images_per_day', '50'::jsonb, 'AI recipe photos a premium user can trigger per day')
ON CONFLICT (key) DO NOTHING;
CREATE OR REPLACE FUNCTION public.consume_image_credit(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET "mealmate.trusted" = 'true' SET search_path TO 'public' AS $$
DECLARE
  premium boolean := public.is_premium(_user_id);
  day_key text := to_char(now() AT TIME ZONE 'UTC','YYYY-MM-DD');
  mx integer; used integer;
  reset_at timestamptz := (date_trunc('day', now() AT TIME ZONE 'UTC') + interval '1 day') AT TIME ZONE 'UTC';
BEGIN
  mx := CASE WHEN premium THEN public.setting_int('premium_ai_images_per_day', 50) ELSE public.setting_int('free_ai_images_per_day', 5) END;
  PERFORM pg_advisory_xact_lock(hashtext('img_credit:' || _user_id::text));
  SELECT COALESCE(SUM(count),0) INTO used FROM public.usage_limits WHERE user_id=_user_id AND feature_key='img_day' AND period_key=day_key;
  IF used >= mx THEN
    RETURN jsonb_build_object('allowed',false,'premium',premium,'used',used,'max',mx,'resets_at',reset_at);
  END IF;
  INSERT INTO public.usage_limits(user_id, feature, feature_key, period_key, period_start, count)
  VALUES (_user_id,'img_day','img_day',day_key,now(),1)
  ON CONFLICT (user_id,feature_key,period_key) DO UPDATE SET count=usage_limits.count+1, updated_at=now();
  RETURN jsonb_build_object('allowed',true,'premium',premium,'used',used+1,'max',mx,'resets_at',reset_at);
END $$;
ALTER TABLE public.announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.announcements FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages announcements" ON public.announcements FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages audit_logs" ON public.audit_logs FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages challenges" ON public.challenges FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.dish_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dish_searches FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages dish_searches" ON public.dish_searches FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipes FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages recipes" ON public.recipes FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages profiles" ON public.profiles FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages user_roles" ON public.user_roles FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages favorites" ON public.favorites FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.grocery_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grocery_items FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages grocery_items" ON public.grocery_items FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meal_plans FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages meal_plans" ON public.meal_plans FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.nutrition_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.nutrition_logs FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages nutrition_logs" ON public.nutrition_logs FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.pantry_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pantry_items FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages pantry_items" ON public.pantry_items FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.recently_viewed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recently_viewed FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages recently_viewed" ON public.recently_viewed FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.recipe_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipe_ratings FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages recipe_ratings" ON public.recipe_ratings FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages feature_flags" ON public.feature_flags FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.premium_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.premium_features FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages premium_features" ON public.premium_features FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages rate_limits" ON public.rate_limits FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.restaurants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurants FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages restaurants" ON public.restaurants FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.restaurant_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_locations FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages restaurant_locations" ON public.restaurant_locations FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.restaurant_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_menus FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages restaurant_menus" ON public.restaurant_menus FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.menu_items FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages menu_items" ON public.menu_items FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.restaurant_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_staff FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages restaurant_staff" ON public.restaurant_staff FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.restaurant_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_orders FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages restaurant_orders" ON public.restaurant_orders FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages order_items" ON public.order_items FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.restaurant_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_applications FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages restaurant_applications" ON public.restaurant_applications FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.restaurant_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages restaurant_reviews" ON public.restaurant_reviews FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages subscriptions" ON public.subscriptions FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages payments" ON public.payments FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.subscription_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_events FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages subscription_events" ON public.subscription_events FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.usage_limits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.usage_limits FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages usage_limits" ON public.usage_limits FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.follows FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages follows" ON public.follows FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hashtags FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages hashtags" ON public.hashtags FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages posts" ON public.posts FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.post_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_comments FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages post_comments" ON public.post_comments FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.post_hashtags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_hashtags FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages post_hashtags" ON public.post_hashtags FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.post_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_likes FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages post_likes" ON public.post_likes FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.post_saves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_saves FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages post_saves" ON public.post_saves FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages promo_codes" ON public.promo_codes FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.promo_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_redemptions FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages promo_redemptions" ON public.promo_redemptions FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.referral_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referral_codes FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages referral_codes" ON public.referral_codes FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages referrals" ON public.referrals FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages user_achievements" ON public.user_achievements FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.user_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_challenges FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages user_challenges" ON public.user_challenges FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.user_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_stats FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages user_stats" ON public.user_stats FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.xp_events FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages xp_events" ON public.xp_events FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_events FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages telemetry_events" ON public.telemetry_events FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.restaurant_promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.restaurant_promotions FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages restaurant_promotions" ON public.restaurant_promotions FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.promotion_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promotion_redemptions FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages promotion_redemptions" ON public.promotion_redemptions FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.ad_placements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ad_placements FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages ad_placements" ON public.ad_placements FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.image_search_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.image_search_cache FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages image_search_cache" ON public.image_search_cache FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages app_settings" ON public.app_settings FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
ALTER TABLE public.admin_allowlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_allowlist FORCE ROW LEVEL SECURITY;
CREATE POLICY "Trusted server manages admin_allowlist" ON public.admin_allowlist FOR ALL USING (current_setting('mealmate.trusted', true) = 'true') WITH CHECK (current_setting('mealmate.trusted', true) = 'true');
