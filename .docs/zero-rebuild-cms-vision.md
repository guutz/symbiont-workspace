# Zero-Rebuild CMS Vision# Zero-Rebuild CMS ## Where we stand (Oct 2025)



> **📖 The Complete Vision** - Dynamic CMS architecture where content, media, and routing changes appear instantly  **✅ What's WorPhases 2–3 unblock "zero rebuild" claims for most sites; later phases round out the CMS experience.

> **Last Updated:** November 9, 2025  

> **Current Status:** Phase 1 complete (~98%), Phase 2 in progress (storage configured)**Note**: Phases 2-3 have complete design documents but **no code implementation yet**. See respective strategy docs for full designs.ing (Production Ready)**

- **Dynamic posts** are live: Notion → Symbiont sync → Nhost → SvelteKit SSR

This document captures the complete vision for Symbiont CMS: a world where editors publish content, media, and routing changes without ever triggering a rebuild. Use this document as the executive summary of that journey.- **Feature detection** runs at ingestion so render paths stay lean

- **Build pipeline** only compiles the SvelteKit app; no content artifacts are generated

---- **GraphQL client/server** utilities fully functional

- **Multi-tenant support** via `source_id` in database schema

## Vision snapshot- **Feed generation** (Atom, JSON, Sitemap) backed by live data



| Today (legacy static build) | Tomorrow (zero-rebuild) | Status |**⚠️ What's Missing (Needs Implementation)**

|-----------------------------|-------------------------|--------|- **No file upload system** - File upload utilities not yet implemented

| Markdown and JSON generated during CI | Content authored in Notion/Tiptap, synced to Postgres | ✅ **Shipped** |- **No Nhost Storage config** - Storage buckets not configured in `nhost.toml`

| Assets baked into the bundle | Assets stored in Nhost, served on-demand | 🔄 **In Progress** |- **No observability** - Manual log inspection only, no structured logging/alerts

| Redirects encoded in `vercel.json` | Redirects resolved from the database at request time | 📋 **Designed** |- **No testing infrastructure** - Zero test coverage in `symbiont-cms` package

| Minutes to see a change | Seconds from edit to live | ✅ **Working** for posts |- **No redirect system** - Database schema and middleware not implemented



We already ship the content leg of this vision in production; the rest extends the same pattern across assets, redirects, and configuration.---



---## Roadmap phases



## Where we stand (November 2025)| Phase | Scope | Status | Immediate next step |

|-------|-------|--------|---------------------|

**✅ What's Working (Production Ready)**| 1 | Posts | ✅ **Shipped** | Add tests + observability |

- **Dynamic posts** are live: Notion → Symbiont sync → Nhost → SvelteKit SSR| 2 | Media & files | 📋 **Designed only** | Configure Nhost Storage buckets + implement upload utilities |

- **Optimized sync** with timestamp comparison (5-10x faster for unchanged content)| 3 | Redirects | 📋 **Designed only** | Create database migration + middleware implementation |

- **Tags & authors** properly synced from Notion properties| 4 | Site config | 💭 **Concept** | Define schema + editorial workflow |

- **Slug management** with conflict resolution and optional sync-back to Notion| 5 | Authoring surface | 💭 **Concept** | Validate collaborative editor stack (Tiptap + Hocuspocus) |nt roadmap aims for a world where editors publish content, media, and routing changes without ever triggering a rebuild. Use this document as the executive summary of that journey.

- **Feature detection** framework in place (ready for phase 1.5 enhancements)

- **Build pipeline** only compiles the SvelteKit app; no content artifacts generated---

- **GraphQL client/server** utilities fully functional with type safety

- **Multi-tenant support** via `datasource_id` in database schema## Vision snapshot

- **Feed generation** (Atom, JSON, Sitemap) backed by live data

- **Structured logging** with Pino throughout sync process| Today (legacy static build) | Tomorrow (zero-rebuild) |

- **Comprehensive tests** - 105/105 passing across 5 test suites|-----------------------------|-------------------------|

| Markdown and JSON generated during CI | Content authored in Notion/Tiptap, synced to Postgres |

**🔄 What's In Progress (November 2025)**| Assets baked into the bundle | Assets stored in Nhost, served on-demand |

- **Nhost Storage configured** - blog-images bucket ready (v0.9.1)| Redirects encoded in `vercel.json` | Redirects resolved from the database at request time |

- **Image upload utilities** - Next step in development| Minutes to see a change | Seconds from edit to live |

- **URL rewriting** - Design complete, implementation next

We already ship the content leg of this vision in `qwer-test`; the rest extends the same pattern across assets, redirects, and configuration.

**⚠️ What's Missing (Needs Implementation)**

- **Image processing** - Upload utilities and URL rewriting not implemented yet---

- **Hasura storage permissions** - Need to configure file access rules

- **Redirect system** - Database schema and middleware not implemented (Phase 3)## Where we stand (Oct 2025)

- **Site config management** - Not yet designed (Phase 4)

- **Retry logic** - Exponential backoff for failed syncs- **Dynamic posts** are live: Notion → Symbiont sync → Nhost → SvelteKit SSR.

- **Webhook signature verification** - Security enhancement needed- **Feature detection** runs at ingestion so render paths stay lean.

- **Build pipeline** only compiles the SvelteKit app; no content artifacts are generated.

---- **Observability hooks** are on the backlog; we still rely on manual log inspection for sync errors.



## Roadmap phases---



| Phase | Scope | Status | Immediate next step |## Roadmap phases

|-------|-------|--------|---------------------|

| 1 | Posts | ✅ **~98% Complete** | Retry logic + webhook verification || Phase | Scope | Status | Immediate next step |

| 2 | Media & files | 🔄 **In Progress** | Build image upload utilities ||-------|-------|--------|---------------------|

| 3 | Redirects | 📋 **Designed only** | Create database migration + middleware implementation || 1 | Posts | ✅ complete | Harden monitoring + retries |

| 4 | Site config | 💭 **Concept** | Define schema + editorial workflow || 2 | Media & files | 🚧 in progress | Implement Notion → Nhost upload & URL swapping (see `dynamic-file-management.md`) |

| 5 | Authoring surface | 💭 **Concept** | Validate collaborative editor stack (Tiptap + Hocuspocus) || 3 | Redirects | 🚧 in discovery | Prototype middleware + caching (see `dynamic-redirects-strategy.md`) |

| 4 | Site config | 🔮 later | Define schema + editorial workflow |

**Note**: Phases 2–3 unlock "zero rebuild" claims for most sites; later phases round out the CMS experience.| 5 | Authoring surface | 🔮 later | Validate collaborative editor stack (Tiptap + Hocuspocus) |



**Design Documents**: Phases 2-3 have complete design documents but code implementation is incomplete. See respective strategy docs for full designs.Phases 2–3 unblock “zero rebuild” claims for most sites; later phases round out the CMS experience.



------



## Phase 1: Dynamic Posts (✅ Complete)## Operating model



### What shipped```

- Notion sync with customizable publishing rulesNotion change ─► Symbiont sync (poll/webhook) ─► Nhost (Postgres + Storage)

- GraphQL-backed content storage (Postgres via Nhost)      │                                             │

- Server-side markdown rendering      └────────────── observability ────────────────┘

- Feed generation (Atom, JSON, sitemap)                                    │

- Multi-database support (via `datasource_id`)                              SvelteKit SSR

- Slug conflict resolution                                    │

- Tags & authors extraction                            Edge caches / CDN

- Performance optimizations (timestamp comparison, conditional slug sync)                                    │

- Structured logging with Pino                              Visitor response

- Comprehensive test coverage (105 tests)```



### November 2025 improvements- Prefer webhooks for near-instant updates; keep polling as a backup.

- **Tags & authors sync** - Fixed null values via config properties- Serve SSR responses with `public, max-age=300, stale-while-revalidate=600` to balance freshness and cost.

- **Upsert optimization** - Changed to `pages_pkey` constraint (handles null slugs)- Track sync duration, mutation counts, and failure payloads once logging infrastructure is in place.

- **Performance boost** - Timestamp comparison skips unchanged pages (5-10x faster)

- **Slug sync fix** - Only updates Notion when slug actually changes (prevents loops)---



### Remaining work (~2%)## Build & runtime impact

- Retry logic with exponential backoff

- Webhook signature verification- Deprecated: markdown-to-JSON generation, `$generated` imports, build-time image transforms.

- Integration tests (optional)- Retained: standard SvelteKit compile, static assets that rarely change, client stores hydrated from SSR payloads.

- Performance delta: SSR adds ~200 ms versus static pages, but caching keeps TTFB well under acceptable thresholds.

---- Success criteria

  - Editors see changes live in < 60 s without a deploy.

## Phase 2: Media & Files (🔄 In Progress)  - Non-developers control posts, media, and redirects end-to-end.

  - Sync failures retry automatically or surface actionable alerts.

### Goal  - Queries remain fast as content volume grows (indexes + pagination baked in).

Images and files uploaded to Nhost Storage during sync, with automatic URL rewriting in markdown.

---

### What's implemented

- ✅ Nhost Storage v0.9.1 configured## Decision log

- ✅ `blog-images` bucket created (10MB limit, 1-year cache)

- ✅ Design documents complete| Decision | Date | Rationale | Trade-off |

|----------|------|-----------|-----------|

### What's next| Adopt Nhost as the backbone | 2025-10-05 | Unified DB, storage, auth, serverless functions | Coupling to Hasura schema conventions |

1. Set up Hasura permissions for `storage.files` table| Detect markdown features at ingestion | 2025-10-07 | Simplify runtime rendering & TOC generation | Requires backfill for legacy rows |

2. Build image URL extraction utility (markdown + Notion properties)| Keep config in `.js` (with JSDoc types) | 2025-10-05 | Zero-build-compatible runtime imports | Rely on lint + TS checks instead of compile-time types |

3. Create download/upload pipeline

4. Integrate URL rewriting into sync flow---

5. Test with real posts containing images

6. (Optional) Add files metadata table for deduplication## Key next bets



### Why this matters**Immediate Priorities (To Enable Phase 1 Production Use):**

- **Notion image URLs expire** after ~1 hour (AWS S3 signed URLs)1. **Testing infrastructure** – Set up Vitest, add core unit tests for sync/markdown/GraphQL

- **Nhost URLs are permanent** and CDN-backed2. **Structured logging** – Implement observability for sync success/failure tracking

- **On-the-fly optimization** via URL parameters (`?w=800&fm=webp`)3. **Error handling** – Add proper error boundaries and retry logic in sync handlers

- **Better performance** - cached images, modern formats

**Phase 2 Implementation (Media & Files):**

### Design documents4. **Nhost Storage setup** – Configure buckets in `nhost.toml` (see `dynamic-file-management.md` for design)

- `.docs/image-optimization-strategy.md` - Complete implementation plan5. **File upload utilities** – Implement `file-upload.ts` server utilities

- `.docs/dynamic-file-management.md` - File metadata and deduplication6. **Image URL rewriting** – Mirror Notion images to Nhost, rewrite URLs in markdown



---**Phase 3 Implementation (Redirects):**

7. **Database migration** – Create redirects table schema (see `dynamic-redirects-strategy.md` for design)

## Phase 3: Dynamic Redirects (📋 Designed)8. **Middleware** – Implement redirect resolution in `hooks.server.ts`

9. **Admin UI** – Build simple interface for redirect management

### Goal

Redirect management via database, no rebuild/redeploy needed.---



### Architecture## See also

```

Database Table → SvelteKit Middleware → Response.redirect()- `symbiont-cms.md` – package surface and configuration contract.

```- `dynamic-file-management.md` & `image-optimization-strategy.md` – full design for media migration.

- `dynamic-redirects-strategy.md` – redirect schema and middleware plan.

### What needs implementation- `TYPE_COMPATIBILITY.md` – snapshot of post mapping across systems.

1. Create `redirects` table migration

2. Add Hasura permissions**Last refreshed:** October 8, 2025

3. Implement SvelteKit middleware in `hooks.server.ts`// packages/qwer-test/src/generated/

4. Build admin UI for redirect management
5. (Optional) Add analytics tracking

### Why this matters
- Change URLs instantly without redeploying
- Temporary redirects for campaigns
- Track redirect usage
- Manage 404s dynamically

### Design document
- `.docs/dynamic-redirects-strategy.md` - Complete schema and middleware design

---

## Phase 4: Site Configuration (💭 Concept)

### Goal
Manage site-wide settings (nav, footer, metadata) via Notion/database.

### Ideas
- Navigation structure stored in database
- SEO metadata (site title, description, Open Graph)
- Feature flags (enable/disable features)
- Theme configuration

### Status
Not yet designed. Would follow same pattern as posts: Notion → sync → database → runtime.

---

## Phase 5: Collaborative Authoring (💭 Concept)

### Goal
Rich text editor alternative to Notion for collaborative editing.

### Proposed stack
- **Tiptap** - Rich text editor
- **Hocuspocus** - Real-time collaboration server
- **Markdown export** - Convert to markdown for storage
- **Bidirectional sync** - Tiptap ↔ Database

### Status
Proof of concept only. Would be Phase 5 (after images, redirects, config).

---

## Architecture Principles

1. **Database as source of truth** - All content lives in Postgres
2. **Notion as control panel** - Beautiful UI for content management
3. **Zero build artifacts** - Content never touches the build process
4. **SSR by default** - Server-side rendering for SEO and performance
5. **Incremental adoption** - Each phase adds value independently
6. **Type-safe** - Full TypeScript support throughout

---

## Success Metrics

- ✅ **Content update time**: Seconds (not minutes)
- ✅ **Build time**: Independent of content volume
- 🔄 **Image availability**: 100% uptime (in progress)
- 📋 **Redirect latency**: <50ms (not implemented)
- ✅ **Developer experience**: Type-safe, documented, tested

---

**For detailed implementation status**, see `.docs/IMPLEMENTATION_STATUS.md`

**For API reference**, see `.docs/symbiont-cms.md`

**For integration guide**, see `.docs/INTEGRATION_GUIDE.md`
