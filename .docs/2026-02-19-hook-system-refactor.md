# Hook System Refactor

**Branch**: `copilot/perform-hook-migration-status`  
**Date**: February 19, 2026

---

## Summary

This PR migrates the page transformer away from hardcoded logic and toward the hook system. Seven changes are tracked here: one complete, one partially wired, and five proposed but not yet implemented.

---

## Change 1: Metadata extraction migrated to hooks

**Status**: ✅ Complete

`extractCoreMetadata()` previously called `NotionClient` methods directly to extract title, tags, authors, and summary. It now calls the hook registry:

```typescript
const title = await this.hookRegistry.execute('metadata:title', ctx);
const tags  = await this.hookRegistry.execute('metadata:tags', ctx);
// etc.
```

The method was made `async` as a consequence. It was already only called from an async context.

Default extractor hooks handle the same Notion property reads that the hardcoded logic did before—behavior is unchanged. Users can override any of these by registering a hook with `priority: 'override'` (see Change 6).

---

## Change 2: Drop the extractor/effect type split; move composition strategy to event definitions

**Status**: ❌ Not yet implemented — proposed here

### The problem with the current approach

The current code has a hardcoded set of "effect events" and branches the registry's execution path based on event name. The previously proposed fix—two interface types (`ExtractorHook`, `EffectHook`) with two context types—solves the TypeScript narrowing problem but introduces a new one: users have to know which type to import and which events belong to which category before they can write a hook.

### The proposed design

One hook type. One context type. Execution strategy (how results are composed, whether to stop early) is a property of the *event*, declared when the event is defined—not inferred from the hook's return type or interface.

```typescript
type CompositionStrategy =
  | 'first-wins'   // stop at first non-null result (strings, numbers, dates)
  | 'collect'      // accumulate all results; registry infers merge (objects) or concat (arrays)
  | 'or-all'       // run all; true if any hook returns true (boolean OR)
  | 'and-all'      // run all; false if any hook returns false (boolean AND)
  | 'run-all';     // run all; ignore return values entirely (side effects)

type EventDefinition = {
  composition: CompositionStrategy;
};
```

`collect` replaces both `merge` and `concat`—the registry inspects what hooks actually return and merges objects or concatenates arrays accordingly. Mixing types across hooks on the same event is a bug and the registry can warn on it.

`or-all` and `and-all` are for boolean events. They matter because `'first-wins'` has a subtle problem with both: if hook A returns `false` (don't exclude) on a `page:exclude` event, `'first-wins'` stops and hook B never runs even if hook B would have said to exclude. With `'or-all'`, all hooks run and the page is excluded if *any* return true—correct semantics for a veto-style check. Similarly, `'and-all'` for `publish:check` means all hooks must agree to publish; any `false` blocks it. `null` in both cases means "no opinion"—it doesn't contribute to the aggregate.

Built-in events are declared with a fixed strategy:

```typescript
const HOOK_EVENTS: Record<HookEvent, EventDefinition> = {
  'page:exclude':     { composition: 'or-all'    },  // exclude if any hook says yes
  'page:validate':   { composition: 'and-all'   },  // valid only if all hooks pass
  'metadata:title':  { composition: 'first-wins'},
  'metadata:tags':   { composition: 'collect'   },
  'metadata:custom': { composition: 'collect'   },
  'publish:check':   { composition: 'and-all'   },  // publish only if all hooks agree
  'publish:date':    { composition: 'first-wins'},
  'slug:extract':    { composition: 'first-wins'},
  'slug:generate':   { composition: 'first-wins'},
  'cover:extract':   { composition: 'first-wins'},
  'content:transform': { composition: 'first-wins'},
  'content:images':    { composition: 'run-all'   },
  'cover:process':     { composition: 'run-all'   },
  'sync:slug':         { composition: 'run-all'   },
  'sync:content':      { composition: 'run-all'   },
  'sync:images':       { composition: 'run-all'   },
};
```

### Typed `execute()` derived from the event map

With `HOOK_EVENTS` in place, the `execute()` signature can be derived rather than hand-written. An `EventSignatures` mapped type records the `input` and `output` for each event:

```typescript
type EventSignatures = {
  // Events that receive a pipeline input value:
  'content:transform': { input: string;      output: string       };
  'content:images':    { input: string;      output: string       };
  'cover:process':     { input: string|null; output: string|null  };
  'sync:slug':         { input: string;      output: void         };
  'sync:content':      { input: string;      output: void         };
  'sync:images':       { input: unknown;     output: void         };
  // Events with no pipeline input (ctx.page is the only source):
  'page:exclude':      { input: never; output: boolean    };
  'page:validate':     { input: never; output: boolean    };
  'metadata:title':    { input: never; output: string     };
  'metadata:tags':     { input: never; output: string[]   };
  'metadata:authors':  { input: never; output: string[]   };
  'metadata:summary':  { input: never; output: string     };
  'metadata:custom':   { input: never; output: Record<string, unknown> };
  'publish:check':     { input: never; output: boolean    };
  'publish:date':      { input: never; output: string     };
  'slug:extract':      { input: never; output: string     };
  'slug:generate':     { input: never; output: string     };
  'cover:extract':     { input: never; output: string     };
};
```

The `execute()` overload uses a rest parameter to make `input` required when declared and absent when not:

```typescript
execute<E extends HookEvent>(
  event: E,
  page: PageObjectResponse,
  ...args: EventSignatures[E]['input'] extends never ? [] : [EventSignatures[E]['input']]
): Promise<EventSignatures[E]['output'] | null>
```

Known events get full type checking at every call site—pass the wrong input type or forget a required one and TypeScript catches it. User-defined events fall through to the `[key: string]` fallback and work fine with no inference. The overload table is maintained in one place (`EventSignatures`) and derived everywhere else. If an event's I/O changes, one edit propagates to all call sites.

The hook type is just one thing:

```typescript
interface Hook<TOutput = any> {
  name: string;
  event: HookEvent;
  priority?: 'override' | 'fallback';
  continueOnError?: boolean;
  fn: (ctx: HookContext) => Promise<TOutput | null> | TOutput | null;
}
```

Context is one type with `services` always present as an object (individual fields may be undefined):

```typescript
type HookContext = {
  page: PageObjectResponse;
  config: DatabaseBlueprint;
  logger: Logger;
  services: {
    notionClient?: NotionClient;
    supabase?: SupabaseClient;
    [key: string]: unknown; // custom services — see Change 6
  };
  abort: (reason: string) => void;
};
```

`services` is always an object—`ctx.services.notionClient` rather than `ctx.services?.notionClient`. Individual services are still optional because some may not be configured. The distinction between "this hook can use services" and "this hook shouldn't" is convention, not a type constraint—but it's a reasonable tradeoff given that the alternative (two context types) imposes the extractor/effect classification on every hook author.

### What this doesn't enforce

The registry won't prevent a hook on a `'first-wins'` event from making a network call, or a hook on a `'run-all'` event from returning a non-void value. The composition strategy enforces *execution model*, not *purity*. That's always been convention.

### Hook signals: a complete reference

There are four things a hook can do to affect execution. Several of them stop things but at different scopes.

| Signal | Stops | Intent |
|--------|-------|--------|
| `return value` | Further hooks for this event (first-wins events only) | "Here is my answer" |
| `return null` | Nothing—continues to next hook | "No opinion; ask the next hook" |
| `throw` | This event's remaining hooks | Unexpected error—something went wrong |
| `ctx.abort(reason)` | Entire page pipeline | Intentional stop—this page must not be processed |

Note: `return false` on `or-all`/`and-all` events is just a normal value—it contributes to the aggregate and execution continues. There is no short-circuit on false the way `'first-wins'` short-circuits on a non-null value. This is an improvement over the previous design where `null` vs `false` had confusing special-case meaning that users had to memorize.

**`throw` vs `ctx.abort()`**: Both stop processing, but `throw` signals an unexpected error—the sync may be logged as failed. `abort()` is intentional—the hook examined the page and decided cleanly that it shouldn't be processed (missing required field, wrong status, etc.). The transformer treats an abort as a clean skip, not a failure.

**`throw` and `continueOnError`**: `continueOnError` is a policy on the hook definition, not execution. It tells the registry to swallow a thrown error and continue to the next hook. Intended for best-effort side effects (notifications, analytics) that shouldn't break the sync if they fail. Has no effect on `ctx.abort()`—aborts always propagate.

---

## Change 3: Inline composition.ts into registry.ts

**Status**: ❌ Not yet implemented — proposed here

`composition.ts` exports three functions (`getResultType`, `composeResults`, `shouldStopEarly`) and one type (`ResultType`), all only called from `registry.ts`. The logic is roughly 40 lines net of comments.

These should be inlined as private module-level helpers in `registry.ts`. The dedicated file implies reusability that doesn't exist—it only makes `execute()` harder to read by splitting its logic across two files. Extract again if there's a real future need.

`index.ts` currently re-exports `composition.ts`. That export is removed; nothing outside the hooks module imports from it directly.

---

## Change 4: Block-level content extensibility via `contentBlockTransformers`

**Status**: ❌ Not yet implemented — proposed here

`notion-to-md` supports `setCustomTransformer(blockType, fn)` for overriding how individual Notion block types render to markdown. This is the right surface for things like:

- Rendering `callout` blocks as GitHub-flavored `> [!NOTE]`
- Rendering `equation` blocks as KaTeX (`$$...$$`)
- Stripping `divider` blocks entirely

This is not a hook-system concern — it's configuration of the markdown renderer, applied once when the `NotionToMarkdown` instance is constructed, not per page. The natural fit is a field on `DatabaseBlueprint`, set in `src/lib/symbiont.ts`:

```typescript
// src/lib/symbiont.ts
export const symbiont = createSymbiont({
  databases: [{
    alias: 'blog',
    notionDatabaseId: '...',
    contentBlockTransformers: {
      callout:  async (block) => `> [!NOTE]\n> ${block.callout.rich_text[0]?.plain_text ?? ''}`,
      equation: async (block) => `$$${block.equation.expression}$$`,
    }
  }]
});
```

The coordinator reads `contentBlockTransformers` during initialization and calls `n2m.setCustomTransformer()` for each entry before the `NotionClient` is handed to the transformer.

The hook `content:transform` (Change 5) remains the surface for string-level post-processing *after* markdown is produced — stripping frontmatter, rewriting image syntax, injecting custom markup. The two layers don't overlap: block transformers control rendering; `content:transform` hooks control the resulting string.

---

## Change 5: Wire remaining hook events in the transformer

**Status**: 🔶 Framework in place, transformer not updated

Default no-op hooks exist for these events, but the transformer still handles the underlying logic through hardcoded methods:

| Events | Transformer method | Gap |
|--------|--------------------|-----|
| `content:transform`, `content:images` | `processContentAndUploadImages()` | Not called via hooks |
| `cover:process` | `processCoverImage()` | Not called via hooks |
| `sync:slug`, `sync:content`, `sync:images` | Scattered conditionals in transformer | Not called via hooks |
| `page:validate`, `slug:validate`, `slug:transform` | Partially in `ensureUniqueSlug()`, partially nowhere | Never called |

### The threading problem

The metadata events (`metadata:title`, `metadata:tags`, etc.) are stateless: each hook reads from `ctx.page` and returns a value. The content pipeline is different. `content:transform` and `content:images` need the markdown string. `sync:content` needs the processed markdown. These events form a *sequential pipeline* where each step operates on the previous step's output.

`execute()` accepts an optional `input` that the transformer passes when chaining events; the hook receives it as `ctx.input`. With the typed `EventSignatures` map from Change 2, `input` is required and typed exactly for events that declare it, and absent for events that don't:

```typescript
// HookContext gains:
type HookContext = {
  // ...existing fields...
  input?: unknown; // present only for pipeline events; typed via EventSignatures at call site
};
```

The transformer owns sequencing. The registry owns execution within each event.

### Content pipeline

These replace `processContentAndUploadImages()`. The transformer calls `notionClient.pageToMarkdown()` directly for the fetch step; the resulting markdown flows into the pipeline as `ctx.input`:

```typescript
// content:transform — user-defined string-level markdown transformations.
// Default is pass-through; users add 'override' hooks to strip/rewrite content.
export const defaultContentTransformHook: Hook<string> = {
  name: 'symbiont:content:transform:default',
  event: 'content:transform',
  priority: 50,
  fn: async (ctx) => ctx.input as string
};

// content:images — find image URLs in markdown, upload to Supabase, return updated markdown
export const defaultContentImagesHook: Hook<string> = {
  name: 'symbiont:content:images:default',
  event: 'content:images',
  priority: 50,
  fn: async (ctx) => {
    const content = ctx.input as string;
    if (!ctx.services.supabase || !content) return null;

    let processed = content;
    const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const uploads: Promise<void>[] = [];
    let match: RegExpExecArray | null;

    while ((match = imageRegex.exec(content)) !== null) {
      const [full, alt, url] = match;
      if (!needsUploadToSupabase(url)) continue;

      uploads.push(
        uploadImageToSupabase(url, { supabase: ctx.services.supabase, pageId: ctx.page.id, altText: alt })
          .then(({ newUrl }) => { processed = processed.replace(full, `![${alt}](${newUrl})`); })
          .catch((err) => ctx.logger.warn({ event: 'content_image_upload_failed', url, error: err.message }))
      );
    }

    await Promise.all(uploads);
    return processed;
  }
};
```

Transformer call sites after wiring:

```typescript
// Replaces processContentAndUploadImages() entirely:
const rawContent   = await this.notionClient.pageToMarkdown(page.id); // always Notion; not a hook
const transformed  = await this.hookRegistry.execute('content:transform', page, rawContent) ?? rawContent;
const finalContent = await this.hookRegistry.execute('content:images',   page, transformed) ?? transformed;
```

### Cover pipeline

`cover:extract` is already wired. `cover:process` handles the upload side that's currently hardcoded in `processCoverImage()`:

```typescript
// cover:process — upload cover URL to Supabase, return permanent URL
// ctx.input is the raw URL returned by cover:extract
export const defaultCoverProcessHook: Hook<string> = {
  name: 'symbiont:cover:process:default',
  event: 'cover:process',
  priority: 50,
  fn: async (ctx) => {
    const url = ctx.input as string | null;
    if (!url || !ctx.services.supabase) return null;
    if (!needsUploadToSupabase(url)) return url;

    const { newUrl } = await uploadImageToSupabase(url, {
      supabase: ctx.services.supabase,
      pageId: ctx.page.id
    });

    // Sync permanent URL back to Notion
    if (ctx.config.coverProperty && ctx.services.notionClient) {
      await ctx.services.notionClient.updateFileProperty(ctx.page.id, ctx.config.coverProperty, newUrl);
    }

    return newUrl;
  }
};
```

Transformer call sites (replaces `processCoverImage()`):

```typescript
const rawCoverUrl  = await this.hookRegistry.execute<string | null>('cover:extract', page);
const finalCoverUrl = rawCoverUrl
  ? await this.hookRegistry.execute<string>('cover:process', page, rawCoverUrl)
  : await this.extractCoverFromContent(page); // fallback logic; could also become a hook eventually
```

### Sync events

These are pure effect events. Each receives the thing to sync as `ctx.input` and writes it back to Notion via `ctx.services.notionClient`.

```typescript
// sync:slug — write final slug back to the configured Notion property
export const defaultSyncSlugHook: Hook<void> = {
  name: 'symbiont:sync:slug:default',
  event: 'sync:slug',
  priority: 50,
  fn: async (ctx) => {
    const slug = ctx.input as string;
    if (!ctx.services.notionClient || !ctx.config.slugSyncProperty || !slug) return;
    await ctx.services.notionClient.updateProperty(ctx.page.id, ctx.config.slugSyncProperty, slug);
  }
};

// sync:content — write Supabase-URL-replaced markdown back to Notion as blocks
export const defaultSyncContentHook: Hook<void> = {
  name: 'symbiont:sync:content:default',
  event: 'sync:content',
  priority: 50,
  fn: async (ctx) => {
    const content = ctx.input as string;
    if (!ctx.services.notionClient || !content) return;

    const blocks = convertMarkdownToNotionBlocks(content, {
      strictImageUrls: false,
      truncate: true,
      onLimitExceeded: (err) => ctx.logger.warn({ event: 'notion_content_limit_exceeded', error: err.message })
    });
    await ctx.services.notionClient.updatePageBlocks(ctx.page.id, blocks);
  }
};

// sync:images is covered by sync:content for inline images and cover:process for the cover.
// Keeping the event in the registry for user extensibility (e.g., syncing image captions).
export const defaultSyncImagesHook: Hook<void> = {
  name: 'symbiont:sync:images:default',
  event: 'sync:images',
  priority: 50,
  fn: async (_ctx) => { /* no-op */ }
};
```

Transformer wiring for sync:

```typescript
// In transformPage(), after content pipeline:
if (finalContent !== rawContent) {
  await this.hookRegistry.execute('sync:content', page, finalContent);
}

// In resolveSlug(), after slug is determined:
if (slugChanged) {
  await this.hookRegistry.execute('sync:slug', page, slug);
}
```

### What to defer

`page:validate`, `slug:validate`, and `slug:transform` have no clear call sites in the current transformer that make sense to extract yet. `page:validate` would go at the very top of `transformPage()`—before `shouldExclude`—but it duplicates what `page:exclude` already handles for the main use case. `slug:validate` and `slug:transform` would need to sit inside `resolveSlug()`, which is already complex. Leave these as no-ops until there's a concrete use case that requires them.

---

## Change 6: Registry owns context construction; services passed at construction time

**Status**: ❌ Not yet implemented — proposed here

### The problem

Currently the transformer builds context at each `execute()` call site:

```typescript
// Called ~8 times in the transformer, each time manually constructing context
const hookContext = { page, config: this.config, logger: this.logger };
const title = await this.hookRegistry.execute<string>('metadata:title', hookContext);
```

Effect context is built via a helper method:

```typescript
private createEffectHookContext(page: PageObjectResponse) {
  return {
    page,
    config: this.config,
    logger: this.logger,
    services: {
      notionClient: this.notionClient,
      supabase: this.supabaseClient
    }
  };
}
```

The registry only holds `logger`. Everything else that's needed for context—`config`, `services`—lives on the transformer, not the registry. This is backwards: the registry is the thing that executes hooks and should own the context it gives them.

### Proposed design

The registry constructor takes `config` and `services` at initialization time. `execute()` only takes `page`—the only thing that actually varies per call:

```typescript
class HookRegistry {
  constructor(
    logger: Logger,
    config: DatabaseBlueprint,
    services: EffectServices
  ) { ... }

  // Signature is derived from EventSignatures — see Change 2
  execute<E extends HookEvent>(
    event: E,
    page: PageObjectResponse,
    ...args: EventSignatures[E]['input'] extends never ? [] : [EventSignatures[E]['input']]
  ): Promise<EventSignatures[E]['output'] | null>
}
```

The transformer becomes:

```typescript
this.hookRegistry = new HookRegistry(this.logger, this.config, {
  notionClient: this.notionClient,
  supabase: this.supabaseClient   // instantiated client, not raw credentials
});

// All call sites simplify to:
const title = await this.hookRegistry.execute('metadata:title', page);
```

### User-extensible services

This also naturally solves user-extensible context. Users who need custom services in their effect hooks pass them at construction time, with types:

```typescript
// src/lib/symbiont.ts
const registry = new HookRegistry(logger, config, {
  notionClient,
  supabase,              // instantiated client, not raw credentials
  // Custom services—typed, available in any hook
  s3Client: new S3Client({ region: 'us-east-1' }),
  slack: new WebClient(SLACK_TOKEN)
});
```

The `services` type on `EffectContext` has an index signature (`[key: string]: unknown`) so user-defined keys don't cause type errors. Users who want stronger typing for their custom services can cast or use a typed wrapper hook.

An alternative is a generic parameter on `HookRegistry<TServices>` that merges into `services`, giving full type safety for custom services in effect hooks. This is cleaner but makes the registry type noisier. Worth considering if the use case appears in practice.

---

## Change 7: Named priority values instead of arbitrary numbers

**Status**: ❌ Not yet implemented — proposed here

The current field is `priority?: number` where lower runs first. The number is meaningless on its own—users have to look up that 40 means "before defaults" and 60 means "after."

Keep the field named `priority`, change the type to `'override' | 'fallback'`. Omitting it means "same order as defaults":

- **`'override'`** — runs before Symbiont's defaults. For first-wins events, your result wins if non-null. For merge/concat/run-all events, you contribute first.
- **`'fallback'`** — runs after Symbiont's defaults. For first-wins events, only reached if everything above returned null. For merge/concat/run-all, you augment last.
- **omitted** — same order as built-in defaults; among same-level hooks, registration order applies.

Internally maps to 40 / 50 / 60. Users never see numbers. If sub-ordering within a level is genuinely needed, a numeric `order` field can be added as an escape hatch—but it shouldn't be the default surface.

```typescript
// Override title: wins over Symbiont's default if non-null
{ name: 'caltech:title',      event: 'metadata:title',  priority: 'override', fn: ... }

// Fallback: only runs if nothing else gave a title
{ name: 'caltech:title-fallback', event: 'metadata:title', priority: 'fallback', fn: ... }

// Fallback for summary: only runs if nothing above extracted one
{ name: 'caltech:summary-fallback', event: 'metadata:summary', priority: 'fallback', fn: ... }
```

---

## What hook definitions look like for users

End-state UX assuming Changes 2, 6, and 7 are implemented. There is one `Hook` type and one import.

Hooks are passed in via the database config:

```typescript
// src/lib/symbiont.ts
import type { Hook } from 'symbiont-cms';

export const symbiont = createSymbiontClient({
  databases: [{
    alias: 'blog',
    notionDatabaseId: '...',
    hooks: [ headlineHook, coverUploadHook, slackNotifyHook ]
  }]
});
```

### Extracting data from a page

Return a value or `null`. The event's composition strategy determines what happens with the result.

```typescript
// Override title: return non-null to win over Symbiont's default
const headlineHook: Hook<string> = {
  name: 'caltech:headline',
  event: 'metadata:title',
  priority: 'override',
  fn: (ctx) => ctx.page.properties.Headline?.rich_text?.[0]?.plain_text ?? null
  //           null falls through to Symbiont's default title extraction
};

// Contribute extra fields to metadata (merge composition — no spreading needed)
const issueMetaHook: Hook = {
  name: 'caltech:issue-meta',
  event: 'metadata:custom',
  fn: (ctx) => ({
    issueNumber: ctx.page.properties.Issue?.number ?? null,
    volume:      ctx.page.properties.Volume?.number ?? null,
  })
};

// Conditional publish check — and-all: false from any hook blocks publishing, null = no opinion
const publishStatusHook: Hook<boolean> = {
  name: 'caltech:publish-check',
  event: 'publish:check',
  priority: 'override',
  fn: (ctx) => {
    const status = ctx.page.properties.Status?.select?.name;
    if (status === 'Published') return true;   // vote yes  — all hooks still run
    if (status === 'Draft')     return false;  // vote no   — blocks publish
    return null;                               // no opinion — doesn't affect aggregate
  }
};
```

### Side effects

Hooks on `run-all` events (`sync:*`, `cover:process`, `content:images`) always run all registered hooks regardless of return value. Services are in context.

```typescript
// Upload cover image to Supabase
const coverUploadHook: Hook = {
  name: 'caltech:cover-upload',
  event: 'cover:process',
  fn: async (ctx) => {
    const { supabaseUrl, serviceRoleKey } = ctx.services;
    const coverUrl = ctx.page.cover?.type === 'external'
      ? ctx.page.cover.external.url
      : null;
    if (!coverUrl) return;
    await uploadImageToSupabase(coverUrl, supabaseUrl, serviceRoleKey);
  }
};

// Slack notification on sync — uses a custom service injected at construction time
const slackNotifyHook: Hook = {
  name: 'caltech:slack-notify',
  event: 'sync:content',
  continueOnError: true,   // don't fail the sync if Slack is down
  fn: async (ctx) => {
    const slack = ctx.services.slack as WebClient;
    await slack.chat.postMessage({ channel: '#sync-log', text: `Synced: ${ctx.page.id}` });
  }
};
```

**Full context**: `ctx.page`, `ctx.config`, `ctx.logger`, `ctx.services` (built-in + custom), `ctx.abort(reason)`.
