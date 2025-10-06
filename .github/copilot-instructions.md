# GitHub Copilot Instructions

## Project Documentation

**IMPORTANT**: This project has comprehensive documentation in the `.docs/` folder. Always refer to these docs when answering questions about the project:

### Core Documentation (Read These First)
- **`.docs/symbiont-cms.md`** - Complete Symbiont CMS guide (philosophy, architecture, API reference)
- **`.docs/zero-rebuild-cms-vision.md`** - Dynamic CMS vision and transition strategy
- **`.docs/README.md`** - Documentation index and reading order

### Implementation Guides
- **`.docs/QUICKSTART.md`** - Quick start guide
- **`.docs/INTEGRATION_GUIDE.md`** - QWER + Symbiont integration details
- **`.docs/TYPE_COMPATIBILITY.md`** - Type system compatibility

### Strategy Documents
- **`.docs/image-optimization-strategy.md`** - Image handling strategy
- **`.docs/dynamic-file-management.md`** - File upload & storage strategy
- **`.docs/dynamic-redirects-strategy.md`** - Dynamic redirects strategy

## Instructions for Copilot

1. **Before answering questions about architecture, design decisions, or implementation details**, check if the answer is in `.docs/`
2. **When suggesting changes**, ensure they align with the patterns documented in `.docs/`
3. **If documentation seems outdated**, point it out and suggest updates
4. **When creating new features**, reference relevant strategy docs (e.g., image-optimization-strategy.md)

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

- **Sync content from Notion**: `curl http://localhost:5173/api/sync/poll-blog`
- **Build symbiont-cms**: `pnpm -F symbiont-cms build`
- **Run qwer-test**: `pnpm -F qwer-test dev`

---

**Last Updated**: October 5, 2025
