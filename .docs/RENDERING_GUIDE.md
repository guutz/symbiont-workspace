# Symbiont CMS Rendering Guide

> **The Complete Guide** - Everything you need to know about SvelteKit routing and Symbiont's rendering strategy  
> **Last Updated:** October 8, 2025

---

## Quick Reference: SvelteKit File Types

### Page Files (Per-Route)

| File | Runs Where | Purpose | When To Use |
|------|-----------|---------|-------------|
| **+page.svelte** | Server + Client | Display the page | Always (required) |
| **+page.ts** | Server + Client | Universal load (runs both places) | Need data in browser (SPA navigation) |
| **+page.server.ts** | Server only | Server-only load | Need database/secrets/private APIs |
| **+server.ts** | Server only | API endpoint (no page) | Create REST/JSON APIs |

### Layout Files (Shared Across Routes)

| File | Runs Where | Purpose | When To Use |
|------|-----------|---------|-------------|
| **+layout.svelte** | Server + Client | Wrap child pages (nav, footer) | Always for shared UI |
| **+layout.ts** | Server + Client | Universal load for layouts | Shared data needed client-side |
| **+layout.server.ts** | Server only | Server-only load for layouts | Auth checks, shared database queries |

### Key Rules

1. **+page.server.ts and +page.ts CAN coexist** (server runs first, universal receives its data)
2. **+server.ts is for APIs** (returns JSON/data, not HTML pages)
3. **+layout files apply to all child routes** (nested layouts inherit from parents)
4. **Server files can't be imported by client code** (build will fail)

---

## Symbiont CMS Strategy: Hybrid Load Pattern

### The Goal

- ✅ Works without JavaScript (SSR fallback)
- ✅ Fast client-side navigation (SPA experience)
- ✅ Perfect SEO (server-rendered HTML)
- ✅ Secure (client never queries database directly)

### The Solution

**Use all three file types together:**

```
src/routes/[slug]/
├── +page.svelte          # Display post content
├── +page.server.ts       # SSR + no-JS fallback
└── +page.ts              # Fast client navigation

src/routes/api/posts/[slug]/
└── +server.ts            # API endpoint for navigation
```

---

## The Flow: How It All Works

### Scenario 1: Initial Page Load (SSR)

```
User visits /blog/hello-world
         ↓
+page.server.ts runs on server
         ↓
    • Query Nhost database
    • Render markdown to HTML
    • Return { post, html, toc }
         ↓
+page.ts runs on server (SSR)
         ↓
    • Receives data from +page.server.ts
    • Returns it as-is (passthrough)
         ↓
+page.svelte renders on server
         ↓
HTML sent to browser (fully rendered)
         ↓
IF JavaScript enabled:
    Hydration: +page.ts runs in browser
         ↓
    • Uses embedded data (no fetch)
    • Attaches event listeners to existing HTML
    • Enables client-side routing (SPA behavior)
    • Makes Svelte components interactive
         ↓
IF JavaScript disabled:
    HTML displays as-is (no hydration)
         ↓
    • Links work as regular <a> tags
    • Full page reload on navigation
    • Content is fully readable (just not interactive)
         ↓
Page displays instantly ⚡
```

**Result:** Fast SSR, works without JS, perfect SEO

**What is hydration?**
- Server sends fully-rendered HTML (content visible immediately)
- Browser downloads JavaScript in background
- JavaScript "hydrates" the static HTML by:
  - Attaching click handlers to links (for SPA navigation)
  - Making Svelte components reactive
  - Enabling client-side routing
  - Running `+page.ts` to set up navigation logic
- Without JS: HTML stays static but fully functional

### Scenario 2: Client-Side Navigation

```
User on /blog/hello-world clicks link to /blog/goodbye-world
         ↓
+page.ts runs in browser
         ↓
    • No server data (client navigation)
    • fetch('/api/posts/goodbye-world')
         ↓
API route (+server.ts) handles request
         ↓
    • Query Nhost database
    • Render markdown to HTML
    • Return JSON { post, html, toc }
         ↓
+page.ts receives data
         ↓
+page.svelte updates
         ↓
Smooth SPA transition (no full page reload) 🚀
```

**Result:** 4x faster than full page reload

### Scenario 3: No JavaScript

```
User (no JS) clicks link to /blog/goodbye-world
         ↓
Browser makes HTTP request (no client-side routing)
         ↓
+page.server.ts runs on server
         ↓
    • (same as Scenario 1)
         ↓
Full page reload
         ↓
Still works perfectly! ✅
```

**Result:** Progressive enhancement, site works for everyone

---

## Implementation: The Three Files

### 1. +page.server.ts (SSR Load)

**Purpose:** Server-side rendering for initial loads and no-JS fallback

```typescript
// User creates: src/routes/[slug]/+page.server.ts
export { load } from 'symbiont-cms/server';
```

**What it does internally:**

```typescript
// Inside symbiont-cms/server
export const load: PageServerLoad = async ({ fetch, params }) => {
  const post = await getPostBySlug(params.slug, { fetch });
  if (!post) throw error(404, 'Post not found');
  
  const config = await loadConfig();
  const { html, toc } = await parseMarkdown(post.content, {
    config: config.markdown,
    features: post.features
  });
  
  return { post, html, toc };
};

export const config = { isr: { expiration: 60 } };
```

**When it runs:**
- ✅ Initial page load (SSR)
- ✅ No-JS navigation (full page reload)
- ❌ Client-side navigation (SvelteKit uses +page.ts instead)

### 2. +page.ts (Universal Load)

**Purpose:** Enable fast client-side navigation while using SSR data when available

```typescript
// User creates: src/routes/[slug]/+page.ts
export { load } from 'symbiont-cms';
```

**What it does internally:**

```typescript
// Inside symbiont-cms
export const load: PageLoad = async ({ fetch, params, data }) => {
  // If server data exists (SSR/hydration), use it
  if (data) {
    return data;
  }
  
  // Otherwise, fetch from API route (client navigation)
  const response = await fetch(`/api/posts/${params.slug}`);
  if (!response.ok) throw error(response.status, 'Post not found');
  
  return response.json();
};
```

**When it runs:**
- ✅ On server during SSR (receives data from +page.server.ts)
- ✅ In browser during hydration (uses embedded data)
- ✅ In browser during navigation (fetches from API)

### 3. +server.ts (API Route)

**Purpose:** Provide JSON endpoint for client-side navigation

```typescript
// User creates: src/routes/api/posts/[slug]/+server.ts
export { GET } from 'symbiont-cms/server';
```

**What it does internally:**

```typescript
// Inside symbiont-cms/server
export const GET: RequestHandler = async ({ params, fetch, setHeaders }) => {
  const post = await getPostBySlug(params.slug, { fetch });
  if (!post) throw error(404, 'Post not found');
  
  const config = await loadConfig();
  const { html, toc } = await parseMarkdown(post.content, {
    config: config.markdown,
    features: post.features
  });
  
  // HTTP caching
  setHeaders({
    'cache-control': 'public, max-age=60, s-maxage=60'
  });
  
  return json({ post, html, toc });
};
```

**When it runs:**
- ✅ When +page.ts makes fetch request during client navigation
- ❌ Never during SSR (not needed, +page.server.ts handles that)

---

## Architecture Decisions: The "Why"

### Decision 1: Always Render Markdown on Server

**Our approach:**
```typescript
// Server (in +page.server.ts or API route)
const { html } = await parseMarkdown(post.content);
return { post, html };  // Client receives HTML
```

**Alternative (client-side rendering):**
```typescript
// Client (in +page.ts)
import { marked } from 'marked';
const html = marked(post.content);  // Render in browser
```

#### Why Server-Side Wins

##### 1. Security & Control

**Problem with client rendering:**
```typescript
// Client code can be modified by users
const html = marked(post.content, {
  sanitize: false  // User could disable sanitization!
});
```

**Server-side is locked down:**
```typescript
// Server code can't be tampered with
const html = await parseMarkdown(post.content, {
  sanitize: true,  // Always enforced
  allowedTags: SAFE_TAGS  // We control this
});
```

**Real-world scenarios:**
- User opens dev tools, modifies client code to inject XSS
- User disables sanitization to embed malicious scripts
- Attacker exploits client-side parser vulnerabilities

##### 2. Bundle Size

**Client-side markdown parser:**
```
marked.js           ~45KB (minified)
markdown-it         ~73KB
+ syntax highlighter ~120KB (Prism with languages)
+ KaTeX              ~250KB (math rendering)
+ Mermaid            ~500KB (diagrams)
──────────────────────────────
Total:               ~1MB+ 😱
```

**Server-side (our approach):**
```
Client bundle:       ~80KB (SvelteKit + routing)
Markdown parser:     0KB (runs on server)
Syntax highlighter:  0KB (runs on server)
KaTeX:              ~10KB (just CSS, rendering done server-side)
──────────────────────────────
Total:               ~90KB ✅
```

**User experience:**
- **Client rendering:** 1MB download, 200ms+ parsing time
- **Server rendering:** 90KB download, HTML already rendered

##### 3. Consistency & Correctness

**Problem: Different parsers behave differently**

```typescript
// Server uses markdown-it
const serverHTML = markdownit.render('# Hello');
// <h1>Hello</h1>

// Client uses marked (different parser)
const clientHTML = marked('# Hello');
// <h1 id="hello">Hello</h1>  ← Different output!
```

**What breaks:**
- TOC links don't match heading IDs
- Syntax highlighting differs
- Math formulas render differently
- Custom plugins don't match

**With server-only rendering:**
- ✅ Same parser everywhere (markdown-it)
- ✅ Same plugins everywhere
- ✅ TOC always matches headings
- ✅ No hydration mismatches

##### 4. Performance

**Client-side rendering flow:**
```
Browser requests /post
    ↓ (300ms)
Download JS bundle (1MB)
    ↓ (200ms)
Parse & execute JS
    ↓ (100ms)
Render markdown to HTML
    ↓ (50ms)
Display content
──────────────────
Total: 650ms 🐌
```

**Server-side rendering flow:**
```
Browser requests /post
    ↓ (200ms)
Receive pre-rendered HTML
    ↓ (instant)
Display content
──────────────────
Total: 200ms ⚡
```

**Plus caching:**
```
Browser requests /post (cached)
    ↓ (50ms)
Display content (from cache)
──────────────────
Total: 50ms 🚀
```

##### 5. SEO & Accessibility

**Client-side rendering:**
```html
<!-- What crawlers see initially -->
<div id="content">Loading...</div>
<script src="app.js"></script>

<!-- After JS executes (crawlers may not wait) -->
<div id="content">
  <h1>My Post</h1>
  <p>Content here...</p>
</div>
```

**Server-side rendering:**
```html
<!-- What crawlers see immediately -->
<div id="content">
  <h1>My Post</h1>
  <p>Content here...</p>
</div>
```

**Real-world impact:**
- Google may index client-rendered content, but with delays
- Social media previews won't work (no Open Graph)
- Screen readers see "Loading..." initially
- No-JS users see nothing

##### 6. Error Handling

**Client-side errors are silent:**
```typescript
try {
  const html = marked(post.content);
} catch (err) {
  // User sees broken page
  console.error(err);  // Only in their console
}
```

**Server-side errors are logged:**
```typescript
try {
  const html = await parseMarkdown(post.content);
} catch (err) {
  logger.error({ event: 'markdown_parse_failed', error: err });
  // You get alerts, can investigate
  throw error(500, 'Failed to render post');
}
```

---

### Decision 2: Client Never Queries Nhost Directly

**Our approach:**
```typescript
// Client → SvelteKit API → Nhost
const response = await fetch('/api/posts/my-post');
const { post, html } = await response.json();
```

**Alternative (direct queries):**
```typescript
// Client → Nhost directly
const response = await fetch('https://myapp.nhost.run/v1/graphql', {
  method: 'POST',
  body: JSON.stringify({ query: GET_POST })
});
```

#### Why API Layer Wins

##### 1. Security: Exposed Endpoints

**Direct Nhost queries expose your database:**

```typescript
// If client has Nhost URL, users can query ANYTHING
const maliciousQuery = `
  query {
    posts { id title content }
    users { id email password_hash }  ← Uh oh
    admin_secrets { api_keys }        ← Double uh oh
  }
`;

fetch('https://myapp.nhost.run/v1/graphql', {
  method: 'POST',
  body: JSON.stringify({ query: maliciousQuery })
});
```

**Even with Hasura permissions:**
- Users can discover schema via introspection
- Users can query relationships you didn't intend
- Users can perform expensive queries (DoS)
- Users can bypass rate limiting

**With API layer:**
```typescript
// Server controls exactly what's exposed
export const GET: RequestHandler = async ({ params }) => {
  // Only return what we explicitly allow
  const post = await getPostBySlug(params.slug);
  
  // Never expose sensitive fields
  const { password, secret_key, ...safePost } = post;
  
  return json(safePost);
};
```

##### 2. Rate Limiting & Cost Control

**Direct queries can be expensive:**

```typescript
// User in dev tools
for (let i = 0; i < 1000; i++) {
  fetch('https://myapp.nhost.run/v1/graphql', {
    body: JSON.stringify({
      query: `query { posts { id title content images } }`
    })
  });
}
// 1000 database queries in seconds! 💸
```

**With API layer, you can protect yourself:**

```typescript
// Add rate limiting
import rateLimit from '$lib/rateLimit';

export const GET: RequestHandler = async ({ request }) => {
  await rateLimit.check(request);  // Throw 429 if exceeded
  
  // Only allow 10 requests per minute per IP
  const post = await getPostBySlug(params.slug);
  return json(post);
};
```

##### 3. Caching Layer

**Direct queries can't be cached:**
```typescript
// Every navigation = new database query
const post = await fetch('https://myapp.nhost.run/v1/graphql');
// No browser cache (POST request)
// No CDN cache (dynamic endpoint)
```

**API layer enables intelligent caching:**
```typescript
export const GET: RequestHandler = async ({ params, setHeaders }) => {
  // Check cache first
  const cached = await cache.get(`post:${params.slug}`);
  if (cached) return json(cached);
  
  // Query database
  const post = await getPostBySlug(params.slug);
  
  // Set HTTP cache headers
  setHeaders({
    'cache-control': 'public, max-age=60',
    'cdn-cache-control': 'max-age=3600'  // CDN caches longer
  });
  
  // Store in Redis/memory cache
  await cache.set(`post:${params.slug}`, post, 60);
  
  return json(post);
};
```

**Result:**
- First request: 200ms (database query)
- Subsequent requests: 5ms (cache hit)
- CDN edge cache: <1ms (no origin request)

##### 4. Monitoring & Analytics

**Direct queries are invisible:**
```typescript
// You have no idea:
// - How many requests are being made
// - Which posts are popular
// - Where errors are happening
// - Who's using your API
```

**API layer gives you full visibility:**
```typescript
export const GET: RequestHandler = async ({ params, request }) => {
  const start = Date.now();
  
  try {
    const post = await getPostBySlug(params.slug);
    
    // Log successful request
    logger.info({
      event: 'post_fetched',
      slug: params.slug,
      duration: Date.now() - start,
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent')
    });
    
    return json(post);
  } catch (err) {
    // Log errors for debugging
    logger.error({
      event: 'post_fetch_failed',
      slug: params.slug,
      error: err.message,
      stack: err.stack
    });
    
    throw error(500, 'Failed to load post');
  }
};
```

##### 5. Transformation & Enrichment

**Direct queries return raw data:**
```typescript
const post = await queryNhost();
// { id, title, content, publish_at: "2024-10-09T00:00:00Z" }
```

**API layer can transform data:**
```typescript
export const GET: RequestHandler = async ({ params }) => {
  const post = await getPostBySlug(params.slug);
  
  return json({
    ...post,
    // Format dates for display
    publishDate: new Date(post.publish_at).toLocaleDateString(),
    
    // Add computed fields
    readingTime: calculateReadingTime(post.content),
    
    // Include related posts
    related: await getRelatedPosts(post.tags),
    
    // Add SEO metadata
    seo: {
      title: post.title,
      description: post.content.substring(0, 160),
      ogImage: extractFirstImage(post.content)
    }
  });
};
```

##### 6. Future-Proofing

**If you ever need to change databases:**

```typescript
// With direct Nhost queries:
// Every client has Nhost URL hardcoded
// You'd need to update every client

// With API layer:
// Clients only know /api/posts/[slug]
// You can swap Nhost for anything behind the scenes
export const GET: RequestHandler = async ({ params }) => {
  // Switch from Nhost to...
  // const post = await queryNhost(params.slug);
  // const post = await querySupabase(params.slug);
  // const post = await queryMongoDB(params.slug);
  const post = await queryCockroachDB(params.slug);
  
  return json(post);  // Clients don't care
};
```

---

## When You MIGHT Consider Alternatives

### Client-Side Rendering: Edge Cases

**Scenario 1: User-Generated Content with Live Preview**
```typescript
// Text editor with live markdown preview
const livePreview = marked(userInput);
```
**Why it makes sense:** Instant feedback, no server roundtrip needed

**But for Symbiont:** Published posts should still be server-rendered

---

### Direct Nhost Queries: Edge Cases

**Scenario 1: Publicly Readable, Static Data**
```typescript
// Site configuration that never changes
const config = await fetch('https://nhost.run/graphql', {
  body: JSON.stringify({
    query: '{ config { siteName theme } }'
  })
});
```

**Why it might work:**
- Data is truly public
- No sensitive information
- Schema is simple and stable
- No rate limiting concerns

**But for Symbiont:** Blog posts contain too much complexity, better to use API layer

---

## The Bottom Line

### Server-Side Markdown Rendering

**Yes, always render on server because:**
1. ✅ **10x smaller bundle** (80KB vs 1MB+)
2. ✅ **Better security** (no client-side parser exploits)
3. ✅ **Consistent output** (one parser, no hydration issues)
4. ✅ **Better SEO** (instant HTML for crawlers)
5. ✅ **Works without JS** (progressive enhancement)
6. ✅ **Centralized error handling** (you see failures, not users)

**Trade-off:** Server CPU usage (but cheap and cacheable)

### API Layer Between Client & Nhost

**Yes, always use API layer because:**
1. ✅ **Security** (control what's exposed, no schema introspection)
2. ✅ **Rate limiting** (protect against abuse and costs)
3. ✅ **Caching** (HTTP cache + CDN + Redis)
4. ✅ **Monitoring** (see what's happening)
5. ✅ **Transformations** (enrich data, format fields)
6. ✅ **Future-proof** (swap databases without client changes)

**Trade-off:** One extra network hop (but mitigated by caching)

---

## Performance Math

### Client-Side Rendering
```
Initial Load:
  Download bundle: 1MB @ 5Mbps = 1600ms
  Parse/execute:                 200ms
  Render markdown:                50ms
  ──────────────────────────────────
  Total:                        1850ms

Navigation:
  Query Nhost:                   150ms
  Render markdown:                50ms
  ──────────────────────────────────
  Total:                         200ms
```

### Server-Side Rendering (Our Approach)
```
Initial Load:
  Download bundle: 80KB @ 5Mbps =  128ms
  Display HTML:                     0ms (already rendered)
  ──────────────────────────────────
  Total:                          128ms ⚡ (14x faster)

Navigation (uncached):
  Query API:                     100ms
  (server queries DB, renders)    50ms
  ──────────────────────────────────
  Total:                         150ms ⚡ (1.3x faster)

Navigation (cached):
  Query API (cache hit):          10ms
  ──────────────────────────────────
  Total:                          10ms 🚀 (20x faster)
```

---

## Configuration

### What You Can Configure

```typescript
// symbiont.config.ts
export default {
  graphqlEndpoint: 'https://myapp.nhost.run/v1/graphql',
  databases: [/* ... */],
  
  // Cache duration (both SSR and API)
  caching: {
    isr: {
      enabled: true,
      revalidate: 60 // seconds
    },
    api: {
      enabled: true,
      maxAge: 60 // seconds
    }
  },
  
  // Enable/disable client navigation
  navigation: {
    enabled: true,
    apiPath: '/api/posts/[slug]' // customize if needed
  }
} satisfies SymbiontConfig;
```

### Defaults (Zero Config Works Great)

```typescript
{
  caching: {
    isr: { enabled: true, revalidate: 60 },
    api: { enabled: true, maxAge: 60 }
  },
  navigation: {
    enabled: true,
    apiPath: '/api/posts/[slug]'
  }
}
```

### Disable Client Navigation (Pure SSR)

```typescript
// symbiont.config.ts
export default {
  graphqlEndpoint: '...',
  databases: [/* ... */],
  
  navigation: {
    enabled: false // No client-side routing
  }
} satisfies SymbiontConfig;
```

**Then only create:**
```typescript
// src/routes/[slug]/+page.server.ts
export { load } from 'symbiont-cms/server';
```

**Result:**
- ✅ Pure SSR (no client routing)
- ✅ Smaller bundle (~50KB vs ~80KB)
- ✅ Still works great, just slower navigation

---

## When To Use Each File Type

### Use +page.server.ts When:

- ✅ You need to query a database
- ✅ You need environment variables/secrets
- ✅ You need to call private APIs
- ✅ You want SSR for SEO
- ✅ You want the site to work without JS

**Example: Blog posts (Symbiont CMS)**
```typescript
export { load } from 'symbiont-cms/server';
```

### Use +page.ts When:

- ✅ You want fast client-side navigation
- ✅ You're fetching from public APIs
- ✅ You need to return non-serializable data (classes, functions)
- ✅ You want to enhance SSR with client features

**Example: Symbiont CMS navigation**
```typescript
export { load } from 'symbiont-cms';
```

### Use +server.ts When:

- ✅ You're building a REST API
- ✅ You need custom API endpoints
- ✅ You want webhooks/callbacks
- ✅ You need full control over HTTP response

**Example: API endpoint for client navigation**
```typescript
export { GET } from 'symbiont-cms/server';
```

### Use +layout.server.ts When:

- ✅ You need auth checks for multiple pages
- ✅ You have shared data from database
- ✅ You need to set cookies/headers globally

**Example: User authentication**
```typescript
export const load: LayoutServerLoad = async ({ locals, cookies }) => {
  const session = cookies.get('session');
  const user = await db.getUser(session);
  return { user };
};
```

### Use +layout.ts When:

- ✅ You need shared data available client-side
- ✅ You're fetching from public APIs for all pages
- ✅ You want to transform layout data

**Example: Site-wide config**
```typescript
export const load: LayoutLoad = async ({ fetch }) => {
  const config = await fetch('/api/config').then(r => r.json());
  return { config };
};
```

---

## Performance Comparison

| Metric | SSR Only | With Hybrid Load |
|--------|----------|------------------|
| **Initial Load** | ~200ms | ~200ms (same) |
| **Navigation** | ~600ms | ~150ms (4x faster) |
| **With Cache** | ~600ms | ~50ms (12x faster) |
| **Bundle Size** | ~50KB | ~80KB (+60%) |
| **Works No-JS** | ✅ Yes | ✅ Yes |
| **SEO** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ (same) |

**Verdict:** 60% larger bundle for 4x faster navigation is absolutely worth it.

---

## Migration Guide

### Current Setup (SSR Only)

```
src/routes/[slug]/
├── +page.svelte
└── +page.server.ts       # export { load } from 'symbiont-cms/server';
```

**Works fine, but navigation is slow.**

### Add Client Navigation (No Breaking Changes!)

**Just add two files:**

```
src/routes/[slug]/
├── +page.svelte          # Keep as-is
├── +page.server.ts       # Keep as-is
└── +page.ts              # NEW: export { load } from 'symbiont-cms';

src/routes/api/posts/[slug]/
└── +server.ts            # NEW: export { GET } from 'symbiont-cms/server';
```

**That's it!** No changes to existing files needed.

---

## Common Patterns

### Pattern 1: Auth-Protected Pages

```typescript
// +layout.server.ts (runs on every page)
export const load: LayoutServerLoad = async ({ locals, cookies }) => {
  const session = cookies.get('session');
  if (!session) throw redirect(307, '/login');
  
  const user = await db.getUser(session);
  return { user };
};

// +page.server.ts (page-specific data)
export const load: PageServerLoad = async ({ params, parent }) => {
  const { user } = await parent(); // Get user from layout
  const post = await db.getPost(params.slug);
  
  if (post.authorId !== user.id) throw error(403, 'Forbidden');
  return { post };
};
```

### Pattern 2: Public API + Private Data

```typescript
// +page.server.ts (private data)
export const load: PageServerLoad = async ({ fetch }) => {
  const privateData = await db.getPrivateSettings();
  return { privateData };
};

// +page.ts (public data for client)
export const load: PageLoad = async ({ fetch, data }) => {
  if (data) return data; // SSR
  
  // Client navigation - fetch public API
  const publicData = await fetch('/api/public').then(r => r.json());
  return { publicData };
};
```

### Pattern 3: Optimistic UI

```typescript
// +page.ts
export const load: PageLoad = async ({ fetch, params, data }) => {
  // Use cached data immediately
  const cachedPost = getCachedPost(params.slug);
  
  // Fetch fresh data in background
  const freshPost = fetch(`/api/posts/${params.slug}`)
    .then(r => r.json());
  
  return {
    post: cachedPost || await freshPost,
    fresh: freshPost // Promise for updates
  };
};
```

---

## FAQ

### Q: Can +page.server.ts and +page.ts coexist?

**A:** Yes! This is a standard SvelteKit pattern. Server load runs first, universal load receives its data.

### Q: Does +page.ts increase bundle size?

**A:** Yes, by ~30KB for SvelteKit's client-side routing. Worth it for 4x faster navigation.

### Q: What if I disable JavaScript?

**A:** Site works perfectly. SvelteKit falls back to +page.server.ts and full page reloads.

### Q: Should I always use both files?

**A:** No. Use +page.server.ts only for admin pages, forms, or content that rarely changes.

### Q: Can +page.ts query the database directly?

**A:** No! Always query through API routes (+server.ts). Security and separation of concerns.

### Q: What about +layout files?

**A:** Same pattern! Use +layout.server.ts for auth, +layout.ts for client-side shared data.

---

## Summary

**Symbiont CMS uses three files for optimal performance:**

1. **+page.server.ts** - SSR for initial load, no-JS support, SEO
2. **+page.ts** - Fast client-side navigation, SPA experience
3. **+server.ts** - API endpoint for client fetches

**Key principles:**

- ✅ Server always renders markdown (security + consistency)
- ✅ Client never queries Nhost directly (goes through API)
- ✅ Progressive enhancement (works without JS)
- ✅ One good way to do it (no confusing options)

**Result:** Fast, secure, SEO-friendly blog that works for everyone.

---

**Ready to implement?** Just add the three files shown above! 🚀
