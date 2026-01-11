# California Tech Website - Next Batch of Revisions

**Date:** January 8, 2026  
**Updated:** January 10, 2026  
**Status:** Planning Phase

---

## 🎯 Executive Summary

This memo outlines the next batch of improvements for the California Tech website and its integration with Symbiont CMS:

1. **Date-Based Dividers** - Group posts by issue date instead of year
2. **Markdown in Previews** - Parse markdown in post card summaries
3. **Cover Images** - Wire Phase 2 media sync for cover images
4. **Infinite Scroll** - Paginated loading with graceful degradation

---

## 📍 Current Status

### ✅ Recently Fixed
- **Homepage Posts Visibility**: Posts now displaying correctly (local dev regression resolved)

### 🟢 Symbiont CMS Core (Phase 1)
- ✅ Content Sync: Notion → Postgres pipeline functional
- ✅ Markdown Pipeline: Server-side rendering with `markdown-it`
- ✅ Testing: Basic unit tests (Vitest)
- 🟡 Image Pipeline: Helpers exist, not wired into sync

### 🎨 Current Architecture
- **Framework**: SvelteKit with SSR
- **Homepage**: `index_posts.svelte` → `index_post.svelte` cards
- **Grouping**: Currently by year (changing to date)
- **Data Flow**: `+page.server.ts` → `getAllPosts()` → `symbiontToQwerPost()` → components

---

## 🎯 Proposed Revisions

### 1. Date-Based Dividers (Replacing Year Dividers)

**Priority:** High | **Complexity:** Low

**Location:** [index_posts.svelte](../packages/california-tech/src/lib/components/index_posts.svelte#L27-L38)

#### Current
```svelte
{@const years = [new Date().getFullYear()]}
{#each posts as p, index (p.slug)}
  {@const year = new Date(p.published).getFullYear()}
  {#if !isNaN(year) && !years.includes(year)}
    <div class="year-divider">{years.push(year) && year}</div>
  {/if}
  <IndexPost data={p} {index} />
{/each}
```

#### Proposed
```svelte
{@const seenDates = new Set<string>()}
{#each posts as p, index (p.slug)}
  {@const publishDate = new Date(p.published)}
  {@const dateKey = publishDate.toLocaleDateString('en-US', { 
    year: 'numeric', month: 'long', day: 'numeric' 
  })}
  
  {#if !seenDates.has(dateKey)}
    <div class="issue-divider">
      {seenDates.add(dateKey) && dateKey}
    </div>
  {/if}
  <IndexPost data={p} {index} />
{/each}
```

**Display:** `"October 7, 2025"` (from Notion Issue property `"7 October 2025"`)

---

### 2. Markdown Parsing in Post Card Previews

**Priority:** High | **Complexity:** Low

**Location:** [index_post.svelte](../packages/california-tech/src/lib/components/index_post.svelte#L101)

#### Problem
Raw markdown displays as plain text (`**bold**` instead of **bold**)

#### Solution
Use existing `parseMarkdown()` from `symbiont-cms/server` (markdown-it v14.1.0)

**1. Update `+page.server.ts`:**
```typescript
import { parseMarkdown } from 'symbiont-cms/server';

// Parse summaries server-side
const allPosts = await Promise.all(
  postsFromDb.map(async (post) => {
    let summaryHtml = post.summary;
    if (post.summary) {
      const { html } = await parseMarkdown(post.summary, undefined);
      summaryHtml = html.replace(/<\/?p>/g, ''); // Strip wrapper tags
    }
    return symbiontToQwerPost(post, undefined, undefined, summaryHtml);
  })
);
```

**2. Update component:**
```svelte
<p class="text-lg line-clamp-2" itemprop="description">
  {@html data.summary}
</p>
```

---

### 3. Cover Images (Phase 2 Media Sync)

**Priority:** High | **Complexity:** High

#### Current Status
- Post cards support covers via `index_post.svelte`
- Cover images not synced from Notion
- **Critical:** Notion CDN URLs expire after 1 hour

#### Nhost Storage Status
Storage already configured via Hasura metadata:
- `nhost/metadata/databases/default/tables/storage_files.yaml`
- `nhost/metadata/databases/default/tables/storage_buckets.yaml`
- **Web instance:** Files uploaded to `default` bucket
- **Local dev:** Empty (needs sync or re-upload)
- **Alternative:** Dedicated bucket for multisite (evaluate later)

#### Implementation
```typescript
// In PostBuilder or sync orchestrator
if (notionPage.cover) {
  const coverUrl = await this.uploadCoverImage(notionPage);
  postData.cover = coverUrl;
}
```

**Steps:**
1. Review `image-processor.ts` and `image-upload.ts` helpers
2. Verify target bucket (currently `default`)
3. Wire cover extraction into sync flow
4. Sync files to local dev Nhost
5. Verify `symbiontToQwerPost()` maps `cover` field

---

### 4. Infinite Scroll with Graceful Degradation

**Priority:** High | **Complexity:** High

#### Problem
Currently loading all ~1000 posts on initial page load → slow on poor connections

#### Solution
- **SSR (no JS):** Traditional pagination
- **CSR (with JS):** Infinite scroll via IntersectionObserver

**Benefits:**
- ✅ SEO-friendly paginated URLs
- ✅ Fast initial load (20 posts)
- ✅ Smooth UX with JS
- ✅ Works without JS

#### Server-Side (`+page.server.ts`)
```typescript
export async function load({ fetch, url, cookies }) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = 20;
  const offset = (page - 1) * perPage;
  
  const totalCount = await getPostsCount({ fetch });
  const totalPages = Math.ceil(totalCount / perPage);
  
  const postsFromDb = await getAllPosts({ fetch, limit: perPage, offset });
  const posts = postsFromDb.map(symbiontToQwerPost);
  
  return {
    posts,
    page,
    totalPages,
    hasMore: page < totalPages,
  };
}
```

#### API Endpoint (`/api/posts/+server.ts`)
```typescript
export async function GET({ fetch, url }) {
  const page = parseInt(url.searchParams.get('page') || '1');
  const perPage = 20;
  const offset = (page - 1) * perPage;
  
  const postsFromDb = await getAllPosts({ fetch, limit: perPage, offset });
  const posts = postsFromDb.map(symbiontToQwerPost);
  
  return json({ posts, hasMore: posts.length === perPage });
}
```

#### Client-Side (`+page.svelte`)
```svelte
<script lang="ts">
  let displayedPosts = $state([...data.posts]);
  let currentPage = $state(data.page);
  let hasMore = $state(data.hasMore);
  let isLoadingMore = $state(false);
  let infiniteScrollEnabled = $state(false);
  let loadMoreTrigger: HTMLElement;

  onMount(() => {
    infiniteScrollEnabled = true;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isLoadingMore) {
          loadMorePosts();
        }
      },
      { rootMargin: '200px' }
    );
    observer.observe(loadMoreTrigger);
    return () => observer.disconnect();
  });

  async function loadMorePosts() {
    isLoadingMore = true;
    const res = await fetch(`/api/posts?page=${currentPage + 1}`);
    const { posts, hasMore: more } = await res.json();
    displayedPosts = [...displayedPosts, ...posts];
    currentPage++;
    hasMore = more;
    isLoadingMore = false;
  }
</script>

<IndexPosts posts={displayedPosts} />

{#if infiniteScrollEnabled}
  <div bind:this={loadMoreTrigger} class="h-4"></div>
  {#if isLoadingMore}
    <div class="spinner">Loading...</div>
  {/if}
{:else}
  <!-- Traditional pagination for no-JS -->
  <nav>
    {#if data.page > 1}<a href="?page={data.page - 1}">← Previous</a>{/if}
    <span>Page {data.page} of {data.totalPages}</span>
    {#if hasMore}<a href="?page={data.page + 1}">Next →</a>{/if}
  </nav>
{/if}
```

---

## ⚡ Performance & Data Flow

### Performance Priorities

1. **Lightning-fast initial load** - Only essential content above the fold
2. **Minimize data transfer** - Send only what's needed
3. **Progressive enhancement** - Secondary features don't block primary
4. **Layout stability** - No content shift during async loads

---

## 📝 Content Flow: From Editor to Reader

*This section explains how content flows from Notion to the website, written for California Tech editors.*

### The Editor's Workflow (Notion Side)

```mermaid
flowchart LR
    subgraph Editor["✏️ Editor's Workflow"]
        WRITE["Write/Edit Article<br/>in Notion"]
        PROPS["Set Properties:<br/>• Title<br/>• Issue Date<br/>• Tags<br/>• Authors<br/>• Status → Published"]
        COVER["Add Cover Image<br/>(optional)"]
    end
    
    WRITE --> PROPS --> COVER
    COVER --> DONE["Done! ✅<br/>Article appears on site<br/>within minutes"]
    
    style WRITE fill:#fff3e0
    style PROPS fill:#fff3e0
    style COVER fill:#fff3e0
    style DONE fill:#c8e6c9
```

### What Happens Behind the Scenes

When you publish an article in Notion, here's what happens automatically:

```mermaid
flowchart TB
    subgraph Notion["📓 Notion (Your Editor)"]
        ARTICLE["Your Article"]
        TITLE["Title"]
        ISSUE["Issue: '7 October 2025'"]
        TAGS["Tags: Opinion, Campus"]
        STATUS["Status: Published ✅"]
        CONTENT["Article Content<br/>(Markdown)"]
        COVERIMG["Cover Image"]
    end
    
    subgraph Sync["🔄 Automatic Sync (Every Few Minutes)"]
        POLL["Sync checks for<br/>new/updated articles"]
        CHECK["Is Status = Published?"]
        EXTRACT["Extract all content<br/>& properties"]
        UPLOAD["Upload images to<br/>permanent storage"]
    end
    
    subgraph Database["🗄️ Database (Nhost)"]
        PAGES[("pages table")]
        STORAGE[("image storage")]
    end
    
    subgraph Website["🌐 California Tech Website"]
        HOME["Homepage<br/>(list of articles)"]
        READER["Article Page<br/>(full content)"]
    end
    
    ARTICLE --> POLL
    POLL --> CHECK
    CHECK -->|"Yes"| EXTRACT
    CHECK -->|"No"| SKIP["Skip (not published)"]
    EXTRACT --> PAGES
    COVERIMG --> UPLOAD --> STORAGE
    
    PAGES --> HOME
    PAGES --> READER
    STORAGE --> HOME
    STORAGE --> READER
    
    style ARTICLE fill:#fff3e0
    style STATUS fill:#c8e6c9
    style PAGES fill:#e3f2fd
    style HOME fill:#e8f5e9
    style READER fill:#e8f5e9
```

### How Your Notion Properties Become Website Features

| Notion Property | Website Result | Example |
|----------------|----------------|---------|
| **Title** | Article headline | "New Library Hours Announced" |
| **Issue** (select) | Date divider on homepage | "October 7, 2025" |
| **Tags** (multi-select) | Category filters | Opinion, Campus, Sports |
| **Authors** (multi-select) | Byline | "Jane Smith, John Doe" |
| **Status** = Published | Article appears on site | ✅ Visible to readers |
| **Status** ≠ Published | Article hidden | Draft, not synced |
| **Cover Image** | Card thumbnail + article header | Photo at top of article |
| **Content** (page body) | Full article text | Formatted with headings, links, etc. |

### Important Notes for Editors

1. **Publish Status**: Only articles with `Status = Published` appear on the website
2. **Issue Date**: The Issue field determines how articles are grouped on the homepage (e.g., all articles from "7 October 2025" appear together)
3. **Tags**: Use consistent tag names - they become filterable categories
4. **Images**: Images in your article are automatically uploaded to permanent storage (Notion's image links expire)
5. **Updates**: Changes to published articles sync automatically within a few minutes

---

## 🔧 Technical Data Flow

*This section is for developers maintaining the system.*

### Full System Architecture

```mermaid
flowchart TB
    subgraph Notion["Notion (Source)"]
        NDB[(Notion Database)]
    end

    subgraph Sync["Sync Process (Background)"]
        SYNC["/api/sync endpoint"]
        ORCH["SyncOrchestrator"]
        ADAPTER["NotionAdapter<br/>(API calls)"]
        BUILDER["PostBuilder<br/>(business logic)"]
        REPO["PostRepository<br/>(database ops)"]
        IMGPROC["processNotionPageImages()"]
    end

    subgraph Nhost["Nhost Backend"]
        PG[(Postgres<br/>pages table)]
        HASURA["Hasura GraphQL"]
        STORAGE[(Nhost Storage<br/>default bucket)]
    end

    subgraph SSR["SvelteKit SSR (Server)"]
        LOADER["+page.server.ts<br/>load()"]
        API["/api/posts<br/>+server.ts"]
        GETPOSTS["getAllPosts()<br/>symbiont-cms"]
        MARKDOWN["parseMarkdown()<br/>symbiont-cms"]
        CONVERTER["symbiontToQwerPost()<br/>california-tech"]
    end

    subgraph Client["Browser (Client)"]
        HYDRATE["Svelte Hydration"]
        POSTS["IndexPosts.svelte"]
        POST["IndexPost.svelte"]
        OBSERVER["IntersectionObserver"]
        FETCH["fetch('/api/posts')"]
    end

    %% Sync flow
    NDB -->|"Notion API"| ADAPTER
    ADAPTER --> ORCH
    ORCH --> BUILDER
    BUILDER --> REPO
    BUILDER --> IMGPROC
    IMGPROC -->|"upload images"| STORAGE
    REPO -->|"GraphQL mutation"| HASURA
    HASURA --> PG

    %% SSR flow (initial load)
    LOADER -->|"1. Request posts"| GETPOSTS
    GETPOSTS -->|"2. GraphQL query"| HASURA
    HASURA -->|"3. Query"| PG
    PG -->|"4. Rows"| HASURA
    HASURA -->|"5. JSON"| GETPOSTS
    GETPOSTS -->|"6. Post[]"| LOADER
    LOADER -->|"7. Parse summaries"| MARKDOWN
    MARKDOWN -->|"8. HTML"| LOADER
    LOADER -->|"9. Convert format"| CONVERTER
    CONVERTER -->|"10. QWER Post[]"| LOADER

    %% Client hydration
    LOADER -->|"11. SSR HTML + data"| HYDRATE
    HYDRATE --> POSTS
    POSTS --> POST
    POST -->|"lazy load"| STORAGE

    %% Infinite scroll
    OBSERVER -->|"scroll trigger"| FETCH
    FETCH -->|"GET /api/posts?page=N"| API
    API --> GETPOSTS
    API -->|"JSON response"| FETCH
    FETCH -->|"append posts"| POSTS

    style LOADER fill:#f9a825
    style API fill:#f9a825
    style GETPOSTS fill:#4caf50
    style MARKDOWN fill:#4caf50
    style CONVERTER fill:#81c784
    style POSTS fill:#2196f3
    style POST fill:#2196f3
```

### Sync Flow Detail

```mermaid
sequenceDiagram
    participant Cron as Cron/Webhook
    participant Sync as /api/sync
    participant Orch as SyncOrchestrator
    participant Adapter as NotionAdapter
    participant Notion as Notion API
    participant Builder as PostBuilder
    participant ImgProc as Image Processor
    participant Storage as Nhost Storage
    participant Repo as PostRepository
    participant GQL as Hasura GraphQL
    participant DB as Postgres

    Note over Cron,DB: Sync Triggered (cron or webhook)
    
    Cron->>Sync: POST /api/sync
    Sync->>Orch: sync()
    
    loop For each page in database
        Orch->>Adapter: fetchPage()
        Adapter->>Notion: GET /pages/{id}
        Notion-->>Adapter: Page object
        Adapter-->>Orch: NotionPage
        
        Orch->>Builder: build(page)
        Builder->>Builder: Check isPublicRule()
        Builder->>Builder: Extract title, slug, tags
        Builder->>Builder: Parse Issue → publish_at
        Builder->>Builder: Convert content → markdown
        
        alt Has cover image
            Builder->>ImgProc: processNotionPageImages()
            ImgProc->>Notion: Download image
            ImgProc->>Storage: Upload to default bucket
            Storage-->>ImgProc: Permanent URL
            ImgProc-->>Builder: Rewritten URLs
        end
        
        Builder-->>Orch: PostData
        
        Orch->>Repo: upsert(post)
        Repo->>GQL: mutation { insert_pages_one }
        GQL->>DB: INSERT/UPDATE
        DB-->>GQL: OK
        GQL-->>Repo: OK
    end
    
    Orch-->>Sync: Sync complete
    Sync-->>Cron: 200 OK
```

### Request Sequence (Page Load)

```mermaid
sequenceDiagram
    participant B as Browser
    participant SSR as SvelteKit SSR
    participant SYM as Symbiont CMS
    participant CONV as post-converter.ts
    participant GQL as Hasura GraphQL
    participant DB as Postgres
    participant S3 as Nhost Storage

    Note over B,DB: Initial Page Load (Critical Path)
    
    B->>SSR: GET /?page=1
    SSR->>SYM: getAllPosts({ limit: 20 })
    SYM->>GQL: query pages(limit: 20)
    GQL->>DB: SELECT ... LIMIT 20
    DB-->>GQL: rows
    GQL-->>SYM: Post[]
    SYM->>SYM: parseMarkdown(summary)
    SSR->>CONV: symbiontToQwerPost()
    CONV-->>SSR: QWER Post[]
    SSR-->>B: HTML (20 posts rendered)
    
    Note over B,DB: Client Hydration
    B->>B: Svelte hydrates
    B->>B: IntersectionObserver setup
    
    Note over B,DB: Infinite Scroll (Page 2+)
    B->>SSR: GET /api/posts?page=2
    SSR->>SYM: getAllPosts({ limit: 20, offset: 20 })
    SYM->>GQL: query pages(limit: 20, offset: 20)
    GQL->>DB: SELECT ... OFFSET 20
    DB-->>SSR: rows → Post[] → JSON
    SSR-->>B: { posts, hasMore }
    B->>B: Append to displayedPosts
    
    Note over B,S3: Cover Images (Lazy)
    B->>S3: GET /storage/v1/files/{id}
    S3-->>B: image bytes
```

### Key Functions

| Layer | Function | Location | Purpose |
|-------|----------|----------|---------|
| **Symbiont** | `getAllPosts({ limit, offset })` | `symbiont-cms/server` | Fetch paginated posts |
| **Symbiont** | `parseMarkdown(content)` | `symbiont-cms/server` | Markdown → HTML |
| **Symbiont** | `processNotionPageImages()` | `symbiont-cms/server` | Upload images to Nhost |
| **California Tech** | `symbiontToQwerPost(post)` | `src/lib/utils/post-converter.ts` | Symbiont → QWER format |
| **SvelteKit** | `+page.server.ts:load()` | Routes | SSR data fetching |
| **SvelteKit** | `/api/posts:GET()` | Routes | JSON API for infinite scroll |
| **Svelte** | `IndexPosts.svelte` | Components | Post list with dividers |
| **Svelte** | `IndexPost.svelte` | Components | Individual post card |
| **Browser** | `IntersectionObserver` | Native API | Trigger infinite scroll |

### Performance Budget

| Metric | Target | Notes |
|--------|--------|-------|
| Initial HTML | < 50KB | SSR rendered 20 posts |
| Initial JS | < 200KB | SvelteKit + app |
| First Load (3G) | < 2s | Currently ~5s+ with 1000 posts |
| LCP | < 2.5s | Largest Contentful Paint |
| API Response | < 300ms | `/api/posts` endpoint |

### Optimization Checklist

**Initial Load:**
- [ ] Reduce to 20 posts (from 1000)
- [ ] Lean GraphQL queries (only needed fields)
- [ ] Parse markdown server-side
- [ ] Defer non-critical JS

**Infinite Scroll:**
- [ ] Show loading skeleton (no layout shift)
- [ ] Cache responses in memory
- [ ] Graceful error handling

**Images:**
- [ ] Lazy-load below fold
- [ ] Responsive srcset
- [ ] Proper cache headers

---

## 📋 Implementation Roadmap

### Phase 1: Core (Week 1)
1. 🔨 Date-based dividers
2. 🔨 Markdown in summaries
3. 🔨 Wire cover image sync

### Phase 2: Performance (Week 2)
4. 🔨 Add pagination to `getAllPosts()`
5. 🔨 Create `/api/posts` endpoint
6. 🔨 Implement infinite scroll
7. 🔨 Traditional pagination fallback

### Phase 3: Polish (Week 3)
8. 🎨 Loading states
9. 📊 Performance testing
10. 🧪 Integration tests

---

## 🔍 Investigation Tasks

1. **Pagination Support**
   ```typescript
   // Check if getAllPosts supports offset
   await getAllPosts({ fetch, limit: 20, offset: 40 });
   ```

2. **Media Helpers**
   - Review `image-processor.ts`
   - Review `image-upload.ts`
   - Verify target bucket

3. **Storage Sync**
   - Web instance has files in `default` bucket
   - Local dev is empty
   - Consider dedicated bucket for multisite

4. **Performance Baseline**
   - Measure current load times
   - Establish metrics before changes

---

## 📝 Open Questions

1. **Pagination:** Use `COUNT(*)` or over-fetch to check `hasMore`?
2. **Storage:** Stay with `default` bucket or create site-specific?
3. **Caching:** Cache `/api/posts` responses client-side?
4. **GraphQL:** Which fields can we omit from initial query?

---

## 👥 Action Items

- [ ] Check `getAllPosts()` offset/limit support
- [ ] Implement date-based dividers
- [ ] Wire markdown parsing for summaries
- [ ] Wire Phase 2 media sync
- [ ] Sync files to local dev Nhost
- [ ] Implement infinite scroll
- [ ] Measure performance baseline

---

**Last Updated:** January 10, 2026
