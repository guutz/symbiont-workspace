
  create table "public"."pages" (
    "page_id" text not null,
    "title" text not null,
    "slug" text,
    "authors" jsonb default jsonb_build_array(),
    "tags" jsonb default jsonb_build_array(),
    "publish_at" timestamp with time zone,
    "meta" jsonb default jsonb_build_object(),
    "content" text,
    "updated_at" timestamp with time zone not null,
    "datasource_id" text not null,
    "datasource_alias" text not null
      );


CREATE INDEX idx_pages_datasource ON public.pages USING btree (datasource_id);

CREATE INDEX idx_pages_datasource_alias ON public.pages USING btree (datasource_alias);

CREATE INDEX idx_pages_datasource_alias_slug ON public.pages USING btree (datasource_alias, slug);

CREATE INDEX idx_pages_meta ON public.pages USING gin (meta);

CREATE INDEX idx_pages_publish_at ON public.pages USING btree (publish_at);

CREATE INDEX idx_pages_tags ON public.pages USING gin (tags);

CREATE UNIQUE INDEX pages_datasource_alias_slug_key ON public.pages USING btree (datasource_alias, slug);

CREATE UNIQUE INDEX pages_datasource_id_slug_key ON public.pages USING btree (datasource_id, slug);

CREATE UNIQUE INDEX pages_pkey ON public.pages USING btree (page_id);

alter table "public"."pages" add constraint "pages_pkey" PRIMARY KEY using index "pages_pkey";

alter table "public"."pages" add constraint "pages_datasource_alias_slug_key" UNIQUE using index "pages_datasource_alias_slug_key";

alter table "public"."pages" add constraint "pages_datasource_id_slug_key" UNIQUE using index "pages_datasource_id_slug_key";

set check_function_bodies = off;

CREATE OR REPLACE FUNCTION public.handle_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$function$
;

grant delete on table "public"."pages" to "anon";

grant insert on table "public"."pages" to "anon";

grant references on table "public"."pages" to "anon";

grant select on table "public"."pages" to "anon";

grant trigger on table "public"."pages" to "anon";

grant truncate on table "public"."pages" to "anon";

grant update on table "public"."pages" to "anon";

grant delete on table "public"."pages" to "authenticated";

grant insert on table "public"."pages" to "authenticated";

grant references on table "public"."pages" to "authenticated";

grant select on table "public"."pages" to "authenticated";

grant trigger on table "public"."pages" to "authenticated";

grant truncate on table "public"."pages" to "authenticated";

grant update on table "public"."pages" to "authenticated";

grant delete on table "public"."pages" to "service_role";

grant insert on table "public"."pages" to "service_role";

grant references on table "public"."pages" to "service_role";

grant select on table "public"."pages" to "service_role";

grant trigger on table "public"."pages" to "service_role";

grant truncate on table "public"."pages" to "service_role";

grant update on table "public"."pages" to "service_role";


