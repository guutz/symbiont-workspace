# GitHub Copilot Instructions

## How to Use This Document

Read the whole thing before making any changes. The architecture is not obvious from directory structure alone. When in doubt, check `.docs/` — almost every design decision has a memo.

---

## Project Overview

**Symbiont CMS** is a Notion-to-web pipeline. Content is authored in Notion, synced to Supabase Postgres via a hook-based orchestrator, then served by SvelteKit SSR apps with zero rebuild required for content updates.

### Workspaces

| Package | Purpose |
|---------|---------|
| `packages/symbiont-cms/` | Core library published to npm. Contains sync pipeline, hook system, DB CRUD, markdown converters, HTML renderer |
| `packages/california-tech/` | California Tech newspaper — primary production consumer of symbiont-cms |
| `packages/guutz-blog/` | Personal blog — secondary consumer |
| `supabase/` | Supabase project config (migrations, storage) |

> `packages/markdown-to-notion/` (the `@tryfabric/martian` fork) was absorbed into symbiont-cms in March 2026 and removed.

---

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Frontend | SvelteKit + Svelte 5 | SSR-first; `packages/svelte` is peerDep |
| Backend | Supabase (Postgres + Storage + Auth) | Service role key for sync, anon key for read |
| CMS source | Notion API (`@notionhq/client@5`) | Database query + block fetch |
| Sync library | `symbiont-cms` | This package |
| Markdown parsing | `unified@9` + `remark-parse@9` + `remark-gfm@1` | CJS; used by notion-md module |
| HTML rendering | `markdown-it@14` + `@mdit/plugin-*` | Server-side only; includes `@mdit/plugin-katex` |
| Testing | Vitest | `pnpm --filter symbiont-cms test` |
| CI | GitHub Actions (`.github/workflows/ci.yml`) | `pnpm/action-setup@v4`, cached pnpm store |

---

## Architecture: Three Data Flows

```
NOTION → DB  (sync direction — primary)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Notion API
  → NotionClient.getBlocks() [paginated]
  → blocksToMarkdown()        [notion-md module]
  → hook pipeline (content:text → content:media → content:postprocess)
  → Supabase pages.content

DB → NOTION  (write-back — idempotency)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pages.content  (markdown string with Supabase-permanent image URLs)
  → convertMarkdownToNotionBlocks()  [notion-md module]
  → diffBlocks()                     [surgical diff-and-patch]
  → Notion API patchPageBlocks / updatePageBlocks

DB → BROWSER  (render direction)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pages.content  (markdown string)
  → markdown-it + @mdit plugins     [to-html-renderer.ts]
  → HTML + TOC
  → SSR to browser
```

---

## Hook System

The sync pipeline is entirely hook-driven. Hooks are registered on a `HookRegistry` and fired in a fixed order by `NotionPageToDatabasePageTransformer`.

### Event Ordering Contract (stable API)

```
page:before             {}                   (always fires)
page:should-sync        {}                   (AndAll; false = skip page)
publish:check           {}                   (AndAll; false = null publish_at, but still sync)
publish:date            {}
slug:extract            {}
slug:generate           {}
slug:conflict           { slug }             (ctx.input = candidate slug)
slug:sync               { slug }             (write-back to Notion)
metadata:title          { slug }
metadata:tags           { slug, title }
metadata:authors        { slug, title, tags }
metadata:summary        { slug, title, tags, authors }
metadata:custom         { slug, title, tags, authors, summary }
content:preprocess      { ..., meta }        (returns markdown string)
content:text            { ..., content }     (Pipeline; ctx.input = markdown string)
content:media           { ..., content }     (Pipeline; ctx.input = current content)
content:postprocess     { ..., content }     (Pipeline; ctx.input = current content)
content:sync            { ..., content }     (side-effect; write-back to Notion)
cover:extract           { ..., content }
cover:process           { ..., cover }       (Pipeline; ctx.input = cover URL)
cover:sync              { ..., cover }       (side-effect; write-back to Notion)
page:after              { all fields }
```

### Composition Strategies

| Strategy | Semantics | Examples |
|----------|-----------|---------|
| `FirstWins` | Stop at first non-null result | `slug:extract`, `slug:generate`, `cover:extract` |
| `Collect` | Merge objects / concat arrays | `metadata:tags`, `metadata:authors`, `metadata:custom` |
| `AndAll` | Boolean AND, run all | `page:should-sync`, `publish:check` |
| `RunAll` | Side effects, ignore returns | `page:before`, `page:after`, `*:sync` |
| `Pipeline` | Chain: each return becomes next input; `null` = pass-through | `content:text/media/postprocess`, `cover:process` |

### Registering a Hook

```typescript
symbiontClient.registerHook({
  name: 'my-site:publish:check',
  event: 'publish:check',
  priority: 'override',  // runs before default (50); 'fallback' runs after
  fn: async (ctx) => {
    const status = ctx.page.properties.Status?.status?.name;
    return status === 'Ready to Publish';
  }
});
```

### HookContext

```typescript
interface HookContext {
  page:      PageObjectResponse;           // raw Notion page (never mutated)
  output:    Readonly<Partial<DatabasePage>>; // accumulated output so far
  input?:    unknown;                      // Pipeline: current value; slug:conflict: candidate slug
  config:    DatabaseBlueprint;
  logger:    Logger;
  services: {
    notionClient?: NotionClient;
    supabase?:     SupabaseClient<Database>;
    [key: string]: unknown;
  };
  store:     Record<string, unknown>;      // mutable; reset between pages
  syncStore: Record<string, unknown>;      // mutable; persists across ALL pages in a sync run
  abort:     (reason: string) => void;
}
```

`ctx.store` is page-scoped (reset per page); use it to pass data between hooks on the same page. `ctx.syncStore` is sync-scoped (persists the whole run); use it for caches like slug conflict maps or DB schema lookups.

---

## notion-md Module (`src/lib/server/notion-md/`)

Absorbed from `notion-to-md` and the `@tryfabric/martian` fork in March 2026. Zero external markdown-conversion dependencies.

### Files

| File | Purpose |
|------|---------|
| `types.ts` | `LIMITS` constant, options interfaces, `NotionRichText` type, `BlockTransformerFn` |
| `languages.ts` | Code language alias map + `parseCodeLanguage()` / `isSupportedCodeLang()` |
| `rich-text.ts` | `richTextToMarkdown()` (Notion→MD) and `richText()` / `ensureLength()` (MD→Notion) |
| `blocks-to-markdown.ts` | Notion blocks → markdown string (**Notion→DB direction**) |
| `markdown-to-blocks.ts` | Markdown → Notion blocks (**DB→Notion direction**) |

### Equation Convention (`$$...$$`)

`$$expr$$` is the **only** math delimiter. Single `$` is never math.

Block vs inline is **structural**:
- A paragraph whose only content is `$$...$$` → Notion `equation` block
- `$$...$$` alongside other text in a paragraph → `rich_text` equation item
- This matches `@mdit/plugin-katex`'s rendering behavior exactly

```markdown
The formula $$E = mc^2$$ is well known.   ← inline rich_text equation
$$                                         ← block equation (standalone paragraph)
\begin{align}
  F &= ma
\end{align}
$$
$5.00 and $10.00                           ← plain text; never parsed as math
```

### NotionRichText Type

The API returns three `type` values: `"text"`, `"equation"`, `"mention"`.

Mention subtypes (`mention.type`): `page`, `database`, `user`, `date`, `link_preview`, `template_mention`.

**Page/database mentions** are serialized as `notion://page/{cleanId}` sentinel URLs — see below.

### Custom Block Transformers

Register on `NotionClient` to override any block type's markdown output:

```typescript
notionClient.setBlockTransformer('image', async (block, fetchChildren) => {
  // Return a markdown string to override, or false to use default
  const url = block.image?.external?.url ?? block.image?.file?.url ?? '';
  const caption = block.image?.caption?.map((c: any) => c.plain_text).join('').trim();
  return `![${caption ?? ''}](${url})`;
});
```

`fetchChildren` is the same paginated fetch used internally — pass it when your transformer needs to recurse into child blocks.

### `notion://` Sentinel URLs

`link_to_page` blocks and inline `page`/`database` mention rich_text items are emitted as `[label](notion://page/{cleanId})` during Notion→DB conversion.

These are **deferred-resolution** sentinels — they are NOT real URLs. A `content:postprocess` hook called `resolveNotionPageLinks` (not yet built — see priorities) resolves them to public slugs via Supabase lookup, or strips them to plain text if the linked page is unpublished or in a different database.

If no resolution hook is registered, the sentinel is stored as-is and renders as a broken link. This is acceptable for drafts but should be resolved for production sites using cross-page links.

---

## Block Diff Algorithm (`src/lib/server/notion/blocks-diff.ts`)

The `content:sync` hook uses a **surgical diff-and-patch** strategy instead of delete-all/re-append:

1. Fetch existing Notion blocks (paginated via `NotionClient.getBlocks()`)
2. Generate desired blocks from stored markdown via `convertMarkdownToNotionBlocks()`
3. Run `diffBlocks()` → produces an edit script: `keep | update | insert | delete | replace`
4. Apply the script via targeted API calls

This preserves Notion block IDs (so internal links, comments, and synced blocks survive), skips writes on unchanged content, and handles pages >100 blocks correctly. The `normalizeBlockForDiff()` function strips API metadata (IDs, timestamps, `color: "default"`) before comparison. Blocks with `has_children: true` always trigger a conservative re-upload.

Force-full-replace when >60% of blocks changed (configurable via `forceFullReplaceThreshold`).

---

## DatabaseBlueprint Configuration

```typescript
interface DatabaseBlueprint {
  dataSourceId:     string;                    // Notion database UUID
  alias?:           string;                    // human-readable name (used in logs)
  slugProperty?:    string | null;             // Notion property name; reads authored slug AND writes final slug back
  tagsProperty?:    string | null;
  authorsProperty?: string | null;
  summaryProperty?: string | null;
  coverProperty?:   string | null;             // activates cover:* pipeline
  onSlugConflict?:  'auto-rename' | 'error' | 'use-page-id';  // default: 'auto-rename'
  excludeRule?:     (page: PageObjectResponse) => boolean;      // pre-filter before sync
  hooks?:           Hook[];                    // site-specific hooks
  onBeforeSync?:    () => Promise<void>;       // run-level lifecycle (not a hook)
  onAfterSync?:     () => Promise<void>;
}
```

---

## Key Files

```
packages/symbiont-cms/src/lib/
├── client.ts                          # createSymbiontClient() — public entry point
├── types.ts                           # DatabaseBlueprint, DatabasePage, SymbiontConfig
├── server.ts                          # server-only public exports
├── hooks/
│   ├── types.ts                       # HookContext, HOOK_EVENTS, CompositionStrategy
│   ├── registry.ts                    # HookRegistry — executes hooks per event
│   └── default-hooks.ts               # All built-in default hook implementations
├── server/
│   ├── notion/
│   │   ├── client.ts                  # NotionClient — wraps @notionhq/client + notion-md
│   │   ├── page-transformer.ts        # Transformer — fires events in order, assembles DatabasePage
│   │   └── blocks-diff.ts             # Surgical diff-and-patch for content:sync
│   ├── notion-md/                     # ← THE MARKDOWN CONVERSION MODULE
│   │   ├── types.ts                   # LIMITS, NotionRichText, BlockTransformerFn
│   │   ├── languages.ts               # Code language map
│   │   ├── rich-text.ts               # Bidirectional RichText ↔ markdown
│   │   ├── blocks-to-markdown.ts      # Notion blocks → markdown (Notion→DB)
│   │   └── markdown-to-blocks.ts      # Markdown → Notion blocks (DB→Notion)
│   ├── sync/
│   │   ├── coordinator.ts             # Factory: wires all dependencies together
│   │   ├── notion-to-database-sync.ts # Orchestrates full database sync
│   │   └── database-to-notion-sync.ts # DB→Notion write-back (uses convertMarkdownToNotionBlocks)
│   ├── database/
│   │   └── page-crud.ts               # Supabase CRUD for pages table
│   ├── markdown/
│   │   └── to-html-renderer.ts        # markdown-it + @mdit plugins → HTML + TOC
│   └── bucket/
│       └── image-upload.ts            # Upload images to Supabase Storage
```

---

## Common Tasks

```bash
# Run tests
pnpm --filter symbiont-cms test

# Type-check
pnpm --filter symbiont-cms check

# Build the package
pnpm --filter symbiont-cms build

# Run guutz-blog dev server
pnpm dev:guutz

# Run california-tech dev server
pnpm dev:tech

# Trigger a sync manually (guutz-blog running locally)
curl "http://localhost:5173/api/sync/poll-blog?secret=$CRON_SECRET"
```

---

## Design Documents (`.docs/`)

Read these before touching the relevant subsystem:

| Memo | What it covers |
|------|---------------|
| `2026-03-09-notion-markdown-absorption-memo.md` | **⭐ Why notion-md was built**; equation convention; `$$` tokenizer design |
| `2026-03-08-block-sync-refactor-memo.md` | **⭐ Block diff algorithm**; why nuke-and-repave was broken; API constraints |
| `2026-02-21-hook-events-design-memo.md` | **⭐ Hook system**; complete event list; composition strategies; event ordering |
| `2026-02-14-HOOK_SYSTEM_GUIDE.md` | Practical hook authoring guide |
| `2026-02-13-HOOK_MIGRATION_GUIDE.md` | Migration from old builder/repository pattern |
| `2025-12-01-bidirectional-sync-plan.md` | DB→Notion write-back design |
| `2025-12-01-image-optimization-strategy.md` | Image pipeline (Phase 2 — designed, not coded) |
| `2025-12-15-dynamic-redirects-strategy.md` | Redirect management (Phase 3 — designed, not coded) |
| `2025-10-15-markdown-compatibility.md` | Markdown syntax contract between sync and renderer |
| `2026-02-03-implementation-status.md` | Status tracker (may be stale; verify against code) |

---

## Known Priorities / Next Work

1. **`resolveNotionPageLinks` hook** — `content:postprocess` hook that rewrites `notion://page/{id}` → public slug via Supabase lookup; strips to plain text if unresolvable
2. **`htmlCodeToEmbed` renderer override** — treat ` ```html ` fenced blocks as raw HTML passthrough in `to-html-renderer.ts` (~10 lines, renderer-only)
3. **Cover image wiring** — upload cover images to Supabase Storage from `cover:process`; ensure `cover:sync` writes back to Notion
4. **Inline image wiring** — `content:media` hook uploads `![alt](...)` images to Supabase and rewrites URLs
5. **Supabase Storage RLS policies** — media bucket policies not yet committed

---

## Patterns to Follow

- **Hooks own business logic; the transformer owns sequencing.** Don't add logic to `page-transformer.ts`; put it in a hook.
- **`ctx.syncStore` for run-scoped caches.** Use it for slug conflict maps, Notion schema lookups (publish:check caches the DB status property definition here).
- **`ctx.store` for page-scoped data.** Use it to pass computed values between hooks on the same page (e.g. PDF URL computed in `content:media` read in `cover:extract`).
- **Custom transformers for per-block-type overrides.** `notionClient.setBlockTransformer('image', fn)` — do this in `coordinator.ts` during client setup, not in hooks.
- **`notion://page/{id}` is a sentinel, not a URL.** Never try to fetch it. Always handle the unresolved case gracefully.
- **Tests use `store: {}, syncStore: {}`** in the mock context — these fields are required by `HookContext`.
- **No separate compile step for markdown conversion.** The `prebuild` script was removed. `notion-md` is plain TypeScript, compiled by Vite/SvelteKit like everything else.

---

**Last Updated**: March 10, 2026
