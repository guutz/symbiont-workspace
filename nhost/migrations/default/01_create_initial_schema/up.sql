-- Symbiont CMS: Nhost Database Migration (v2 - Multi-Tenant Ready)

-- Step 2: Create the posts table with multi-tenant support
CREATE TABLE public.posts (
  -- Core Fields
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Multi-Tenant Identifier
  source_id TEXT NOT NULL, -- e.g., 'personal-blog', 'newspaper'

  -- Notion-Specific Fields
  notion_page_id TEXT NOT NULL, -- The Notion Page UUID
  notion_short_id TEXT NOT NULL, -- The "Unique ID" property from Notion
  
  -- Content Fields
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT,
  publish_at TIMESTAMPTZ,
  tags TEXT[],

  -- A post must have a slug that is unique to its source
  UNIQUE (source_id, slug),
  
  -- A post must have a Notion Page ID that is unique to its source
  UNIQUE (source_id, notion_page_id),

  -- A post must have a Notion Short ID that is unique to its source
  UNIQUE (source_id, notion_short_id)
);

-- Step 3: Create the helper function and trigger for `updated_at`
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_posts_updated
BEFORE UPDATE ON public.posts
FOR EACH ROW
EXECUTE PROCEDURE public.handle_updated_at();

-- Step 4: Add indexes for performance
CREATE INDEX ON public.posts (source_id);
CREATE INDEX ON public.posts (publish_at);

-- NOTE: API security (e.g., allowing public access to only published posts)
-- is not handled here. It MUST be configured in Hasura's permissions,
-- which are stored in the .yaml files within the /nhost/metadata/ directory.