# GitHub Copilot Instructions

## Project Documentation

**IMPORTANT**: This project has comprehensive documentation in the `.docs/` folder. Always refer to these docs when answering questions about the project:

### Core Documentation (Read These First)
- **`.docs/symbiont-cms.md`** - Complete Symbiont CMS guide (philosophy, architecture, API reference)
- **`.docs/zero-rebuild-cms-vision.md`** - Dynamic CMS vision and transition strategy
- **`.docs/IMPLEMENTATION_STATUS.md`** - **⭐ Honest tracker of what's shipped vs. designed vs. conceptual**
- **`.docs/README.md`** - Documentation index and reading order

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
6. **When creating new features**, reference relevant strategy docs (e.g., image-optimization-strategy.md)

## Current Implementation Status

See `.docs/IMPLEMENTATION_STATUS.md` for the source of truth. It is updated regularly and reflects current regressions and priorities (media wiring, bidirectional metadata, redirects).

## Project Structure

- **`packages/symbiont-cms/`** - The core CMS package (NPM package)
- **`packages/california-tech/`** - California Tech newspaper site implementation
- **`packages/guutz-blog/`** - Personal blog implementation
- **`packages/markdown-to-notion/`** - Forked Martian package for Notion block conversion
- **`supabase/`** - Supabase backend configuration (database, storage)

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

## Common Tasks

- **Sync content from Notion**: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:5173/api/sync/poll-blog`
  - Or with query param: `curl "http://localhost:5173/api/sync/poll-blog?secret=$CRON_SECRET"`
- **Build symbiont-cms**: `pnpm build:package`
- **Run california-tech app **: `pnpm dev:tech`
- **Run guutz-blog**: `pnpm dev:guutz`

## Development Priorities

1. **Add testing infrastructure** (Vitest setup, unit tests for core functions)
2. **Implement observability** (structured logging, error tracking)
3. **Configure Supabase Storage policies** (RLS policies for media bucket)
4. **Complete bidirectional sync** (write changes from database back to Notion)

---

**Last Updated**: February 4, 2026
