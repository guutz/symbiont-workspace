# Alias column memo

- Problem: Public queries used the human alias while the `pages` table only stored Notion database UUIDs in `datasource_id`, so local/dev sites returned zero posts unless the UUID was exposed.
- Schema fix: Added `datasource_alias` (TEXT, NOT NULL) to `public.pages`, indexed it (`alias`, `alias+slug`), and made it unique per slug. Existing rows are backfilled to `datasource_id` for compatibility until a resync writes the real alias.
- API fix: Public client queries now filter by alias with a fallback to UUID (`_or` on `datasource_alias` / `datasource_id`) and select the alias field. Post type includes `datasource_alias`.
- Sync fix: Upserts now write `datasource_alias` from config; admin upserts update the alias on conflict to keep data consistent.
- UX implications: Aliases stay the public-facing, memorable handle; UUIDs stay private to the server. Multi-database setups remain deterministic—slug uniqueness enforced on both `(datasource_id, slug)` and `(datasource_alias, slug)`.
- What users of Symbiont do: Provide an alias per Notion DB (already required). Out of the box, public queries default to the first alias; pass `alias` explicitly when needed. After pulling this change, run a sync so rows get the human alias instead of the UUID; posts will still resolve via fallback in the meantime.
- Customizability vs defaults: The alias column keeps the “sensible default” (first alias) path working for simple sites while letting advanced users juggle multiple datasources without leaking secrets.

## Follow-up notes
- `PostData` vs `Post`: keep both; `PostData` is the server insert/update shape (non-nullables where the DB requires), while `Post` is the public/read shape mirroring what Hasura returns (nullable and client-friendly). They diverge by design; merging would blur constraints.
- Privacy tightened: public queries now filter solely by `datasource_alias` and no longer return `datasource_id`; public/user select permissions drop the UUID column. If we need a transitional fallback, we can add a server-only resolver, but client GraphQL stays alias-only.
- Table name configurability: Hasura auto-generates field/constraint names from the table name (e.g., `insert_pages_one`, `pages_datasource_alias_slug_key`). Making it configurable would cascade through queries, types, metadata, and migration naming—high churn for little gain. Recommend keeping `pages` fixed.
- Query helpers: we keep query builders separate from `client.request` calls for composability/testing; inlining them would reduce a few lines but couples concerns and hurts reuse across admin vs public clients.
- Unused result types: removed `GetPostBySlugResult` and `GetAllPostsResult` from client queries; not used anywhere.
- Public query helper: added `runPublicQuery` to centralize the GraphQL `request` call for client-side queries, keeping builders reusable while shrinking call-site boilerplate.
- Public query helper (updated): `runPublicQuery` now wraps both query building and execution, injecting the alias default and variables in one place while preserving reuse of the builder functions.
- Public query helper (final): `runPublicPagesQuery` handles config load, alias resolution (caller override or default), query building, and execution; the public APIs are now thin wrappers over this helper.
- Table name constant: client query builders now interpolate a single `PAGES_TABLE` constant (default `pages`); changing it still requires aligned Hasura metadata/migrations, but the literal now lives in one place.
