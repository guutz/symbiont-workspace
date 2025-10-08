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

## Current Implementation Status (Oct 2025)

### ✅ What's Working (Phase 1 - 80% Complete)
- Dynamic post sync from Notion → Nhost → SvelteKit
- GraphQL client/server utilities
- Markdown rendering with feature detection
- Multi-tenant database schema
- Feed generation (Atom, JSON, Sitemap)
- Type-safe configuration system

### ⚠️ What's Missing from Phase 1
- Testing infrastructure (zero tests)
- Structured logging/observability
- Retry logic for sync failures
- Webhook support (only polling)

### 📋 What's Designed But Not Implemented
- **Phase 2 (Media)**: File uploads, Nhost Storage config, image URL rewriting
- **Phase 3 (Redirects)**: Database table, middleware, admin UI
- See `.docs/IMPLEMENTATION_STATUS.md` for complete breakdown

## Project Structure

- **`packages/symbiont-cms/`** - The core CMS package (NPM package)
- **`packages/qwer-test/`** - Example integration with QWER template
- **`packages/guutz-blog/`** - Personal blog implementation
- **`nhost/`** - Nhost backend configuration (database, GraphQL, storage)

## Key Architectural Principles

1. **Zero-Rebuild CMS** - Content updates should appear instantly without rebuilds
2. **Notion as Control Panel** - Notion is the primary content authoring interface
3. **Database as Source of Truth** - Nhost Postgres stores all content
4. **Type-Safe Configuration** - `symbiont.config.ts` defines all sync rules
5. **SSR First** - SvelteKit SSR for SEO and performance

## Technology Stack

- **Frontend**: SvelteKit (SSR)
- **Backend**: Nhost (Postgres + Hasura GraphQL + Storage)
- **CMS**: Notion (via API)
- **Package**: `symbiont-cms` (TypeScript, published to npm)

## Common Tasks

- **Sync content from Notion**: `curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:5173/api/sync/poll-blog`
  - Or with query param: `curl "http://localhost:5173/api/sync/poll-blog?secret=$CRON_SECRET"`
- **Build symbiont-cms**: `pnpm build:package`
- **Run qwer-test**: `pnpm dev:qwer`
- **Run guutz-blog**: `pnpm dev:guutz`

## Development Priorities

1. **Add testing infrastructure** (Vitest setup, unit tests for core functions)
2. **Implement observability** (structured logging, error tracking)
3. **Configure Nhost Storage** (foundation for Phase 2 media features)
4. **Build file upload utilities** (Phase 2 implementation)

---

**Last Updated**: October 8, 2025
