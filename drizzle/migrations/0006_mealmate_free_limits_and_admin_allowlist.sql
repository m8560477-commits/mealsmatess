CREATE TABLE IF NOT EXISTS public.app_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID
);
GRANT SELECT ON public.app_settings TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO service_role;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone reads app settings" ON public.app_settings FOR SELECT USING (true);
CREATE POLICY "Admins manage app settings" ON public.app_settings FOR ALL TO authenticated
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
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT COALESCE((SELECT (value #>> '{}')::integer FROM public.app_settings WHERE key=_key), _default)
$$;

CREATE OR REPLACE FUNCTION public.consume_ai_credit(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
REVOKE ALL ON FUNCTION public.consume_ai_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_ai_credit(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.my_ai_usage()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
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
REVOKE ALL ON FUNCTION public.my_ai_usage() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_ai_usage() TO authenticated;

CREATE OR REPLACE FUNCTION public.enforce_favorite_limit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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

CREATE TABLE IF NOT EXISTS public.admin_allowlist (
  email TEXT PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.admin_allowlist TO service_role;
ALTER TABLE public.admin_allowlist ENABLE ROW LEVEL SECURITY;
INSERT INTO public.admin_allowlist(email) VALUES ('tatendamkhwanazi6@gmail.com') ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.grant_allowlisted_admin()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.admin_allowlist a WHERE lower(a.email)=lower(NEW.email)) THEN
    INSERT INTO public.user_roles(user_id, role) VALUES (NEW.id, 'admin') ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER on_auth_user_admin_allowlist
  AFTER INSERT OR UPDATE OF email_confirmed_at, email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.grant_allowlisted_admin();

INSERT INTO public.user_roles(user_id, role)
SELECT u.id, 'admin'::public.app_role FROM auth.users u
JOIN public.admin_allowlist a ON lower(a.email)=lower(u.email)
WHERE u.email_confirmed_at IS NOT NULL
ON CONFLICT (user_id, role) DO NOTHING;