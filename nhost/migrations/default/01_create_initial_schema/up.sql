-- Step 1: Enable the pgcrypto extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

-- Step 2: Create the posts table
CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  notion_page_id TEXT UNIQUE,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title TEXT NOT NULL,
  content TEXT,
  custom_id TEXT,
  publish_at TIMESTAMPTZ,
  tags TEXT[]
);

-- Step 3: Create the helper function and trigger
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

-- Step 4: Add indexes and enable RLS
CREATE INDEX ON public.posts (slug);
CREATE INDEX ON public.posts (publish_at);
ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

-- Step 5: CREATE THE SECURITY POLICY (The "Open" Sign)
-- This is the rule that allows the public to read published posts.
CREATE POLICY "Allow public read access to published posts"
ON public.posts FOR SELECT -- This rule only applies to SELECT (read) queries
TO public -- Explicitly specify this applies to the public role
USING (
  -- The condition for allowing access:
  publish_at IS NOT NULL AND publish_at <= CURRENT_TIMESTAMP
);
