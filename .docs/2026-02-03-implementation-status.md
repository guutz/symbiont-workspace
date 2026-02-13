# Implementation Status Tracker

> **Purpose:** Quick reference for what's actually implemented vs. designed vs. conceptual  
> **Last Updated:** February 3, 2026

This document provides an honest assessment of the Symbiont CMS implementation status, helping contributors understand what works, what's ready to build, and what's still in the idea phase.

---

## 🚀 Quick Summary (TL;DR)

**What's Working (February 2026):**
- ✅ Notion → Postgres sync pipeline (orchestrator/builder/repo) with slug resolution and `pages` table migrations
- ✅ Server-side markdown rendering pipeline and structured logging
- ✅ Basic unit tests (6 test files, Vitest configured) for sync utilities and helpers
- ✅ Image upload to Supabase Storage + URL rewrite in markdown content
- ✅ **Image URL sync-back to Notion** - Cover images and markdown images are uploaded to Supabase, then Notion pages are updated with permanent Supabase URLs (replaces expired Notion CDN URLs)
- ✅ **Slug sync-back to Notion** - Generated/resolved slugs are synced to configured Notion property
- ✅ **Exclude rule for pre-sync filtering** - `excludeRule` in config allows filtering pages before they enter the database (templates, archives, test pages)

**What's Risky/Broken Right Now:**
- ⚠️ Local dev (SvelteKit apps) currently renders zero posts — likely a too-strict `isPublicRule`/publishing rule or query shape change; needs verification
- ⚠️ Storage bucket/permission config is not checked into `nhost/nhost.toml` (using console/default bucket only)

**What's Next:**
- 🟡 Wire image pipeline into sync (markdown rewrite + cover extraction)
- 🟡 Add explicit Nhost bucket declarations and Hasura storage permissions to the repo
- 🟡 Fix the local dev regression (posts not loading) and add a regression test
- 📋 Redirect management (designed, not started)

---

## 🆕 Recent Changes

### February 3, 2026 (PM)
- **Exclude Rule**: Added `excludeRule` to `DatabaseBlueprint` config for pre-sync filtering
  - Applied before timestamp comparison (most efficient)
  - Return `true` to exclude pages from database entirely
  - Use cases: archive pages, templates, test content, workspace organization
  - Added `shouldExclude()` method to `NotionToDatabaseSync` class
  - Updated documentation in `publishing-rules.md` with examples and decision flow
  - Added example usage in `guutz-blog/symbiont.config.js`

### February 3, 2026 (AM)
- **Metadata Sync Strategy**: Clarified that only **slugs** sync back to Notion during normal sync (not title/tags/dates)
- **Image Sync-Back**: Implemented full image URL sync-back to Notion:
  - Cover images: After uploading to Supabase, update Notion cover property with permanent URL
  - Markdown images: After processing content images, update Notion page blocks with Supabase URLs
  - Replaces expired Notion CDN URLs with permanent Supabase Storage URLs
  - Added `NotionClient.updateFileProperty()` method for file property updates
- **Migration Note**: Critical for Nhost→Supabase migration - ensures Notion pages reference new Supabase URLs

### December 9, 2025
- **Media**: Shipped image upload/rewrite helpers (`src/lib/image-processor.ts`, `image-upload.ts`, `image-utils.ts`) using Nhost `uploadFiles`; tested against default bucket
- **Infra**: Nhost Storage working via console/default bucket, but no bucket entries or permissions are committed to `nhost/nhost.toml`
- **Regression**: Local dev apps show zero posts after the media work; needs root-cause analysis

### November 9, 2025
- **Performance**: Added timestamp comparison - syncs now 5-10x faster for unchanged content
- **Bug Fix**: Changed upsert constraint to `pages_pkey` to properly handle null slugs
- **Bug Fix**: Only sync slug back to Notion when actually changed (prevents infinite loops)
- **Feature**: Tags & authors now properly sync from configured Notion properties
- **Infrastructure**: Nhost Storage v0.9.1 configured with blog-images bucket (superseded; config not committed)

### November 2, 2025
- **Refactor**: Complete architecture overhaul with class-based separation
  - NotionAdapter (API layer)
  - PostBuilder (business logic)
  - PostRepository (database layer)
  - SyncOrchestrator (coordination)
- **Migration**: Database schema changed from `posts` to `pages` table
- **Simplification**: Sync endpoint reduced from 176 to ~90 lines
- **Consistency**: All terminology switched to `datasource_id` (from mixed naming)

### October 2025
- **Testing**: Added Vitest with 105 tests passing across 5 test suites
- **Logging**: Implemented Pino structured logging throughout
- **Documentation**: Complete architecture docs and integration guides
- **Example**: Full QWER integration with 4-file hybrid rendering pattern

---

## 📊 Overall Status

| Phase | Status | Complete | Ready For |
|-------|--------|----------|-----------|
| **Phase 1: Core CMS** | 🟡 Mostly complete, but local dev regression (no posts) needs fixing | Nov 2025 baseline | Sync + markdown + logging in place; investigate dev regression |
| **Phase 2: Media** | 🟡 Partial | Dec 2025 | Nhost storage works; upload/rewrite helpers shipped; sync integration/permissions pending |
| **Phase 3: Redirects** | 📋 Designed | TBD | Dynamic URL management |
| **Phase 4+: Future** | 💭 Concept | TBD | CLI tools, advanced features |

**Current Milestone:** Fix the local dev regression, then wire the new image pipeline into sync with committed storage config/permissions.

---

## 🎯 Status Legend

| Symbol | Meaning | Description |
|--------|---------|-------------|
| ✅ | **Shipped** | Code exists, tested in production, documented |
| 🟡 | **Partial** | Core code exists but missing tests/docs/polish |
| 📋 | **Designed** | Complete design document, no implementation yet |
| 💭 | **Concept** | Idea stage, no formal design document |
| ❌ | **Blocked** | Cannot implement until dependency is resolved |

---

## Phase 1: Dynamic Posts (Core CMS) - ~98% Complete ⭐

### ✅ Content Sync (Shipped - Refactored November 2025)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| NotionAdapter | ✅ | `src/lib/server/notion/adapter.ts` | Pure API layer, handles queries/updates/conversions |
| PostBuilder | ✅ | `src/lib/server/sync/post-builder.ts` | Business logic: rules, metadata, slug resolution |
| PostRepository | ✅ | `src/lib/server/sync/post-repository.ts` | Database CRUD via GraphQL |
| SyncOrchestrator | ✅ | `src/lib/server/sync/orchestrator.ts` | Coordinates full sync with pagination |
| Factory pattern | ✅ | `src/lib/server/sync/factory.ts` | Dependency injection for all sync components |
| Sync endpoint | ✅ | `src/lib/server/sync.ts` | Simplified to ~90 lines using new classes |
| Webhook handler | ✅ | `src/lib/server/webhook.ts` | Single-page processing via orchestrator |

**Metadata Sync-Back Strategy (Notion → DB → Notion):**
- ✅ **Slugs**: Auto-generated slugs sync back to `slugSyncProperty` (if configured)
- ✅ **Image URLs**: Cover and markdown images sync back with permanent Supabase URLs
- ❌ **Title/Tags/Dates**: NOT synced back during normal sync (Notion is source of truth)
- 📋 **Future**: Web editor changes will push metadata per-page (not via batch sync)

### ✅ Configuration System (Shipped - Updated February 2026)

**Current Pattern**: `createSymbiontClient()` in `src/lib/symbiont.ts`

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Client factory | ✅ | `src/lib/client.ts` | `createSymbiontClient()` with type-safe config |
| Supabase integration | ✅ | Client + SSR support | Public credentials in config, service role from env |
| Config schema | ✅ | `src/lib/types.ts` | Complete TypeScript types for DatabaseBlueprint |
| Multi-database support | ✅ | Config `databases[]` array | Via `datasource_id` |
| Publishing rules | ✅ | `excludeRule` + `isPublicRule` + `publishDateRule` | Pre-filter + boolean gate + date extraction |
| Property mapping | ✅ | `tagsProperty`, `authorsProperty`, `coverProperty` | Flexible property name config |
| Slug configuration | ✅ | `slugRule`, `slugSyncProperty` | Custom extraction + sync-back |
| Metadata extraction | ✅ | `metadataExtractor` | Flexible JSONB metadata via function |

**Old Pattern (Deprecated)**: `defineConfig()` in `symbiont.config.js` - DO NOT USE
- Still exported for backwards compatibility but not recommended
- See [california-tech/src/lib/symbiont.ts](../packages/california-tech/src/lib/symbiont.ts) for current pattern

### ✅ Database Schema (Shipped - Migrated November 2025)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Pages table | ✅ | `nhost/migrations/*/up.sql` | Replaced old `posts` table |
| Primary key | ✅ | `page_id` (TEXT) | Uses Notion page UUID directly |
| Multi-tenancy | ✅ | `datasource_id` column | Replaces old `source_id` |
| Indexes | ✅ | Multiple indexes | `datasource_id`, `slug`, `publish_at`, GIN on JSONB |
| Unique constraints | ✅ | Two constraints | `pages_pkey`, `pages_datasource_id_slug_key` |
| JSONB columns | ✅ | `tags`, `authors`, `meta` | Flexible arrays and metadata |
| Nullable slugs | ✅ | `slug TEXT` (nullable) | Supports unpublished posts |

### ✅ Server Utilities (Shipped - Updated November 2025)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| GraphQL admin client | ✅ | `src/lib/server/queries.ts` | Lazy singleton with admin secret |
| Query generators | ✅ | `src/lib/server/queries.ts` | Type-safe query builders for pages table |
| Server query wrappers | ✅ | `src/lib/server/queries.ts` | Uses new `pages` table schema |
| Post loader | ✅ | `src/lib/server/post-loader.ts` | Simplified `postLoad()` wrapper for `+page.server.ts` |
| Markdown processor | ✅ | `src/lib/server/markdown-processor.ts` | Server-side rendering with TOC |
| Logger | ✅ | `src/lib/server/utils/logger.ts` | Pino structured logging |
| Environment helpers | ✅ | `src/lib/server/utils/env.server.ts` | Required env var validation |
| Slug helpers | ✅ | `src/lib/server/utils/slug-helpers.ts` | Slug generation and validation |

### 🟡 Testing Infrastructure (Partial)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Vitest setup | ✅ | `vitest.config.ts` | Node environment with `vitest.setup.ts` |
| Unit tests | 🟡 | `src/lib/**/*.test.ts` | 6 small suites (queries, slug helpers, notion adapter, post repository, post builder, orchestrator); coverage is thin |
| Coverage reporting | 🟡 | `vitest.config.ts` | Configured but not run regularly; no artifacts checked in |

**Gaps:** Integration tests are missing and there's no regression test for the current "no posts rendering" bug.

### ✅ QWER Integration Example (Shipped - NEW!)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Post converter utility | ✅ | `qwer-test/src/lib/utils/post-converter.ts` | Symbiont → QWER format mapping |
| Param matcher | ✅ | `qwer-test/src/params/slug.ts` | Prevents `.xml`/`.json` from matching `[slug]` |
| SSR page load | ✅ | `qwer-test/src/routes/[slug=slug]/+page.server.ts` | Uses `postLoad()` wrapper |
| Client navigation | ✅ | `qwer-test/src/routes/[slug=slug]/+page.ts` | SPA transitions via API |
| API endpoint | ✅ | `qwer-test/src/routes/api/posts/[slug]/+server.ts` | JSON API with caching |
| Display component | ✅ | `qwer-test/src/routes/[slug=slug]/+page.svelte` | Full QWER styling, TOC, SEO |
| Feed generation | ✅ | `qwer-test/src/routes/atom.xml/+server.ts` | Atom feed from database |
| Sitemap generation | ✅ | `qwer-test/src/routes/sitemap.xml/+server.ts` | XML sitemap from database |

**Architecture Pattern:** 4-file hybrid rendering strategy
- See `qwer-test/docs/HYBRID_IMPLEMENTATION.md` for complete guide
- Server-side rendering for SEO
- Client-side navigation for speed
- Progressive enhancement (works without JS)
- Shared utilities for consistency

### ✅ UI Helper Components (Shipped - NEW!)

> **Architecture:** Symbiont uses a [4-file hybrid rendering strategy](2025-10-09-hybrid-strategy.md) where markdown is always rendered server-side and returned as HTML. Users render `{@html data.html}` directly with optional helper components.

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| PostHead | ✅ | `src/lib/components/PostHead.svelte` | SEO meta tags (Open Graph, Twitter cards) |
| PostMeta | ✅ | `src/lib/components/PostMeta.svelte` | Date/tags display with customizable styling |
| TOC | ✅ | `src/lib/components/TOC.svelte` | Table of contents with active section highlighting |
| Editor (placeholder) | 🟡 | `src/lib/components/Editor.svelte` | Stub file; no implementation yet |

**Usage Pattern:**
```svelte
<script>
   import { PostHead, PostMeta, TOC } from 'symbiont-cms';
  export let data;
</script>

<PostHead {post} siteName="My Blog" baseUrl="https://example.com" />

<article>
  <PostMeta {post} showReadingTime={true} />
  <TOC items={data.toc} />
  {@html data.html}
</article>
```

### ✅ Markdown & Feature Detection (Rendering shipped, detection pending)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Markdown processor | ✅ | `src/lib/server/markdown-processor.ts` | markdown-it with TOC, Prism, KaTeX, footnotes, etc. |
| Prism language loading | ✅ | Same file | Server-side lazy loading |
| TOC generation | ✅ | Same file | Configurable heading levels |
| Feature types | ✅ | `src/lib/types.ts` | `ContentFeatures` + `TocItem` exported |
| Feature detection | ❌ | n/a | Not computed; callers would need to supply features manually |
| Database features column | ❌ | n/a | `pages` migrations do not include a `features` column |
| Client asset loading | ❌ | n/a | No `FeatureLoader` component; assets load unconditionally today |

**Current State:**
- Server-side rendering + TOC/Prism are working
- No automated feature detection or persistence yet
- Add detection + client asset toggling once features are stored

### ⚠️ Phase 1 Recent Improvements (November 2025)

#### ✅ November 9, 2025 - Performance & Correctness
| Component | Status | Impact | Notes |
|-----------|--------|--------|-------|
| Tags & Authors sync | ✅ | High | Fixed null values via `tagsProperty`/`authorsProperty` config |
| Upsert constraint | ✅ | Critical | Changed to `pages_pkey` to handle null slugs properly |
| Sync performance | ✅ | High | Timestamp comparison skips unchanged pages (5-10x faster) |
| Slug sync optimization | ✅ | High | Only syncs back to Notion when slug actually changes (prevents infinite loops) |

#### ✅ November 2, 2025 - Architecture Refactor
| Component | Status | Impact | Notes |
|-----------|--------|--------|-------|
| Class-based separation | ✅ | High | NotionAdapter, PostBuilder, PostRepository, SyncOrchestrator |
| Database migration | ✅ | Critical | Migrated from `posts` to `pages` table with cleaner schema |
| Terminology consistency | ✅ | Medium | `datasource_id` everywhere (was `source_id`/`dbNickname`) |
| Factory pattern | ✅ | Medium | Dependency injection for better testing |
| Slug consolidation | ✅ | High | All slug logic now in PostBuilder (was scattered) |

#### ✅ October 2025 - Testing & Polish
| Component | Status | Impact | Notes |
|-----------|--------|--------|-------|
| Structured logging | ✅ | High | Pino logger with structured JSON throughout |
| Unit tests | 🟡 | Medium | Small Vitest suite (6 files); coverage is thin |
| 4-file hybrid pattern | ✅ | Medium | SSR + client navigation example (qwer-test) |
| Documentation | ✅ | Medium | Architectural docs and guides |

**What's Left for Phase 1 (~2% remaining):**
- Retry logic with exponential backoff for Notion API failures
- Webhook signature verification for security
- Integration tests (optional - would require test Nhost instance)

---

## Phase 2: Media & Files

### 🟡 Image Management (Partial - December 2025)

| Component | Status | Design Doc | Notes |
|-----------|--------|------------|-------|
| Nhost Storage config | 🟡 | `image-optimization-strategy.md` | Works via console/default bucket; no bucket entries in `nhost/nhost.toml` yet |
| Storage permissions | ❌ | `image-optimization-strategy.md` | Hasura permissions for `storage.files` not set |
| Image URL extraction | ✅ | `image-optimization-strategy.md` | `image-utils.ts` handles markdown + Notion page extraction |
| File download/upload utilities | ✅ | `dynamic-file-management.md` | `image-upload.ts` downloads via fetch and uploads via `nhost.storage.uploadFiles` |
| URL rewriter | ✅ | `image-processor.ts` / `image-upload.ts` | `rewriteImageUrls` updates markdown based on upload results (manual use today) |
| Cover image handler | ❌ | `image-optimization-strategy.md` | Still need first-image extraction |
| Sync integration | ❌ | `image-optimization-strategy.md` | Helpers not yet called from PostBuilder/Orchestrator |

**Next Steps:**
1. Commit bucket declarations + storage permissions
2. Wire `processMarkdownImages` into sync path (batch + webhook)
3. Add cover-image extraction and optional size hints
4. Add regression test to ensure posts still render after image processing

### 📋 File Management (Designed, Not Implemented)

| Component | Status | Design Doc | Blocker |
|-----------|--------|------------|---------|
| Files metadata table | ❌ | `dynamic-file-management.md` | None (optional enhancement) |
| File upload endpoint | ❌ | `dynamic-file-management.md` | Storage config (now done) |
| Asset deduplication | ❌ | `dynamic-file-management.md` | File metadata table |
| Admin file browser | 💭 | Not designed yet | File metadata table |

---

## Phase 3: Dynamic Redirects

### 📋 Redirect System (Designed, Not Implemented)

| Component | Status | Design Doc | Blocker |
|-----------|--------|------------|---------|
| Redirects table migration | ❌ | `dynamic-redirects-strategy.md` | None |
| Redirect middleware | ❌ | `dynamic-redirects-strategy.md` | Redirects table |
| Cache layer | ❌ | `dynamic-redirects-strategy.md` | Middleware |
| Admin UI | ❌ | `dynamic-redirects-strategy.md` | Middleware |
| Analytics tracking | 💭 | Mentioned, not designed | Admin UI |

**Next Steps:**
1. Create migration: `nhost/migrations/default/[timestamp]_create_redirects/up.sql`
2. Add Hasura permissions for redirects table
3. Implement middleware in app's `src/hooks.server.ts`
4. Build simple CRUD UI for redirect management

---

## Phase 4+: Future Concepts

### 💭 CLI Tool (Conceptual)

**Design:** `.docs/symbiont-cli-design.md`

- Interactive config initialization (`symbiont init`)
- Config validation and editing
- Code generation (sync endpoints, routes)
- Diagnostics and testing (`symbiont doctor`)
- Dry-run sync testing

**Why:** Dramatically improve onboarding and developer experience

### 💭 Rendering Strategies (Conceptual)

**Design:** `.docs/2025-10-09-hybrid-strategy.md` (current implementation documented)

- ✅ Hybrid SSR + Client Navigation (implemented)
- 📋 Configurable SSR/Client rendering modes
- 📋 Progressive enhancement components
- 📋 Prerendering configuration
- 📋 Client-side features (search, infinite scroll, live updates)

**Why:** Give users control over performance vs. interactivity tradeoffs

**Note:** Current hybrid strategy is working well. Additional rendering modes are conceptual future enhancements.

### 💭 Advanced Sync (Conceptual)

- Incremental sync (detect changed pages only)
- Conflict resolution for simultaneous edits
- Content versioning and rollback
- Scheduled cron jobs beyond polling

### 💭 Rich Text Editor (Conceptual)

- Tiptap integration for direct database writes
- Real-time collaboration via Hocuspocus
- Inline file uploads
- Alternative to Notion editing

### 💭 Site Configuration (Conceptual)

- Dynamic site settings stored in database
- Theme switching without rebuilds
- Editorial workflow management (review/approve)
- Multi-author permissions

---

## 🔧 Technical Debt & Improvements

### Remaining Phase 1 Work (~2%)

1. **Retry Logic** (Estimated: 1 day)
   - Exponential backoff for Notion API failures
   - Configurable retry attempts
   - Failed sync tracking and alerts

2. **Webhook Security** (Estimated: 1 day)
   - Notion webhook signature verification
   - Request validation
   - Rate limiting

3. **Integration Tests** (Estimated: 2 days, Optional)
   - Would require test Nhost instance
   - End-to-end sync testing
   - GraphQL integration validation

### Nice-to-Have Enhancements

4. **Performance Monitoring** (Estimated: 2 days)
   - Sync duration metrics
   - Database query performance tracking
   - Alert thresholds for slow syncs

5. **Admin Dashboard** (Estimated: 3-5 days)
   - View sync history
   - Manual trigger interface
   - Error debugging UI

6. **Advanced Caching** (Estimated: 2 days)
   - Redis layer for frequently accessed posts
   - GraphQL query caching
   - Stale-while-revalidate patterns

---

## 📊 Progress Summary

| Phase | Total Components | Shipped | Partial | Designed | Concept |
|-------|------------------|---------|---------|----------|---------|
| Phase 1 (Posts) | 35 | 33 (94%) | 2 (6%) | 0 | 0 |
| Phase 2 (Media) | 9 | 1 (11%) | 0 | 8 (89%) | 0 |
| Phase 3 (Redirects) | 5 | 0 | 0 | 4 (80%) | 1 (20%) |
| Phase 4+ (Future) | ~8 | 0 | 0 | 0 | 8 (100%) |

**Overall Completion:**
- **Phase 1**: ~98% complete, production-ready with minor enhancements remaining
- **Phase 2**: Storage configured (November 2025), utilities implementation next
- **Phase 3**: 0% implemented, 80% designed
- **Phase 4+**: Conceptual stage

**Key Milestones:**
- ✅ **November 9, 2025**: Performance optimizations (timestamp comparison, slug sync prevention)
- ✅ **November 2, 2025**: Major refactor (class-based architecture, pages table migration)
- ✅ **October 2025**: Testing infrastructure, structured logging, QWER integration
- 🔄 **November 2025**: Phase 2 in progress (Storage v0.9.1 configured, utilities next)

---

## 🎯 Recommended Development Order

### ✅ Sprint 0: Core CMS & Testing (COMPLETE - November 2025)
- ✅ Class-based architecture refactor
- ✅ Database schema migration (posts → pages)
- ✅ Testing infrastructure (105 tests passing)
- ✅ Structured logging with Pino
- ✅ Performance optimizations (timestamp comparison, slug sync)
- ✅ QWER integration example with 4-file hybrid pattern

### 🔄 Sprint 1: Phase 2 - Image Management (IN PROGRESS - November 2025)
1. ✅ Configure Nhost Storage v0.9.1 (DONE)
2. Set up Hasura permissions for storage.files table
3. Create `src/lib/server/storage/image-processor.ts`
4. Implement image URL extraction from markdown
5. Build download/upload pipeline
6. Integrate URL rewriting into sync flow
7. Test with real posts containing images

### Sprint 2: Phase 1 Polish (1 week)
8. Add retry logic with exponential backoff
9. Implement webhook signature verification
10. Add integration tests (optional)
11. Performance monitoring and metrics

### Sprint 3: Phase 2 - File Management (1 week)
12. Create files metadata table
13. Implement asset deduplication
14. Build file upload endpoint
15. Add cover image extraction

### Sprint 4: Phase 3 - Dynamic Redirects (1 week)
16. Create redirects table migration
17. Implement redirect middleware
18. Add caching layer
19. Build basic admin UI
20. Add analytics tracking

### Sprint 5: Polish & Future (1-2 weeks)
21. Advanced caching strategies
22. Admin dashboard for sync management
23. Documentation updates
24. Example projects and templates
25. CLI tool foundation (Phase 4+)

---

**Questions?** See `.docs/README.md` for documentation index or ask in discussions.

---

## 📚 Related Documentation

**For developers:**
- `.docs/2025-10-01-symbiont-cms-reference.md` - Complete API reference and architecture guide
- `.docs/INTEGRATION_GUIDE.md` - How to integrate Symbiont into your app
- `.docs/2025-10-09-hybrid-strategy.md` - Why we use 4-file SSR + client navigation
- `.docs/REFACTOR_COMPLETE.md` - November 2025 architecture refactor details
- `.docs/SCHEMA_UPDATE.md` - Database schema migration details

**For designers (what's coming):**
- `.docs/image-optimization-strategy.md` - Phase 2 image management (IN PROGRESS)
- `.docs/dynamic-file-management.md` - Phase 2 file uploads (DESIGNED)
- `.docs/dynamic-redirects-strategy.md` - Phase 3 redirects (DESIGNED)
- `.docs/zero-rebuild-cms-vision.md` - Long-term product vision

**For quick starts:**
- `.docs/2025-10-01-quickstart.md` - Get running in 5 minutes
- `.docs/publishing-rules.md` - Configure Notion sync behavior
- `.docs/TYPE_COMPATIBILITY.md` - Integrate with existing types

---

**Status Emoji Key:**
- ✅ = Shipped and tested
- 🔄 = In active development
- 🟡 = Partially complete
- 📋 = Fully designed, not implemented
- 💭 = Concept only, not designed
- ❌ = Blocked or not started
