alter table "public"."pages" add constraint "pages_datasource_id_slug_key" unique ("datasource_id", "slug");
