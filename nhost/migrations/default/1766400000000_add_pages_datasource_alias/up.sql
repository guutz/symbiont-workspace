-- Add public alias column for datasource to support client-side queries without exposing Notion database UUIDs
ALTER TABLE public.pages
ADD COLUMN datasource_alias TEXT;

-- Backfill existing rows with datasource_id for compatibility (will be overwritten on next sync)
UPDATE public.pages
SET datasource_alias = datasource_id
WHERE datasource_alias IS NULL;

-- Require alias going forward
ALTER TABLE public.pages
ALTER COLUMN datasource_alias SET NOT NULL;

-- Indexes for public queries
CREATE INDEX idx_pages_datasource_alias ON public.pages(datasource_alias);
CREATE INDEX idx_pages_datasource_alias_slug ON public.pages(datasource_alias, slug);

-- Uniqueness per alias + slug (mirrors datasource_id + slug constraint)
ALTER TABLE public.pages
ADD CONSTRAINT pages_datasource_alias_slug_key UNIQUE (datasource_alias, slug);

-- Documentation
COMMENT ON COLUMN public.pages.datasource_alias IS 'Non-secret alias for datasource (used by public queries).';
