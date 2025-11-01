ALTER TABLE public.posts ALTER COLUMN features DROP NOT NULL;
ALTER TABLE public.posts ADD layout_config jsonb DEFAULT jsonb_build_object();
