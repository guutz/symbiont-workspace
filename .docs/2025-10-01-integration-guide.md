# QWER-Test + Symbiont Integration Guide

> **Phase 1 Complete:** The QWER demo app now consumes live content from Symbiont CMS using a production-ready 4-file hybrid rendering pattern.  
> **Last Updated:** October 9, 2025

---

## 1. What lives where?

- **Symbiont CMS (`packages/symbiont-cms`)** – exposes sync handlers, markdown rendering, GraphQL helpers, server utilities, and type definitions.
- **QWER Test App (`packages/qwer-test`)** – consumes the package and renders the blog using QWER's layouts with Symbiont data.
- **Nhost** – stores posts in `public.posts`; GraphQL queries filter by `source_id` (`short_db_ID`).

```
Notion page ─→ Symbiont sync ─→ Nhost Postgres ─→ SvelteKit SSR/API ─→ QWER UI
```

**Key Pattern:** 4-file hybrid rendering strategy
- SSR for initial page load (SEO-friendly)
- Client-side navigation via API (SPA-like speed)
- Progressive enhancement (works without JS)
- See `packages/qwer-test/docs/HYBRID_IMPLEMENTATION.md` for full details

---

## 2. Wiring steps

1. **Build Symbiont** – `pnpm -F symbiont-cms build`. QWER pulls compiled JS from `dist/`.
2. **Expose config to the app** – ensure `symbiont.config.js` defines `primaryShortDbId` that matches the posts you want on the blog.
3. **Provide environment variables** – `packages/qwer-test/.env` needs `PUBLIC_NHOST_GRAPHQL_URL`. Secrets (admin secret, Notion key) stay in the workspace root `.env`.
4. **Start the dev server** – `pnpm -F qwer-test dev`.
5. **Sync data** – hit `/api/sync/poll-blog` or rely on the Notion webhook to populate Nhost.

---

## 3. Data flow inside QWER

### Homepage (`/`)

**Route:** `src/routes/+page.server.ts`

```ts
import { getAllPosts } from 'symbiont-cms/server';
import { symbiontToQwerPost } from '$lib/utils/post-converter';

export const load = async ({ fetch }) => {
	const postsFromDb = await getAllPosts({ fetch, limit: 100 });
	const qwerPosts = postsFromDb.map((post) => symbiontToQwerPost(post));
	return { posts: qwerPosts };
};
```

**Component:** `src/routes/+page.svelte`
- Receives `data.posts` already in QWER format
- No need for stores or conversion
- Renders post list with QWER components

**Key Pattern:**
- ✅ Uses `getAllPosts` from Symbiont
- ✅ Converts with shared `post-converter` utility
- ✅ Returns QWER-compatible format
- ✅ SSR-ready, no client-side transformation needed

---

### Individual Post Pages (`/[slug]`)

**Architecture:** 4-file hybrid rendering pattern

#### File 1: `src/routes/[slug=slug]/+page.server.ts` (SSR)
```ts
import { postLoad } from 'symbiont-cms/server';
import { symbiontToQwerPost } from '$lib/utils/post-converter';

export const load = async (event) => {
	const data = await postLoad(event);
	const qwerPost = symbiontToQwerPost(data.post, data.html, data.toc);
	return { post: qwerPost, html: data.html, toc: data.toc };
};
```

#### File 2: `src/routes/[slug=slug]/+page.ts` (Client Navigation)
```ts
export const load = async ({ params, fetch }) => {
	const response = await fetch(`/api/posts/${params.slug}`);
	return await response.json();
};
```

#### File 3: `src/routes/api/posts/[slug]/+server.ts` (JSON API)
```ts
import { getPostBySlug, renderMarkdown } from 'symbiont-cms/server';
import { symbiontToQwerPost } from '$lib/utils/post-converter';

export const GET = async ({ params, fetch, setHeaders }) => {
	const post = await getPostBySlug(params.slug, { fetch });
	const { html, toc } = await renderMarkdown(post.content ?? '');
	const qwerPost = symbiontToQwerPost(post, html, toc);
	
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return json({ post: qwerPost, html, toc });
};
```

#### File 4: `src/routes/[slug=slug]/+page.svelte` (Display)
```svelte
<script lang="ts">
	export let data;
	$: post = data.post; // Already in QWER format
</script>

<PostHeading data={post} />
<div class="prose">{@html data.html}</div>
<PostToc toc={post.toc} />
<TagsSection tags={post.tags} />
<Giscuss />
```

**Key Innovations:**
- ✅ SSR for initial load (SEO)
- ✅ Client navigation via API (fast SPA transitions)
- ✅ Shared converter utility (consistency)
- ✅ Route param matcher prevents `.xml` from matching
- ✅ Works without JavaScript (progressive enhancement)

**See:** `packages/qwer-test/docs/HYBRID_IMPLEMENTATION.md` for complete guide

---

### Feeds (Atom / JSON / Sitemap)

Each feed route uses the same pattern:

```ts
import { getAllPosts } from 'symbiont-cms/server';

async function fetchPosts(fetch: typeof globalThis.fetch) {
	return await getAllPosts({ fetch, limit: 100 });
}
```

**Routes:**
- `src/routes/atom.xml/+server.ts` - Atom feed with `data-sveltekit-reload`
- `src/routes/sitemap.xml/+server.ts` - XML sitemap with `data-sveltekit-reload`
- `src/routes/feed.json/+server.ts` - JSON feed

**Navigation Fix:**
- Footer links have `data-sveltekit-reload` attribute
- Param matcher (`src/params/slug.ts`) prevents `[slug=slug]` from matching `.xml`
- Both approaches ensure proper XML handling

---

## 4. Type alignment & Post Converter Utility

### Shared Converter Pattern ⭐ NEW

**Location:** `packages/qwer-test/src/lib/utils/post-converter.ts`

All routes use this single utility for Symbiont → QWER conversion:

```ts
import type { Post as SymbiontPost } from 'symbiont-cms';
import type { Post } from '$lib/types/post';

export function symbiontToQwerPost(
  post: SymbiontPost, 
  html?: string, 
  toc?: any[]
): Post.Post {
  return {
    slug: post.slug,
    title: post.title ?? 'Untitled',
    content: post.content ?? '',
    summary: post.summary ?? post.content?.substring(0, 200) ?? '',
    description: post.description ?? '',
    language: post.language ?? 'en',
    cover: post.cover,
    tags: Array.isArray(post.tags) ? post.tags : [],
    
    // Date mapping
    published: post.publish_at ?? new Date().toISOString(),
    updated: post.updated_at ?? post.publish_at ?? new Date().toISOString(),
    created: post.publish_at ?? new Date().toISOString(),
    
    // Rendered content
    html: html ?? '',
    toc: toc as any,
    
    // QWER-specific defaults
    coverStyle: 'NONE' as Post.CoverStyle,
    coverInPost: true,
    coverCaption: undefined,
    options: [],
    series_tag: undefined,
    series_title: undefined,
    prev: undefined,
    next: undefined,
  };
}
```

**Benefits:**
- ✅ Single source of truth for field mapping
- ✅ Used by homepage, post pages, and API endpoints
- ✅ Type-safe with proper TypeScript types
- ✅ Easy to extend with new fields

### Field Mapping Table

| Symbiont (`Post`) | QWER (`Post.Post`) | Conversion Notes |
|--------------------|--------------------|------------------|
| `slug` | `slug` | Direct pass-through |
| `title` (nullable) | `title` (string) | Fallback: `'Untitled'` |
| `content` | `content` | Markdown string |
| `publish_at` | `published`, `created` | ISO string fallback |
| `updated_at` | `updated` | Falls back to `publish_at` |
| `tags` | `tags` | Ensures array (default: `[]`) |
| `summary` | `summary` | Fallback: first 200 chars of content |
| `description` | `description` | Direct pass-through |
| `cover` | `cover` | Image URL |
| `language` | `language` | Fallback: `'en'` |
| N/A | `html` | From `renderMarkdown()` |
| N/A | `toc` | From `renderMarkdown()` |
| N/A | `coverStyle` | QWER default: `'NONE'` |

**Type Note:** Use `'NONE' as Post.CoverStyle` instead of `Post.CoverStyle.NONE` when importing types (can't use enum values with `import type`).

See `TYPE_COMPATIBILITY.md` for the full type comparison.

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

- **Pagination** – extend `getAllPosts({ limit, offset })` and feed into QWER's filtering/ordering utilities.
- **Caching** – API endpoints use 60s HTTP cache headers; extend with CDN caching in production.
- **Search** – integrate with Nhost full-text search or use a search service like Algolia.
- **Preview mode** – filter on draft status or use separate database for previews.
- **Prev/Next Navigation** – implement post ordering and store for sequential navigation (TODO).

---

## 8. New Features in QWER Integration

### Route Param Matcher 🔒
**Location:** `src/params/slug.ts`

Prevents `[slug=slug]` route from matching files with extensions:

```ts
export function match(param: string): boolean {
  return !/\.[a-z0-9]+$/i.test(param);
}
```

**Why:** Ensures `/sitemap.xml` and `/atom.xml` are handled by dedicated `+server.ts` files, not the post route.

### 4-File Hybrid Pattern
- `+page.server.ts` - SSR for initial load
- `+page.ts` - Client navigation via API
- `+server.ts` - JSON API with caching
- `+page.svelte` - Display with QWER components

**Benefits:**
- SEO-friendly server rendering
- Fast SPA transitions
- Progressive enhancement
- Cacheable API responses

### Testing Infrastructure ✅
**Location:** `packages/symbiont-cms/src/lib/server/queries.test.ts`

- 12 comprehensive tests for query functions
- Mocked GraphQL client for isolation
- Tests pagination, errors, edge cases
- Run: `pnpm test queries.test.ts`

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
