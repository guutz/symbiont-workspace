create extension if not exists "pg_net" with schema "extensions";


  create policy "Public pages read access"
  on "public"."pages"
  as permissive
  for select
  to public
using (((publish_at IS NOT NULL) AND (publish_at <= now())));



  create policy "Service role full access"
  on "public"."pages"
  as permissive
  for all
  to public
using ((auth.role() = 'service_role'::text))
with check ((auth.role() = 'service_role'::text));



