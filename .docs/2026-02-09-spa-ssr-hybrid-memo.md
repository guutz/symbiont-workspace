# Memo: SPA vs SSR vs Hybrid Filtering (California Tech)

Date: 2026-02-09

## Context
The California Tech homepage and categories flow currently mix SSR for initial render with progressive client-side filtering. The goal is a site that feels snappy like a SPA while keeping first paint fast on slow devices and preserving correct results across navigation, tags, and search. A core Symbiont value is minimizing boilerplate across apps.

## Strategy Options

### 1) Full SSR Filtering (server-only)
**How it works**
- All filtering happens in `+page.server.ts`.
- The client only receives the filtered list for display.
- The URL change triggers a navigation and re-runs the server load.

**Pros**
- Minimal payload for initial render.
- Most correct and consistent with tags and search.
- Works without JS and is reliable for SEO.

**Cons**
- Every filter change is a navigation.
- Search feels less instantaneous unless caching is very aggressive.

**Best for**
- Minimal JS clients, strict SEO requirements, low data use.

### 2) Full SPA Filtering (client-only)
**How it works**
- The client receives a full dataset (or large preview set).
- All filtering happens in the browser without navigation.

**Pros**
- Instant filtering and great perceived speed.
- Fewer server requests during interaction.

**Cons**
- Large upfront payload for the initial page.
- Can be slow on 3G/4G or low-memory devices.
- Harder to keep consistent with server data and caching.

**Best for**
- Small datasets or apps where data size is minimal.

### 3) Progressive Hybrid (recommended)
**How it works**
- SSR sends a small, high-priority initial dataset for fast FCP/LCP.
- Client fetches a lightweight preview set in the background.
- Once previews load, filtering becomes instant.
- If previews are not ready, filtering falls back to SSR navigation.

**Pros**
- Fast initial paint and good Core Web Vitals.
- SPA-like interactions after hydration.
- Data use is bounded and tunable.

**Cons**
- More moving parts and state management.
- Needs careful source-of-truth handling to avoid URL/state drift.

**Best for**
- News-like feeds with many posts where speed and UX both matter.

## Implementation Notes (Current Approach)

- **Single source of truth** should be the URL (derived via `$page.url`).
- **SSR** sends a small initial list (e.g., 30 posts) and tag data for the page.
- **Previews API** serves lightweight metadata for all posts (title, tags, short summary, publish date, optional cover).
- **Client** loads previews after mount and filters locally once available.
- **Fallback** to SSR navigation when previews are not yet loaded.

This keeps initial payloads small and still enables instantaneous filtering once the background fetch completes.

## Performance Targets (Concrete)
These targets help keep the implementation honest and measurable:

- **Initial HTML + data payload**: 30-80 KB compressed for home page.
- **Preview fetch payload**: 50-150 KB compressed for 1000 previews.
- **LCP**: < 2.0s on mid-tier mobile (fast 4G).
- **TTI**: < 3.0s on mid-tier mobile.
- **Search/Filter latency (after previews)**: < 50 ms for UI update.

These should be validated with Lighthouse and real-device testing on throttled networks.

## Decision Matrix (Page Type)
This is a quick guide for when to use SSR, SPA, or hybrid:

| Page Type | Recommended Strategy | Reason |
| --- | --- | --- |
| Home feed | Hybrid | Fast initial paint + instant filtering after previews |
| Tag landing | Hybrid or SSR | Hybrid if users filter further; SSR if content is static |
| Search results | Hybrid | Users expect instant changes |
| Post detail | SSR | SEO-critical and low interactivity |
| About/legal | SSR | Small and static |

If a page is content-heavy but rarely filtered, prefer SSR with caching over hybrid.

## Where the Code Should Live

### California Tech (site-specific)
These are custom choices tied to the newspaper UX and its layout:
- The specific **preview fields** and truncation rules (e.g., summary length).
- The **initial result count** (e.g., 30 posts for first paint).
- The **UI behavior** for loading hints (toast, spinner, etc.).
- Any **tag/category presentation** unique to the site.
- Any **sorting or curation** logic (e.g., featured posts, series).

These belong in `packages/california-tech` because they encode brand-level and UX-level decisions.

### Symbiont CMS (reusable patterns)
These are reusable patterns across multiple sites:
- A **generic preview endpoint helper** to map `WebsitePage` to preview data with a configurable field list and truncation rules.
- A **client utility** to fetch previews with caching and ETag support (optional).
- A **server utility** for partial data projections (e.g., minimal view of a page without content HTML).
- A **type** for `PostPreview` or `PagePreview` shared across apps.

These should be **opinionated, boilerplate-reducing helpers** that make the hybrid pattern easy to adopt while still allowing override hooks.

## Proposed Symbiont CMS API Surface
The goal is to reduce boilerplate and make the hybrid flow easy to adopt:

```ts
// types
export type PagePreview = {
	slug: string;
	title: string;
	summary?: string;
	tags?: string[];
	published?: string;
	cover?: string;
};

// server helper
export function buildPagePreviews(
	pages: WebsitePage[],
	options?: {
		summaryLength?: number;
		tagsSelector?: (page: WebsitePage) => string[];
		include?: Array<keyof PagePreview>;
	}
): PagePreview[];

// client helper
export async function fetchPagePreviews(
	url?: string,
	options?: {
		cacheKey?: string;
		ttlMs?: number;
		signal?: AbortSignal;
	}
): Promise<PagePreview[]>;

// server helper to limit payloads
export function stripHeavyFields<T extends Record<string, unknown>>(
	items: T[],
	fields?: Array<keyof T>
): T[];
```

These helpers should be **small, composable, and optional**, not hard-coded into core data flow. The CMS remains flexible while reducing repeated patterns across sites.

These can live in `packages/symbiont-cms` as optional helpers, not opinionated defaults, to preserve flexibility.

## Recommendation
Keep the **progressive hybrid** for California Tech. It meets the "lightning fast" goal while preserving correctness and avoiding large initial payloads. The CMS should provide **lightweight, opt-in utilities** to support this pattern, but the exact field selection and UX should remain site-specific.

## Open Questions
- Do we want to optimize the preview API with pagination or server-side caching headers beyond ISR?
- Should we add a consistent `PostPreview` type to `symbiont-cms` for reuse?
- Are there places where a small result set should be pre-rendered for SEO beyond the home page?
