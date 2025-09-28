-- File: 01_create_initial_schema.sql

CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";

CREATE TABLE public.posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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

CREATE INDEX ON public.posts (slug);
CREATE INDEX ON public.posts (publish_at);

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;