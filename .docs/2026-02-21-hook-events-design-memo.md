# Hook Events Design Memo

**Date:** February 21, 2026 (revised February 24, 2026)
**Status:** SIGNED OFF — ready for implementation
**Context:** The hook system is built and wired up on `copilot/perform-hook-migration-status`. This memo defines the target API for `HOOK_EVENTS`, `CompositionStrategy`, and `HookContext` in `types.ts`.

---

## The Symbiont Page Contract

Every Symbiont site gets these fields. Three are non-negotiable:

- **`title`** — every piece of content has a name
- **`content`** — the body (markdown, stored in Supabase)
- **`slug`** — the URL identifier

The rest are optional-core — Symbiont has a hook and a default for each, but sites can opt out or override:

- **`publish_at`** — when the content becomes public
- **`tags`** — multi-value classification
- **`authors`** — who wrote it
- **`summary`** — short description or excerpt
- **`cover`** — cover image URL (dedicated column; currently stored in `meta.cover` — schema debt to fix)
- **`meta`** — arbitrary JSONB for site-specific fields

**Rule:** every named field Symbiont knows about gets its own column. Site-specific data lives in `meta`.

---

## Config Sugar

Common behaviors are expressible as config options in `DatabaseBlueprint`. Symbiont installs the appropriate built-in hook at registration time. Custom hooks with `priority: 'override'` run before config-sugar hooks; for `FirstWins` events, the first non-null result wins, so overrides naturally take precedence.

```typescript
interface DatabaseBlueprint {
  slugProperty?: string | null;       // reads authored slug from AND writes final slug back to this Notion property
  tagsProperty?: string | null;
  authorsProperty?: string | null;
  summaryProperty?: string | null;
  coverProperty?: string | null;      // if set, activates cover:* hooks

  onSlugConflict?: 'auto-rename' | 'error' | 'use-page-id';  // default: 'auto-rename'
}
```

---

## HookContext

Every hook receives the same context shape — `HookContext` is non-generic:

```typescript
interface HookContext {
  page: PageObjectResponse;                // raw Notion source
  output: Readonly<Partial<DatabasePage>>; // accumulated output so far (read-only)
  input?: unknown;                         // Pipeline: current value in chain; slug:conflict: current slug
  // content:preprocess: ctx.input is BlockObjectResponse[]; hook returns MdBlock[] | null
  config: DatabaseBlueprint;
  logger: Logger;
  services: {
    notionClient?: NotionClient;
    supabase?: SupabaseClient<Database>;
    [key: string]: unknown;                // custom services for custom hooks
  };
  abort: (reason: string) => void;
}
```

`ctx.page` is the raw Notion source — never mutated. `ctx.output` is a frozen (read-only) view of the `DatabasePage` being assembled — the transformer maintains a mutable version of this same object (also called `output` internally) and the registry freezes it before passing it to each hook as `ctx.output`. Read it to avoid recomputing what earlier hooks already resolved, but don't write to it directly. Hooks return their contribution; the registry merges it per the event's composition strategy and writes the result into `output[event.field]`.

**Hook return values:** return the contribution value, or `null` to contribute nothing (or pass-through in Pipeline). The registry uses the event's `field` to write the result into `output`. Events without a `field` produce values used only for flow control (`AndAll`) or have no meaningful return (`RunAll`/void).

---

## Composition Strategies

The `e()` helper in `HOOK_EVENTS` becomes `e<TReturn>(strategy, field?)` where:
- `TReturn` — the type hook functions must return (or `null`)
- `field` — the `keyof DatabasePage` the registry writes the result into; omitted for flow-control events (`AndAll`) and side-effect events (`RunAll`/void)

```typescript
enum CompositionStrategy {
  FirstWins,   // stop at first non-null result
  Collect,     // accumulate all results; objects are merged, arrays are concatenated
  OrAll,       // boolean OR across all results
  AndAll,      // boolean AND across all results
  RunAll,      // run all; ignore return values (side effects)
  Pipeline,    // chain: each hook's return value becomes the next hook's input; null = pass-through
}
```

**Pipeline:** within a single event, if multiple hooks are registered, each hook's return value becomes the next hook's input for that event. `null` means pass-through (current value unchanged). Throwing aborts. This is strictly within-event chaining — between-event sequencing is handled by the ordering contract below (the transformer fires events in order; each event reads from `ctx.output` which prior events have built).

Priority for Pipeline hooks determines **position in the transform chain**, not who gets to contribute. Every registered hook executes — `null` passes the value through but doesn't skip the hook. `priority: 'override'` runs first (sees the raw value before defaults); `priority: 'fallback'` runs last (sees the fully-transformed result). This is different from `FirstWins` where lower-priority hooks are never reached once a value is returned.

- `content:preprocess` — `FirstWins` over `ctx.input` (`BlockObjectResponse[]`); returns `MdBlock[]`; no `field`. The default hook runs n2m. An override hook returns its own `MdBlock[]` and the default never runs. The transformer reads the return value directly to feed the bridge step.
- `content:text`, `content:media`, `content:postprocess` — each is its own event; within each event, multiple hooks chain over the current `ctx.input` string (the `content` field in progress)
- `cover:process` — chains over `ctx.input` (the cover URL in progress)

---

## Event Ordering Contract

The transformer fires events in this exact order. Each row shows which fields of `ctx.output` are guaranteed to be populated when that event fires.

`onBeforeSync` / `onAfterSync` are lifecycle callbacks on `DatabaseBlueprint` (not hookable events) — they fire once per sync run before/after all pages are processed.

```
page:before           {}                                                   (ctx.output is empty — start of page)
page:should-sync      {}
publish:check         {}
publish:date          {}
slug:extract          {}
slug:generate         {}
slug:conflict         { slug }                                             (ctx.input = current slug)
slug:sync             { slug }                                             (write-back to Notion)
metadata:title        { slug }
metadata:tags         { slug, title }
metadata:authors      { slug, title, tags }
metadata:summary      { slug, title, tags, authors }
metadata:custom       { slug, title, tags, authors, summary }
content:preprocess    { slug, title, tags, authors, summary, meta }        (ctx.input = BlockObjectResponse[])
content:text          { ..., content: string (raw markdown) }              (ctx.input = current content)
content:media         { ..., content: string (text-transformed) }          (ctx.input = current content)
content:postprocess   { ..., content: string (media-resolved) }            (ctx.input = current content)
content:sync          { ..., content: string (final) }                     (write-back to Notion)
cover:extract         { ..., content: string (final) }                    (default hook falls back to content scan if no match)
cover:process         { ..., content, cover }                              (ctx.input = current cover URL)
cover:sync            { ..., content, cover }                              (write-back to Notion)
page:after            { slug, title, tags, authors, summary, content, cover, meta, publish_at, ... }
```

Hooks must only read fields listed as available at their stage. This ordering is a stable API contract.

---

## Complete Event List

```typescript
export const HOOK_EVENTS = {
  // ── Page Lifecycle ─────────────────────────────────────────────────
  // Run lifecycle (onBeforeSync / onAfterSync) lives on DatabaseBlueprint, not here.
  'page:before':          e<void>(S.RunAll),
  'page:should-sync':     e<boolean>(S.AndAll),             // flow control — no field
  'page:after':           e<void>(S.RunAll),

  // ── Publishing ─────────────────────────────────────────────────────
  'publish:check':        e<boolean>(S.AndAll),             // flow control — no field
  'publish:date':         e<string|Date>(S.FirstWins,       'publish_at'),

  // ── Slug Pipeline ──────────────────────────────────────────────────
  'slug:extract':         e<string>(S.FirstWins,            'slug'),
  'slug:generate':        e<string>(S.FirstWins,            'slug'),
  'slug:conflict':        e<string>(S.FirstWins,            'slug'),  // receives current slug, returns resolved slug
  'slug:sync':            e<void>(S.RunAll),                // side effect — no field

  // ── Metadata Extraction ────────────────────────────────────────────
  'metadata:title':       e<string>(S.FirstWins,            'title'),
  'metadata:tags':        e<string[]>(S.Collect,            'tags'),
  'metadata:authors':     e<string[]>(S.Collect,            'authors'),
  'metadata:summary':     e<string>(S.FirstWins,            'summary'),
  'metadata:custom':      e<Record<string,unknown>>(S.Collect, 'meta'),  // merged into output.meta

  // ── Content Pipeline ───────────────────────────────────────────────
  'content:preprocess':   e<MdBlock[]>(S.FirstWins),                              // ctx.input = BlockObjectResponse[]; no field
  'content:text':         e<string>(S.Pipeline,             'content'),
  'content:media':        e<string>(S.Pipeline,             'content'),
  'content:postprocess':  e<string>(S.Pipeline,             'content'),
  'content:sync':         e<void>(S.RunAll),                // side effect — no field

  // ── Cover Pipeline (config-gated via coverProperty) ────────────────
  'cover:extract':        e<string>(S.FirstWins,            'cover'),  // default hook falls back to scanning content if no coverProperty match
  'cover:process':        e<string>(S.Pipeline,             'cover'),
  'cover:sync':           e<void>(S.RunAll),                // side effect — no field

  // REMOVED: page:exclude, page:validate (→ page:should-sync)
  // REMOVED: sync:slug (→ slug:sync), sync:cover (→ cover:sync), sync:content (→ content:sync)
  // REMOVED: sync:images (no-op), content:fetch (content always from Notion)
  // REMOVED: sync:before-all, sync:after-all (→ onBeforeSync/onAfterSync on DatabaseBlueprint)
  // REMOVED: cover:fallback (folded into default cover:extract hook — no conditional firing needed)
  // NOT ADDED: slug:finalize (normalization belongs in slug:generate)
} as const;
```

---

## `publish:check` Default Implementation

1. Call `databases.retrieve()` for the database once per sync run (cache the result)
2. Find any property with `type: 'status'`
3. Find the group with `name === 'Complete'` (Notion group names are fixed — not user-renameable)
4. Check if the page's selected option ID appears in `group.option_ids`
5. Fallback when no status property exists: return `false` (opt-in, not opt-out)

---

## California Tech Example

```typescript
{
  alias: 'tech-article-staging',
  dataSourceId: NOTION_DATABASE_ID,
  slugProperty: 'Website Slug',
  coverProperty: 'Cover Image',
  tagsProperty: 'Tags',
  authorsProperty: 'Authors',
  summaryProperty: 'Summary',
  onSlugConflict: 'auto-rename',

  hooks: [
    // Override page:should-sync — only "Ready to Print" and "Published" should sync.
    // "Shelved" is also in the Complete group but must not sync.
    {
      name: 'caltech:page:should-sync',
      event: 'page:should-sync',
      priority: 'override',
      fn: (ctx) => {
        const status = ctx.page.properties.Status?.status?.name;
        return status === 'Ready to Print' || status === 'Published';
      }
    },

    // Derive publish date from the Issue select property ("October 21, 2024")
    {
      name: 'caltech:publish:date',
      event: 'publish:date',
      priority: 'override',
      fn: (ctx) => {
        const issue = ctx.page.properties.Issue?.select?.name;
        if (!issue) return ctx.page.properties['Website Publish Date']?.date?.start ?? null;
        const match = issue.match(/(\w+)\s+(\d+),\s+(\d{4})/);
        if (!match) return null;
        // parse month name to index, return ISO string...
      }
    },

    // Attach newspaper-specific fields to the meta JSONB column
    {
      name: 'caltech:metadata:custom',
      event: 'metadata:custom',
      fn: (ctx) => ({
        layout: ctx.page.properties.Layout?.select?.name ?? 'standard',
        featured: ctx.page.properties.Featured?.checkbox ?? false,
        issueNumber: ctx.page.properties.Issue?.select?.name ?? null,
        section: ctx.page.properties.Section?.select?.name ?? null,
        printTemplate: ctx.page.properties['Print Template']?.select?.name ?? null,
      })
    },
  ],

  // Invalidate Vercel ISR after a sync run completes (run-level lifecycle, not a hook)
  onAfterSync: async () => {
    await fetch(`https://api.vercel.com/v1/integrations/deploy/${REVALIDATE_HOOK}`);
  },
}
```

Four hooks. Everything else is config.

---

## Implementation Scope

**Memo revision:** February 24, 2026 — design review complete.

### Decisions Locked In

**`slug:conflict` always fires.** The transformer fires it unconditionally after `slug:generate`, passing the candidate slug as `ctx.input`. The default hook reads `config.onSlugConflict`:
- `'auto-rename'` (default) — appends `-2`, `-3`, etc. until unique; falls back to random suffix after 100 attempts
- `'error'` — throws; transformer catches and skips the page
- `'use-page-id'` — returns `${slug}-${page.id.slice(0, 8)}`

All three strategies require a Supabase lookup — the default `slug:conflict` hook uses `ctx.services.supabase`.

**`field` in `e()` is runtime.** The registry owns writing results to the `DatabasePage` output object. After each event resolves, the registry writes `result → output[event.field]`. Events without a `field` (side-effect events, flow-control events) do not trigger a write.

**`publish:check` default is opt-in.** The default hook queries the Notion database's Status property definition (cached per sync run), finds the `'Complete'` group, and checks if the page's status option ID is in `group.option_ids`. If no Status property exists, returns `false`. This means pages are dark by default — they exist in the DB but `publish_at` is null until explicitly marked complete.

**Transformer owns fetch + persist; hooks own everything in between.** The transformer has two responsibilities beyond sequencing events: (1) it fetches raw `BlockObjectResponse[]` from the Notion API and passes them as `ctx.input` when firing `content:preprocess` — the default hook calls n2m to convert them to `MdBlock[]`, and a custom `override`-priority hook can swap the converter entirely; (2) after `content:preprocess` resolves, it takes the final `MdBlock[]` and converts them to a markdown string to feed into `content:text` as `ctx.input` — this bridge step is fixed and not hookable. The transformer also performs the final Supabase upsert after `page:after`. All extraction, business logic, and write-back lives in default hooks. `ctx.services` exists because hooks themselves need external systems: image uploads in `content:media`, slug uniqueness checks in `slug:conflict`, write-backs to Notion in `slug:sync` / `cover:sync` / `content:sync`.

---

### File-by-File Implementation

#### `src/lib/hooks/types.ts`

- Add `Pipeline` to `CompositionStrategy` enum
- Change `e()` helper signature to `e<TReturn>(strategy: CompositionStrategy, field?: keyof DatabasePage)` — drop the two-type-param form
- Add `field?: keyof DatabasePage` to the object returned by `e()`
- Replace `HOOK_EVENTS` wholesale with the final list from this memo
- Add `ctx.output: Readonly<Partial<DatabasePage>>` to `HookContext`
- Remove `ctx.blocks` — no longer needed. `content:preprocess` is FirstWins: the transformer passes `BlockObjectResponse[]` as `input` when calling `execute()`, the default hook returns `MdBlock[]`, and the transformer reads that return value directly. No chaining.
- Change `ctx.input?: unknown` — keep as-is; Pipeline and slug:conflict events populate it
- Remove `OrAll` from built-in events (no events use it; keep enum value in case it's useful later)
- Remove `EventSignatures` derived type — replace with simpler direct inference from `HOOK_EVENTS`
- Remove two-type-param `HookFunction` — simplify to `HookFunction<TReturn>`

#### `src/lib/hooks/registry.ts`

- Add `executePipeline(hooks, initialValue, output, state, abort, field?)`:
  - `initialValue` is `ctx.input` for the first hook
  - Each hook's non-null return becomes the next hook's `ctx.input`; `null` = pass-through (current value unchanged)
  - After the chain, if `field` is set, writes final value to `output[field]`
  - Handles `content:text`, `content:media`, `content:postprocess`, `cover:process` — note that `content:preprocess` is FirstWins and is handled by `executeFirstWins`, not this method
- Update `execute()` to accept the mutable output object and pass it as `ctx.output` (frozen):
  ```typescript
  async execute<E extends HookEvent>(
    event: E,
    output: Partial<DatabasePage>,
    page: PageObjectResponse,
    input?: unknown
  ): Promise<unknown>  // always returns the final composed value
  ```
- After each strategy's execution, write `result → output[HOOK_EVENTS[event].field]` if `field` is defined and result is non-null. Always return the result — the transformer uses return values in several places: boolean results from `page:should-sync` and `publish:check` control whether processing continues; `MdBlock[]` from `content:preprocess` feeds the bridge step. Most other events the transformer ignores the return value since it already landed in `output`.
- Update `buildContext()` to accept and freeze `output` as `ctx.output`
- Add `Pipeline` case to the strategy switch

#### `src/lib/types.ts`

- Rename `slugSyncProperty` → `slugProperty` in `DatabaseBlueprint` (reads authored slug from AND writes final slug back to this Notion property)
- Add `onSlugConflict?: 'auto-rename' | 'error' | 'use-page-id'` to `DatabaseBlueprint` (default: `'auto-rename'`)
- Add `onBeforeSync?: () => Promise<void>` to `DatabaseBlueprint`
- Add `onAfterSync?: () => Promise<void>` to `DatabaseBlueprint`
- Add `cover` as a first-class optional column to `DatabasePage` (currently stored in `meta.cover` — schema debt: fix the Supabase migration to add a dedicated `cover` column)
- `publish_at` is already the correct DB column name — the memo now uses this consistently; no rename needed

#### `src/lib/server/notion/page-transformer.ts`

Full rewrite. The transformer becomes a thin ordered sequencer:

1. Maintain a mutable `output: Partial<DatabasePage>` initialized with `page_id`, `datasource_id`, `datasource_alias`, `updated_at`
2. The registry freezes `output` before passing it as `ctx.output` on each `execute()` call
3. Fire events in the exact order from the Event Ordering Contract in this memo. Two conditionals:
   - If `page:should-sync` returns falsy: skip the entire page — return `null` immediately, no DB write
   - If `publish:check` returns falsy: skip `publish:date` only — `publish_at` stays null in the output, but slug / content / cover all still process normally. The page lands in the DB as a dark draft, fully populated, ready to go live the moment it passes `publish:check` on the next sync
4. For `content:preprocess`: fetch raw blocks via `notionClient.getBlocks(page.id)`, pass as `input` when firing the event, use the return value (`MdBlock[]`) to do the fixed markdown bridge — convert `MdBlock[]` to string — then pass that string as `input` to `content:text`. This bridge step is the only logic that lives between two events in the sequence.
5. After `page:after`: validate that `output.title` and `output.slug` are non-null (required fields); log and return `null` if not
6. Perform Supabase upsert with the assembled `output`
7. `onBeforeSync` / `onAfterSync` are called by the coordinator one level up, not by the transformer

All helper methods (`resolveSlug`, `extractCoreMetadata`, `processCoverImage`, `processContentAndUploadImages`, `buildMetadata`, `ensureUniqueSlug`, `shouldExclude`, `shouldPublish`) are **deleted** — their logic migrates into default hooks.

Note: the transformer reads return values from `execute()` in two cases — `page:should-sync` and `publish:check` return booleans that gate further processing; `content:preprocess` returns `MdBlock[]` needed for the bridge step. All other `execute()` calls ignore the return value since results land in `output` automatically.

#### `src/lib/hooks/default-hooks.ts`

Rewrite all existing hooks to match new event names. Add new default hooks:

- `symbiont:page:before` — no-op (RunAll)
- `symbiont:page:should-sync` — returns `true` by default (AndAll; all pages sync unless a user hook says otherwise)
- `symbiont:page:after` — no-op (RunAll)
- `symbiont:publish:check` — query Notion Status property definition, check `'Complete'` group, return `false` if no Status property exists; cache the DB schema lookup per sync run via a module-scoped Map keyed by `dataSourceId`
- `symbiont:slug:extract` — reads `ctx.config.slugProperty` from Notion if configured
- `symbiont:slug:generate` — checks `ctx.output.slug` first; returns `null` if already set by `slug:extract`. Otherwise generates from title using `createSlug()`. This is the correct pattern for avoiding silent overwrite: the default hook defers to whatever an earlier event already resolved
- `symbiont:slug:conflict` — reads `ctx.config.onSlugConflict`, performs uniqueness check via `ctx.services.supabase`; default `'auto-rename'`
- `symbiont:slug:sync` — writes resolved slug back to Notion via `ctx.services.notionClient` if `ctx.config.slugProperty` is set (RunAll, side effect)
- `symbiont:content:preprocess` — calls n2m to convert `ctx.input` (`BlockObjectResponse[]`) to `MdBlock[]` and returns the result; FirstWins. An `override`-priority hook can return a custom `MdBlock[]` and the default never runs.
- `symbiont:content:text` — default hook is pass-through (returns `ctx.input` as-is); Pipeline. Note: the `MdBlock[]` → string conversion is done by the transformer as a fixed bridge step *before* this event fires — `content:text` always receives a string as `ctx.input`, never blocks. User hooks that want to transform the raw markdown string (strip sections, rewrite headings, etc.) register here with `priority: 'override'`
- `symbiont:content:media` — uploads inline images to Supabase Storage, rewrites URLs; uses `ctx.services.supabase`; Pipeline
- `symbiont:content:postprocess` — no-op Pipeline
- `symbiont:content:sync` — writes the final markdown (with Supabase-permanentized image URLs) back to Notion as blocks using the martian fork (`packages/markdown-to-notion`); this is an **idempotency mechanism**, not bidirectional content sync — without it, Notion still holds expiring CDN image URLs and every subsequent sync re-uploads the same images. Default behavior is always-on (RunAll). Uses `ctx.services.notionClient`.
- `symbiont:cover:extract` — reads `ctx.config.coverProperty` from Notion files property if configured; if null, falls back to scanning `ctx.output.content` for the first image URL. Fallback logic is in the same default hook — no separate event needed
- `symbiont:cover:process` — uploads cover image to Supabase Storage, rewrites URL; uses `ctx.services.supabase`; Pipeline
- `symbiont:cover:sync` — no-op by default (RunAll); user hooks can write processed URL back to Notion
- Remove `page:exclude`, `page:validate`, `slug:validate`, `slug:transform`, `content:fetch`, `content:transform`, `content:images`, `sync:slug`, `sync:content`, `sync:images`, `cover:fallback` — these event names no longer exist

