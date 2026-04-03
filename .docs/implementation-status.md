# Implementation Status (Ongoing)

Purpose: living tracker for what is actually shipped, partially shipped, or still design-only across Symbiont CMS and consumer sites in this workspace.

Last updated: 2026-04-01
Owner: maintainers of symbiont-cms and site integrations

---

## Snapshot

Current state is stable for production sync + SSR rendering, with active work focused on issue/archive behavior in California Tech and publish-check semantics in the hook system.

### Shipped and actively used
- Hook-driven Notion -> Supabase sync pipeline in symbiont-cms.
- Default + custom hook composition with event ordering contract.
- Notion markdown conversion module (`notion-md`) absorbed into symbiont-cms.
- Surgical Notion block diff-and-patch for DB -> Notion content sync.
- Supabase-backed page storage with slug/content/metadata workflows.
- SSR markdown rendering (`markdown-it` + plugins) and TOC generation.
- California Tech and guutz-blog integrations running from shared symbiont-cms core.

### Recently completed (Mar-Apr 2026)
- California Tech homepage/feed improvements:
  - issue-boundary-aware pagination
  - progressive load behavior (infinite scroll + no-JS fallback)
  - masonry-style variable-height index cards
- California Tech issue archive improvements:
  - dedicated issue-card index page
  - issue cards linked to issue article index and PDF where available
  - archive cover preference for issue cards
  - batched loading and SSR-safe hydration behavior
- Shared utility consolidation in California Tech:
  - feed client helpers
  - issue card construction helpers
  - merge/dedup helpers
- Hook publish flow tactical update:
  - default publish check abstains when status readiness cannot be evaluated
  - publish decision requires at least one explicit true and zero false votes for `publish:check`
  - recorded as tactical and marked for revisit in the publish-check memo

### Known active concerns
- Hook publish semantics now include event-specific logic for `publish:check`; this is intentional but should be revisited with configurable policy.
- Legacy docs around hook defaults still contain stale statements and should be aligned to current behavior.
- Some roadmap docs still reference old platform terms or older migration phases; treat this file as source of truth for current implementation reality.

---

## Status by Area

## 1) Core Sync Engine (`packages/symbiont-cms`)

### 1.1 Hook system
Status: Shipped, in active iteration

- Event registry, strategies, and sequencing are in place.
- `AndAll` behavior for `publish:check` currently uses abstain-aware opt-in semantics.
- Default hooks + custom hooks are both heavily used by California Tech.

Revisit:
- Add first-class datasource-level publish policy configuration to avoid event-specific branching in registry logic.

### 1.2 Notion <-> markdown conversion
Status: Shipped

- Internal `notion-md` module is in tree and used directly.
- Equation conventions and markdown contract are documented.

### 1.3 DB -> Notion content sync
Status: Shipped

- Block diff algorithm is active to avoid nuke-and-replace behavior.
- Preserves IDs where possible and avoids unnecessary writes.

### 1.4 Test and quality posture
Status: Partial

- Unit tests exist across core components.
- Current risk is behavior drift across docs vs implementation, rather than complete absence of tests.

---

## 2) California Tech (`packages/california-tech`)

### 2.1 Homepage and feeds
Status: Shipped

- Progressive enhancement works with and without JS.
- Pagination aligns with issue-date boundaries.

### 2.2 Issues archive UX
Status: Shipped with active tuning

- Issue cards display from merged website/archive date sets.
- Website-only singleton-date filtering is applied to avoid treating one-off web posts as issues.
- Cover rendering currently respects image aspect ratio and fills card width.

Open follow-up:
- Continue tuning issue inference heuristics if editorial patterns change.

### 2.3 Archive publish behavior
Status: Stabilized via tactical hook policy change

- Archive records now depend on explicit publish vote behavior under revised `publish:check` semantics.
- This solved null `publish_at` outcomes for archive pages lacking status-based default readiness signals.

---

## 3) Guutz Blog (`packages/guutz-blog`)

Status: Stable consumer

- Uses shared symbiont-cms capabilities.
- No major regressions tracked in this status cycle.

---

## 4) Supabase and Data Model

Status: Operational

- Pages table and related migration chain are in place.
- Archive/website datasource separation remains intentional.

Open follow-up:
- Keep schema docs synchronized with actual table usage and metadata debt notes.

---

## Tactical Decisions to Revisit

1. Publish-check abstain-aware opt-in behavior
- See `.docs/2026-04-01-publish-check-abstain-memo.md`.
- Revisit when implementing datasource-level policy configuration.

2. Documentation drift cleanup
- Bring historical hook docs and migration guides in line with current implementation.

3. Issue inference policy
- Current threshold-based filtering for website-only dates is practical but heuristic; revisit if false positives/negatives appear.

---

## Near-Term Priorities

1. Add explicit publish policy mode to `DatabaseBlueprint`.
2. Normalize docs so old and new hook semantics are not conflicting.
3. Add targeted tests around publish-check voting semantics and datasource-specific overrides.
4. Continue incremental UX polish for California Tech archive surfaces.

---

## Quick Legend

- Shipped: live and relied upon
- Partial: implemented but needs hardening/tests/policy cleanup
- Designed: documented plan not yet implemented
- Concept: idea only
