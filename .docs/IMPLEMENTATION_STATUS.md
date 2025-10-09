# Implementation Status Tracker

> **Purpose:** Quick reference for what's actually implemented vs. designed vs. conceptual  
> **Last Updated:** October 8, 2025

This document provides an honest assessment of the Symbiont CMS implementation status, helping contributors understand what works, what's ready to build, and what's still in the idea phase.

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

## Phase 1: Dynamic Posts (Core CMS)

### ✅ Content Sync (Shipped)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Notion API integration | ✅ | `src/lib/server/notion.ts` | Using `notion-to-md` |
| Markdown processor | ✅ | `src/lib/server/markdown-processor.ts` | Supports plugins, feature detection |
| GraphQL mutations | ✅ | `src/lib/server/graphql.ts` | Upsert posts to Nhost |
| Sync endpoint | ✅ | `src/lib/server/sync.ts` | Poll-based via `/api/sync` |
| Page processor | ✅ | `src/lib/server/page-processor.ts` | Transforms Notion → Post |

### ✅ Configuration System (Shipped)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Config schema | ✅ | `src/lib/config.ts` | TypeScript types |
| Config loader | ✅ | `src/lib/server/load-config.ts` | Runtime import |
| Vite plugin | ✅ | `src/lib/vite-plugin.ts` | Virtual module resolution |
| Multi-database support | ✅ | Config `databases[]` array | Via `source_id` |

### ✅ Database Schema (Shipped)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Posts table | ✅ | `nhost/migrations/*/up.sql` | Multi-tenant ready |
| Indexes | ✅ | Same migration | `source_id`, `publish_at` |
| Triggers | ✅ | Same migration | Auto-update `updated_at` |
| Unique constraints | ✅ | Same migration | `source_id` + `slug`/`notion_page_id`/`notion_short_id` |

### ✅ Client Utilities (Shipped)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| GraphQL admin client | ✅ | `src/lib/server/graphql.ts` | Lazy singleton with admin secret |
| GraphQL public client | ✅ | `src/lib/client/queries.ts` | SSR-safe, per-request |
| Server query wrappers | ✅ | `src/lib/server/queries.ts` | Clean `getPostBySlug`, `getAllPosts` |
| Post loader | ✅ | `src/lib/server/post-loader.ts` | Simplified for `+page.server.ts` |
| Client helpers | ✅ | `src/lib/client/queries.ts` | `getPosts`, `getPost` for components |

### ✅ UI Components (Shipped)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Renderer | ✅ | `src/lib/components/Renderer.svelte` | Markdown → HTML with classMap |
| PostPage | ✅ | `src/lib/components/PostPage.svelte` | Complete post layout |
| TOC generation | ✅ | `src/lib/server/markdown-processor.ts` | Server-side, returned with HTML |

### 🟡 Markdown & Feature Detection (Partial)

| Component | Status | Location | Notes |
|-----------|--------|----------|-------|
| Markdown processor | ✅ | `src/lib/server/markdown-processor.ts` | Full markdown-it with plugins |
| Prism language loading | ✅ | Same file | Server-side lazy loading |
| TOC generation | ✅ | Same file | Configurable heading levels |
| Feature detection interface | ✅ | Same file | `ContentFeatures` type defined |
| Features parameter | ✅ | Same file | `parseMarkdown` accepts features |
| **Database features column** | ❌ | N/A | No `features JSONB` in posts table yet |
| **Sync-time detection** | ❌ | N/A | Not detecting features during sync |
| **Client asset loading** | 🟡 | User's route components | Static imports (works, not optimal) |

**Current Approach:**
- ✅ Server-side Prism languages load on-demand (or via features if provided)
- ✅ Client-side CSS (Prism + KaTeX ~25KB) loaded statically
- ❌ No feature detection in database (deferred to Phase 1.5)
- ❌ No conditional client asset loading (deferred to Phase 1.5)

**Future Enhancement (Phase 1.5):**
- Add `features JSONB` column to posts table
- Implement feature detection during Notion sync
- Optional `<FeatureLoader>` component for conditional asset loading
- See `.docs/feature-detection-architecture.md` for full design

### ⚠️ Phase 1 Gaps (Needs Attention)

| Component | Status | Priority | Notes |
|-----------|--------|----------|-------|
| Unit tests | ❌ | **High** | Zero test coverage |
| Structured logging | ❌ | **High** | Only console.log currently |
| Error handling | 🟡 | **Medium** | Basic try/catch, no retries |
| Webhook support | ❌ | **Medium** | Only polling implemented |
| Integration tests | ❌ | **Low** | Would require test Nhost instance |

---

## Phase 2: Media & Files

### 📋 Image Management (Designed, Not Implemented)

| Component | Status | Design Doc | Blocker |
|-----------|--------|------------|---------|
| Nhost Storage config | ❌ | `image-optimization-strategy.md` | None |
| File upload utility | ❌ | `dynamic-file-management.md` | Storage config |
| Image downloader | ❌ | `image-optimization-strategy.md` | None |
| URL rewriter | ❌ | `image-optimization-strategy.md` | Image downloader |
| Cover image handler | ❌ | `image-optimization-strategy.md` | None |

**Next Steps:**
1. Add storage configuration to `nhost/nhost.toml`
2. Create `src/lib/server/file-upload.ts`
3. Implement image detection in sync process
4. Add URL rewriting in markdown processor

### 📋 File Management (Designed, Not Implemented)

| Component | Status | Design Doc | Blocker |
|-----------|--------|------------|---------|
| File upload endpoint | ❌ | `dynamic-file-management.md` | Storage config |
| File metadata table | ❌ | `dynamic-file-management.md` | None |
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

**Design:** `.docs/rendering-strategy.md`

- Configurable SSR/Hybrid/Client rendering
- Progressive enhancement components
- Prerendering configuration
- Client-side features (search, infinite scroll, live updates)

**Why:** Give users control over performance vs. interactivity tradeoffs

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

### High Priority

1. **Testing Infrastructure** (Estimated: 2-3 days)
   - Set up Vitest
   - Add unit tests for markdown processor
   - Add integration tests for sync flow
   - Mock Notion/GraphQL APIs

2. **Observability** (Estimated: 2-3 days)
   - Add structured logging (pino or similar)
   - Track sync success/failure metrics
   - Error boundary in sync handlers
   - Optional: monitoring dashboard

3. **Error Handling** (Estimated: 1-2 days)
   - Retry logic for failed syncs
   - Better error messages
   - Validation for config files
   - GraphQL error parsing

### Medium Priority

4. **Webhook Support** (Estimated: 2 days)
   - Notion webhook endpoint
   - Signature verification
   - Queue for processing (optional)

5. **Documentation** (Estimated: 1-2 days)
   - Add inline code comments
   - Create troubleshooting guide
   - Video walkthrough tutorial

### Low Priority

6. **Performance Optimization**
   - Pagination for large post lists
   - GraphQL query optimization
   - Cache layer for frequently accessed posts

7. **Developer Experience**
   - Better TypeScript types for config
   - CLI tool for common tasks
   - Example projects/templates

---

## 📊 Progress Summary

| Phase | Total Components | Shipped | Partial | Designed | Concept |
|-------|------------------|---------|---------|----------|---------|
| Phase 1 (Posts) | 20 | 16 (80%) | 2 (10%) | 0 | 2 (10%) |
| Phase 2 (Media) | 9 | 0 | 0 | 9 (100%) | 0 |
| Phase 3 (Redirects) | 5 | 0 | 0 | 4 (80%) | 1 (20%) |
| Phase 4+ (Future) | ~12 | 0 | 0 | 0 | 12 (100%) |

**Overall Completion:**
- **Phase 1**: 80% complete, production-ready with gaps
- **Phase 2**: 0% implemented, 100% designed
- **Phase 3**: 0% implemented, 80% designed
- **Phase 4+**: Conceptual stage

---

## 🎯 Recommended Development Order

### Sprint 1: Harden Phase 1 (1 week)
1. Add testing infrastructure (Vitest setup)
2. Implement structured logging
3. Add retry logic to sync
4. Write unit tests for core functions

### Sprint 2: Implement Phase 2 Foundation (1 week)
5. Configure Nhost Storage buckets
6. Create file upload utility
7. Implement image download in sync
8. Add URL rewriting

### Sprint 3: Implement Phase 3 Foundation (1 week)
9. Create redirects table migration
10. Implement redirect middleware
11. Add caching layer
12. Build basic admin UI

### Sprint 4: Polish & Optimize (1 week)
13. Add integration tests
14. Performance optimization
15. Documentation updates
16. Example projects

---

## 🤝 Contributing

When contributing, please:

1. **Check this document first** - Understand what exists vs. what's designed
2. **Update status when shipping** - Keep this tracker current
3. **Write tests for new features** - Let's not add to technical debt
4. **Document design decisions** - Especially if deviating from strategy docs

---

**Questions?** See `.docs/README.md` for documentation index or ask in discussions.
