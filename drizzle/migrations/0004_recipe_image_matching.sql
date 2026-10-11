ALTER TABLE public.recipes
  ADD COLUMN IF NOT EXISTS image_source TEXT,
  ADD COLUMN IF NOT EXISTS image_query TEXT,
  ADD COLUMN IF NOT EXISTS image_confidence INTEGER,
  ADD COLUMN IF NOT EXISTS image_attribution JSONB,
  ADD COLUMN IF NOT EXISTS image_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS image_signature TEXT,
  ADD COLUMN IF NOT EXISTS image_locked BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE public.image_search_cache (
  cache_key TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  query TEXT NOT NULL,
  results JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.image_search_cache TO service_role;
ALTER TABLE public.image_search_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Backend manages image search cache" ON public.image_search_cache FOR ALL TO service_role USING (true) WITH CHECK (true);