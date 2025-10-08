# QWER-Test + Symbiont Integration Guide

> Phase 1 of the zero-rebuild roadmap: the QWER demo app consumes live content from Symbiont CMS instead of generated JSON.

---

## 1. What lives where?

- **Symbiont CMS (`packages/symbiont-cms`)** – exposes sync handlers, markdown rendering, GraphQL helpers, and UI components.
- **QWER Test App (`packages/qwer-test`)** – consumes the package and renders the blog using QWER’s layouts/stores.
- **Nhost** – stores posts in `public.posts`; GraphQL queries filter by `source_id` (`short_db_ID`).

```
Notion page ─→ Symbiont sync ─→ Nhost Postgres ─→ `getPosts` / `postLoad` ─→ QWER UI
```

---

## 2. Wiring steps

1. **Build Symbiont** – `pnpm -F symbiont-cms build`. QWER pulls compiled JS from `dist/`.
2. **Expose config to the app** – ensure `symbiont.config.js` defines `primaryShortDbId` that matches the posts you want on the blog.
3. **Provide environment variables** – `packages/qwer-test/.env` needs `PUBLIC_NHOST_GRAPHQL_URL`. Secrets (admin secret, Notion key) stay in the workspace root `.env`.
4. **Start the dev server** – `pnpm -F qwer-test dev`.
5. **Sync data** – hit `/api/sync/poll-blog` or rely on the Notion webhook to populate Nhost.

---

## 3. Data flow inside QWER

### Homepage

`src/routes/+page.server.ts`

```ts
import { getPosts } from 'symbiont-cms/client';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ fetch }) => {
	const posts = await getPosts({ fetch, limit: 50 });
	return { posts }; // serialised to the client
};
```

`src/routes/+page.svelte`

```svelte
import { onMount } from 'svelte';
import { initializePostsFromServer } from '$lib/stores/posts';

export let data;

onMount(() => initializePostsFromServer(data.posts));
```

`src/lib/stores/posts.ts`

- falls back to `$generated/posts.json` if present
- otherwise uses the SSR payload supplied via `initializePostsFromServer`

### Individual post pages

`src/routes/[slug]/+page.server.ts`

```ts
export { postLoad as load } from 'symbiont-cms/server';
```

`postLoad` queries Hasura with the slug, runs `parseMarkdown`, and returns `{ post, html, toc, features }`. `PostPage` handles the layout while QWER-specific styling is passed through `classMap`.

### Feeds (Atom / JSON / Sitemap)

Each feed route shares a helper:

```ts
import { createSymbiontGraphQLClient, getAllPosts } from 'symbiont-cms/client';
import { loadConfig } from 'virtual:symbiont/config';

async function fetchPosts(fetch?: typeof globalThis.fetch) {
	const config = await loadConfig();
	const client = createSymbiontGraphQLClient(config.graphqlEndpoint, { fetch });
	return getAllPosts(client, { short_db_ID: config.primaryShortDbId });
}
```

The routes then map Symbiont posts into the format required by each feed.

---

## 4. Type alignment snapshot

| Symbiont (`Post`) | QWER (`Post.Post`) | Notes |
|--------------------|--------------------|-------|
| `slug` | `slug` | Used as the canonical key on both sides. |
| `title` (nullable) | `title` (string) | Provide a fallback when mapping. |
| `content` | `content` | Markdown string rendered by QWER components. |
| `publish_at` | `published` | Use `publish_at ?? new Date().toISOString()`. |
| `updated_at` | `updated` | Fall back to `publish_at` if null. |
| `tags` | `tags` | QWER expects an array; ensure you coerce to `[]`. |
| `summary`/`description` (optional) | `summary`/`description` | Populate if you extend the schema. |

See `TYPE_COMPATIBILITY.md` for the full table and enum mapping (`Post.CoverStyle`, etc.).

---

## 5. Using multiple databases

If `symbiont.config.js` defines several `databases[]`, you can override the default when fetching:

```ts
const posts = await getPosts({ fetch, shortDbId: 'documentation' });
```

In feeds, pass `short_db_ID` explicitly to `getAllPosts`. The QWER stores already handle per-source maps by keying on slug, so the only change is deciding which dataset to hydrate.

---

## 6. Handling empty/errored states

- `getPosts` returns an empty array if the GraphQL request fails (it logs and swallows the error). The homepage should render a "no posts" state gracefully.
- `postLoad` throws a SvelteKit `error(404)` when a slug isn’t found – QWER’s routes surface the default 404 page.
- If `PUBLIC_NHOST_GRAPHQL_URL` is absent, the server load functions bail early and return an empty result; you’ll see a warning in the terminal.

---

## 7. Optional enhancements

- **Pagination** – extend `getPosts({ limit, offset })` and feed into QWER’s filtering/ordering utilities.
- **Caching** – wrap GraphQL calls with an LRU cache or SvelteKit `depends` to avoid re-fetching on every request.
- **Search** – repoint the search worker to query Nhost instead of static JSON once you enable full-text indexing.
- **Preview mode** – expose a draft-only endpoint by filtering on `is_public` or status column in Hasura.

---

## 8. Checklist for new environments

- [ ] Configure `.env` in both the repo root and `packages/qwer-test/`
- [ ] Build `symbiont-cms`
- [ ] Run a manual sync (`/api/sync/poll-blog`) and confirm rows appear in `public.posts`
- [ ] Load homepage and verify posts render
- [ ] Visit `/feed.json` and `/sitemap.xml` to confirm they’re data-backed

---

## 9. Troubleshooting quick hits

| Issue | Fix |
|-------|-----|
| `Cannot find module 'symbiont-cms/…'` | Re-run `pnpm -F symbiont-cms build` so QWER sees the compiled output. |
| Homepage blank | Ensure `PUBLIC_NHOST_GRAPHQL_URL` is set, posts exist with `publish_at`, and no errors are logged during sync. |
| Notion edits not appearing | Webhook not configured? Use the manual poll endpoint or double-check Notion integration permissions. |
| Type mismatches in `+page.server.ts` | Import `Post` namespace as a value for enum access: `import { Post } from '$lib/types/post';` |

---

## 10. Reference material

- `symbiont-cms.md` – full package API and configuration notes
- `TYPE_COMPATIBILITY.md` – extended mapping table
- `markdown-compatibility.md` – supported syntax/features
- `dynamic-file-management.md`, `image-optimization-strategy.md` – next-phase plans once assets go dynamic

---

**Last refreshed:** October 8, 2025
