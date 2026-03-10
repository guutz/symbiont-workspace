# GitHub Copilot Instructions

## Project Documentation

**IMPORTANT**: This project has comprehensive documentation in the `.docs/` folder. Always refer to these docs when answering questions about the project:

### Core Documentation (Read These First)
- **`.docs/symbiont-cms.md`** - Complete Symbiont CMS guide (philosophy, architecture, API reference)
- **`.docs/zero-rebuild-cms-vision.md`** - Dynamic CMS vision and transition strategy
- **`.docs/IMPLEMENTATION_STATUS.md`** - **⭐ Honest tracker of what's shipped vs. designed vs. conceptual**
- **`.docs/README.md`** - Documentation index and reading order

### Design Memos
- **`.docs/2026-02-21-hook-events-design-memo.md`** - Hook system design
- **`.docs/2026-03-09-notion-markdown-absorption-memo.md`** - **⭐ notion-md module rationale** (equation round-trip fix, library absorption)

### Implementation Guides
- **`.docs/QUICKSTART.md`** - Quick start guide
- **`.docs/INTEGRATION_GUIDE.md`** - QWER + Symbiont integration details
- **`.docs/TYPE_COMPATIBILITY.md`** - Type system compatibility

### Strategy Documents (⚠️ Designs Only - Not Yet Implemented)
- **`.docs/image-optimization-strategy.md`** - Image handling strategy (Phase 2 - designed but not coded)
- **`.docs/dynamic-file-management.md`** - File upload & storage strategy (Phase 2 - designed but not coded)
- **`.docs/dynamic-redirects-strategy.md`** - Dynamic redirects strategy (Phase 3 - designed but not coded)

## Instructions for Copilot

1. **Before answering questions about architecture, design decisions, or implementation details**, check if the answer is in `.docs/`
2. **Check IMPLEMENTATION_STATUS.md first** - Know what's actually shipped vs. just designed
3. **When suggesting changes**, ensure they align with the patterns documented in `.docs/`
4. **Distinguish between shipped and planned features** - Don't suggest using Phase 2/3 features that aren't implemented yet
5. **If documentation seems outdated**, point it out and suggest updates
6. **When creating new features**, reference relevant strategy docs

## Current Implementation Status

See `.docs/IMPLEMENTATION_STATUS.md` for the source of truth. It is updated regularly and reflects current regressions and priorities.

## Project Structure

- **`packages/symbiont-cms/`** - The core CMS package (NPM package)
- **`packages/california-tech/`** - California Tech newspaper site implementation
- **`packages/guutz-blog/`** - Personal blog implementation
- **`supabase/`** - Supabase backend configuration (database, storage)

> Note: `packages/markdown-to-notion/` (the `@tryfabric/martian` fork) has been absorbed into symbiont-cms and removed.

## Key Architectural Principles

1. **Zero-Rebuild CMS** - Content updates should appear instantly without rebuilds
2. **Notion as Control Panel** - Notion is the primary content authoring interface
3. **Database as Source of Truth** - Supabase Postgres stores all content
4. **Type-Safe Configuration** - `src/lib/symbiont.ts` client configuration with type safety
5. **SSR First** - SvelteKit SSR for SEO and performance

## Technology Stack

- **Frontend**: SvelteKit (SSR)
- **Backend**: Supabase (Postgres + Storage + Auth)
- **CMS**: Notion (via API)
- **Package**: `symbiont-cms` (TypeScript, published to npm)
- **Markdown parsing**: `unified@9` + `remark-parse@9` + `remark-gfm@1` (CJS, direct deps of symbiont-cms)
- **HTML rendering**: `markdown-it` + `@mdit/plugin-*` (including `@mdit/plugin-katex`)

## notion-md Module (`src/lib/server/notion-md/`)

**Equation Delimiter Convention**: `$$expr$$` for both block and inline equations.
- **Block equation**: `$$expr$$` is the sole content of a paragraph
- **Inline equation**: `$$expr$$` appears alongside other text
- Single `$` is **never** treated as math (no currency ambiguity)
- This convention is compatible with `@mdit/plugin-katex` for HTML rendering

**Files**:
- `types.ts` — Notion API limits, options interfaces, `BlockTransformerFn` type
- `languages.ts` — Code language map + `parseCodeLanguage()` / `isSupportedCodeLang()`
- `rich-text.ts` — `richTextToMarkdown()`, `richText()`, `ensureLength()` helpers
- `blocks-to-markdown.ts` — Notion blocks → markdown string (Notion→DB direction)
- `markdown-to-blocks.ts` — Markdown → Notion blocks (DB→Notion direction)

**Custom block transformers** are registered on `NotionClient`:
```typescript
notionClient.setBlockTransformer('image', async (block, fetchChildren) => {
  // Return a markdown string, or `false` to use default behavior
  return `![alt](url)`;
});
```

## Common Tasks

- **Sync content from Notion**: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:5173/api/sync/poll-blog`
  - Or with query param: `curl "http://localhost:5173/api/sync/poll-blog?secret=$CRON_SECRET"`
- **Build symbiont-cms**: `pnpm build:package` (no separate compile step needed — prebuild removed)
- **Run california-tech app**: `pnpm dev:tech`
- **Run guutz-blog**: `pnpm dev:guutz`
- **Run tests**: `pnpm --filter symbiont-cms test`

## Development Priorities

1. **Complete media wiring** (cover image upload, inline image upload)
2. **Implement bidirectional metadata sync** (write metadata changes back to Notion)
3. **Add `resolveNotionPageLinks` content transform** (convert `notion://page/{id}` → public slug)
4. **Add `htmlCodeToEmbed` renderer override** (treat `html` code blocks as raw HTML passthrough)
5. **Configure Supabase Storage policies** (RLS policies for media bucket)

## CI/CD

- **GitHub Actions**: `.github/workflows/ci.yml` runs tests and type checks on every push/PR
- Uses `pnpm/action-setup@v4` — no manual pnpm installation needed
- Caches pnpm store for fast installs

---

**Last Updated**: March 10, 2026
