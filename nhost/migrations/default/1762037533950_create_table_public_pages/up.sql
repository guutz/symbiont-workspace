-- Create the pages table (replacing old posts table)
CREATE TABLE public.pages (
  -- Primary Key: Notion page ID (already unique, simpler than UUID)
  page_id TEXT NOT NULL PRIMARY KEY,
  
  -- Multi-tenant identifier (which Notion database this came from)
  datasource_id TEXT NOT NULL,
  
  -- Core content fields
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT,
  
  -- Publishing metadata
  publish_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Structured metadata (arrays stored as JSONB for flexibility)
  tags JSONB DEFAULT '[]'::jsonb,
  authors JSONB DEFAULT '[]'::jsonb,
  
  -- Flexible metadata (cover images, layout config, custom fields)
  meta JSONB DEFAULT '{}'::jsonb,
  
  -- Constraints
  -- Each datasource can only have one page with a given slug
  UNIQUE (datasource_id, slug)
);

-- Indexes for query performance (Hasura will use these!)
CREATE INDEX idx_pages_datasource ON public.pages(datasource_id);
CREATE INDEX idx_pages_datasource_slug ON public.pages(datasource_id, slug);
CREATE INDEX idx_pages_publish_at ON public.pages(publish_at);

-- GIN indexes for JSONB queries (search within meta, tags, authors)
CREATE INDEX idx_pages_meta ON public.pages USING GIN (meta);
CREATE INDEX idx_pages_tags ON public.pages USING GIN (tags);

-- Comments for documentation
COMMENT ON TABLE public.pages IS 'Content pages synced from Notion databases. Supports multi-tenant architecture with flexible JSONB metadata.';
COMMENT ON COLUMN public.pages.page_id IS 'Notion page UUID (primary key)';
COMMENT ON COLUMN public.pages.datasource_id IS 'Notion database ID (groups pages by source)';
COMMENT ON COLUMN public.pages.meta IS 'Flexible JSONB storage for cover images, layout config, custom fields, etc.';
