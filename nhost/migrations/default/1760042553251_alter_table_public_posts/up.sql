ALTER TABLE public.posts ADD features jsonb DEFAULT jsonb_build_object() NOT NULL;
