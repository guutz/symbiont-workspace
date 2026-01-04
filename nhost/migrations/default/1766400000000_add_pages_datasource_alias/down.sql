-- Remove alias support (revert)
ALTER TABLE public.pages
DROP CONSTRAINT IF EXISTS pages_datasource_alias_slug_key;

DROP INDEX IF EXISTS idx_pages_datasource_alias_slug;
DROP INDEX IF EXISTS idx_pages_datasource_alias;

ALTER TABLE public.pages
DROP COLUMN IF EXISTS datasource_alias;
