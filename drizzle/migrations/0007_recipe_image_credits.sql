INSERT INTO public.app_settings(key, value, description) VALUES
 ('free_ai_images_per_day', '5'::jsonb, 'AI recipe photos a free user can trigger per day'),
 ('premium_ai_images_per_day', '50'::jsonb, 'AI recipe photos a premium user can trigger per day')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.consume_image_credit(_user_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
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
REVOKE EXECUTE ON FUNCTION public.consume_image_credit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_image_credit(uuid) TO service_role;