# Zero-Rebuild CMS Vision

The Symbiont roadmap aims for a world where editors publish content, media, and routing changes without ever triggering a rebuild. Use this document as the executive summary of that journey.

---

## Vision snapshot

| Today (legacy static build) | Tomorrow (zero-rebuild) |
|-----------------------------|-------------------------|
| Markdown and JSON generated during CI | Content authored in Notion/Tiptap, synced to Postgres |
| Assets baked into the bundle | Assets stored in Nhost, served on-demand |
| Redirects encoded in `vercel.json` | Redirects resolved from the database at request time |
| Minutes to see a change | Seconds from edit to live |

We already ship the content leg of this vision in `qwer-test`; the rest extends the same pattern across assets, redirects, and configuration.

---

## Where we stand (Oct 2025)

- **Dynamic posts** are live: Notion → Symbiont sync → Nhost → SvelteKit SSR.
- **Feature detection** runs at ingestion so render paths stay lean.
- **Build pipeline** only compiles the SvelteKit app; no content artifacts are generated.
- **Observability hooks** are on the backlog; we still rely on manual log inspection for sync errors.

---

## Roadmap phases

| Phase | Scope | Status | Immediate next step |
|-------|-------|--------|---------------------|
| 1 | Posts | ✅ complete | Harden monitoring + retries |
| 2 | Media & files | 🚧 in progress | Implement Notion → Nhost upload & URL swapping (see `dynamic-file-management.md`) |
| 3 | Redirects | 🚧 in discovery | Prototype middleware + caching (see `dynamic-redirects-strategy.md`) |
| 4 | Site config | 🔮 later | Define schema + editorial workflow |
| 5 | Authoring surface | 🔮 later | Validate collaborative editor stack (Tiptap + Hocuspocus) |

Phases 2–3 unblock “zero rebuild” claims for most sites; later phases round out the CMS experience.

---

## Operating model

```
Notion change ─► Symbiont sync (poll/webhook) ─► Nhost (Postgres + Storage)
      │                                             │
      └────────────── observability ────────────────┘
                                    │
                              SvelteKit SSR
                                    │
                            Edge caches / CDN
                                    │
                              Visitor response
```

- Prefer webhooks for near-instant updates; keep polling as a backup.
- Serve SSR responses with `public, max-age=300, stale-while-revalidate=600` to balance freshness and cost.
- Track sync duration, mutation counts, and failure payloads once logging infrastructure is in place.

---

## Build & runtime impact

- Deprecated: markdown-to-JSON generation, `$generated` imports, build-time image transforms.
- Retained: standard SvelteKit compile, static assets that rarely change, client stores hydrated from SSR payloads.
- Performance delta: SSR adds ~200 ms versus static pages, but caching keeps TTFB well under acceptable thresholds.
- Success criteria
  - Editors see changes live in < 60 s without a deploy.
  - Non-developers control posts, media, and redirects end-to-end.
  - Sync failures retry automatically or surface actionable alerts.
  - Queries remain fast as content volume grows (indexes + pagination baked in).

---

## Decision log

| Decision | Date | Rationale | Trade-off |
|----------|------|-----------|-----------|
| Adopt Nhost as the backbone | 2025-10-05 | Unified DB, storage, auth, serverless functions | Coupling to Hasura schema conventions |
| Detect markdown features at ingestion | 2025-10-07 | Simplify runtime rendering & TOC generation | Requires backfill for legacy rows |
| Keep config in `.js` (with JSDoc types) | 2025-10-05 | Zero-build-compatible runtime imports | Rely on lint + TS checks instead of compile-time types |

---

## Key next bets

1. **Media migration loop** – mirror Notion URLs into Nhost, persist both origins, and ensure future uploads default to Nhost links.
2. **Redirect middleware** – resolve redirects from Postgres inside `hooks.server.ts`, cache lookups, and expose an admin UX.
3. **Sync telemetry** – ship structured logs/alerts for failed pages, asset uploads, and schema mismatches.

---

## See also

- `symbiont-cms.md` – package surface and configuration contract.
- `dynamic-file-management.md` & `image-optimization-strategy.md` – full design for media migration.
- `dynamic-redirects-strategy.md` – redirect schema and middleware plan.
- `TYPE_COMPATIBILITY.md` – snapshot of post mapping across systems.

**Last refreshed:** October 8, 2025
// packages/qwer-test/src/generated/
