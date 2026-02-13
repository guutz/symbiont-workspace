# Zero-Rebuild CMS Vision

> **Executive summary of the end-state:** Edits in Notion (and later the web editor) should flow to production in seconds without rebuilds; media and redirects should be data-driven; the database is the source of truth.
> **Last Updated:** December 9, 2025

---

## Where we are
- ✅ Dynamic posts: Notion → Symbiont sync → Nhost → SvelteKit SSR (feeds included)
- ✅ Orchestrator/builder/repo architecture; multi-tenant pages schema
- ✅ Logging in place; basic unit tests (thin coverage)
- 🟡 Media: Image helpers exist; using default Nhost bucket; not wired into sync; no committed storage config/permissions
- 🟡 Redirects: designed, not implemented
- 🟡 Bidirectional metadata: planned, Notion → DB only today
- ⚠️ Dev regression: local app showing zero posts (likely publishing rule/query shape)

## What “zero rebuild” means here
- Content: No rebuilds for posts; Notion edits appear via sync/webhook.
- Media: Images/files stored in Nhost Storage; URLs rewritten into markdown (pending wiring).
- Routing: Redirects resolved from the database at request time (pending implementation).
- Config: Future site settings in DB (Phase 4 concept).

## Phases
| Phase | Scope | Status | Notes |
|-------|-------|--------|-------|
| 1 | Posts | ✅ Shipped | Stabilize dev regression; add tests/observability |
| 2a | Media | 🟡 Partial | Wire image pipeline into sync; commit bucket + permissions |
| 2b | Bidirectional metadata | 🟡 Planned | Notion → DB live; DB → Notion planned after media wiring |
| 3 | Redirects | 📋 Designed | Add table + middleware |
| 4 | Site config | 💭 Concept | Define schema + editorial workflow |
| 5 | Authoring surface | 💭 Concept | Web editor (Tiptap/Hocuspocus) |

## Next steps (near-term)
1) Fix local dev “no posts” (relax publishing rule or adjust query).
2) Wire `processMarkdownImages` into sync; use Notion cover property, then first image, else default.
3) Commit storage bucket + Hasura permissions; add regression test around image rewriting.
4) Define bidirectional metadata scope (fields, conflict policy) and add DB columns when ready.
5) Start redirects table + middleware when media/metadata are stable.

## Source documents
- Current status: `IMPLEMENTATION_STATUS.md`
- Media: `image-optimization-strategy.md`, `dynamic-file-management.md`
- Redirects: `dynamic-redirects-strategy.md`
- Bidirectional metadata: `bidirectional-sync-plan.md`
- Integration: `INTEGRATION_GUIDE.md`, `HYBRID_STRATEGY.md`

