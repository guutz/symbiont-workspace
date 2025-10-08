# Type Compatibility Snapshot

Use this file as the quick reference when mapping Symbiont posts into QWER components (or any other consumer).

---

## 1. Core mapping

| Symbiont (`Post`) | QWER (`Post.Post`) | Notes |
|--------------------|--------------------|-------|
| `id` | `slug`/internal references | QWER doesn’t need the UUID, but keep it around for related post lookups. |
| `slug` | `slug` | Primary identifier across both systems. |
| `title` (nullable) | `title` | Provide a fallback string when null. |
| `content` (markdown) | `content` | QWER renders markdown via `PostPage`; HTML is produced server-side. |
| `publish_at` | `published` | Ensure ISO format; fall back to `new Date().toISOString()` if undefined. |
| `updated_at` | `updated` | Default to `publish_at` when empty. |
| `tags` (`string[] | null`) | `tags` (`any[]`) | Coerce to `[]` to satisfy the QWER type. |
| `summary` / `description` (optional) | `summary` / `description` | Populate if your schema extends these fields. |
| `cover` (optional) | `cover` | QWER expects a URL; use Nhost once image migration lands. |
| `language` (optional) | `language` | Defaults to `'en'` if omitted. |

`Post.CoverStyle.NONE` is the safe default unless you adopt QWER’s cover positioning options.

---

## 2. Recommended transform helper

```ts
import type { Post as SymbiontPost } from 'symbiont-cms';
import { Post as QWERPost } from '$lib/types/post';

export function toQWER(post: SymbiontPost): QWERPost.Post {
	return {
		slug: post.slug,
		title: post.title ?? '(untitled)',
		content: post.content ?? '',
		description: post.description ?? '',
		summary: post.summary ?? '',
		language: post.language ?? 'en',
		published: post.publish_at ?? new Date().toISOString(),
		updated: post.updated_at ?? post.publish_at ?? new Date().toISOString(),
		created: post.publish_at ?? new Date().toISOString(),
		cover: post.cover ?? undefined,
		coverStyle: QWERPost.CoverStyle.NONE,
		coverCaption: undefined,
		coverInPost: false,
		tags: Array.isArray(post.tags) ? post.tags : [],
		html: undefined, // supplied by symbiont postLoad
		toc: undefined,
		options: [],
	};
}
```

- Extend this helper when you add new columns (e.g. `reading_time`, `authors`).
- Keep the function close to the consumer so TypeScript redlines any future breaking changes.

---

## 3. Optional schema extensions

To enrich the mapping without extra transformation logic, add columns to `public.posts`:

```sql
ALTER TABLE public.posts ADD COLUMN summary text;
ALTER TABLE public.posts ADD COLUMN description text;
ALTER TABLE public.posts ADD COLUMN language text DEFAULT 'en';
ALTER TABLE public.posts ADD COLUMN cover text;
```

Update your GraphQL fragments/queries and Notion sync to populate the new fields. Once present, the helper above passes them straight through.

---

## 4. Tooling tips

- Import `Post` from QWER as both type *and* value when using enums: `import { Post } from '$lib/types/post';`.
- Regenerate Symbiont’s types after edits by running `pnpm -F symbiont-cms build`; QWER consumes the emitted `.d.ts` files.

---

For the full integration story (stores, feeds, SSR), see `INTEGRATION_GUIDE.md`.

**Last refreshed:** October 8, 2025
