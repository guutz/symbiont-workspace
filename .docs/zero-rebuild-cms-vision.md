# The Zero-Rebuild CMS Vision

## Overview

This document outlines the evolution from QWER's **build-time static generation** to a **fully dynamic CMS** where no rebuilds are required for content, assets, or configuration changes.

---

## Philosophy: From Static to Dynamic

### Traditional Static Site (QWER Original)

```
Edit Content → Rebuild → Deploy → Live
     ↓           ↓         ↓
  30 seconds  2 minutes  1 minute
  ────────────────────────────────
  Total: ~3-4 minutes to see changes
```

**Limitations:**
- ❌ Long feedback loop
- ❌ Build step required for any change
- ❌ Can't delegate content management
- ❌ No dynamic behavior
- ❌ Scales poorly with content volume

### Zero-Rebuild CMS (Your Vision)

```
Edit Content → Live (instantly)
     ↓
  Database → SSR → Client
     ↓
  < 1 second to see changes
```

**Benefits:**
- ✅ Instant updates
- ✅ Non-technical editors
- ✅ Dynamic capabilities
- ✅ Scales infinitely
- ✅ True CMS experience

---

## What Changes? (Everything!)

### 1. ✅ Blog Posts (Already Working!)

| Aspect | Before (Static) | After (Dynamic) |
|--------|----------------|-----------------|
| **Source** | Markdown files | Notion / Tiptap |
| **Storage** | Git repo | Postgres |
| **Build** | Required | Not needed |
| **Update Speed** | 3-4 minutes | < 1 second |
| **Who Edits** | Developers | Anyone |

**Status**: ✅ Implemented via Symbiont CMS

### 2. 🚧 Images & Files (Planned)

| Aspect | Before (Static) | After (Dynamic) |
|--------|----------------|-----------------|
| **Source** | `user/assets/` | Nhost Storage |
| **Processing** | Build-time | On-demand |
| **Build** | Required | Not needed |
| **Size Limit** | Bundle size | 100+ MB |
| **Optimization** | vite-imagetools | Nhost transforms |

**Status**: 🚧 Documented in `.docs/dynamic-file-management.md`

### 3. 🚧 Redirects (Planned)

| Aspect | Before (Static) | After (Dynamic) |
|--------|----------------|-----------------|
| **Source** | `vercel.json` | Postgres / Notion |
| **Management** | Config files | Admin UI / Notion |
| **Build** | Required | Not needed |
| **Analytics** | External | Built-in |
| **Expiration** | Manual | Automatic |

**Status**: 🚧 Documented in `.docs/dynamic-redirects-strategy.md`

### 4. 🔮 Site Configuration (Future Vision)

| Aspect | Before (Static) | After (Dynamic) |
|--------|----------------|-----------------|
| **Source** | `site.ts` config | Database |
| **Settings** | Hardcoded | Admin panel |
| **Build** | Required | Not needed |
| **Examples** | Title, theme, nav | All site settings |

**Status**: 🔮 Not yet planned

---

## The Generated Folder Mystery: Explained

You asked about **`src/generated/`** - let me explain what QWER does and why you're moving away from it:

### What QWER Generates at Build Time

```typescript
// packages/qwer-test/src/generated/

posts.json        // All blog posts (currently empty [])
tags.json         // Tag index
assets.json       // Image paths
assets.ts         // Asset store with optimized image imports
asset.d.ts        // TypeScript types for images
assets/           // Optimized images (WebP, AVIF, multiple sizes)
```

### How QWER Uses These Files

**File**: `src/lib/stores/posts.ts`

```typescript
// OLD WAY (build-time)
import postsjson from '$generated/posts.json';  // Load from generated file
const _allposts = postsjson as [string, Post.Post][];
export const postsAll = readable<Map<string, Post.Post>>(new Map(_allposts));

// NEW WAY (runtime)
export const postsAll = writable<Map<string, Post.Post>>(new Map());
export function initializePostsFromServer(posts: Post.Post[]) {
  const postMap = new Map(posts.map((post) => [post.slug, post]));
  postsAll.set(postMap);  // Initialize from server data
}
```

**Your posts store already supports BOTH!** 

It tries to load from `$generated/posts.json`, and if that fails (which it does for you because it's empty), it waits for server data via `initializePostsFromServer()`.

### The Store Architecture

```typescript
// Svelte stores are CLIENT-SIDE reactive state containers

// Pattern 1: Static (QWER Original)
const posts = readable(buildTimeData);  // Immutable, set once at build

// Pattern 2: Dynamic (Your Approach)
const posts = writable(initialValue);   // Mutable, updated at runtime
posts.set(serverData);                  // Load from +page.server.ts
```

**What's happening in your app:**

```
Server (+page.server.ts)
  ↓ Fetch from Postgres
  ↓ Return { posts: [...] }
Client (+page.svelte)
  ↓ onMount()
  ↓ initializePostsFromServer(data.posts)
Store (posts.ts)
  ↓ postsAll.set(data)
Components
  ↓ Subscribe to $postsAll
  ↓ Render posts!
```

---

## Hybrid Strategy: Best of Both Worlds

You don't have to choose **all static** or **all dynamic**. You can mix:

### Critical Static Assets (Keep Building)

```
static/
  favicon.png          ✅ Static (rarely changes)
  robots.txt           ✅ Static (rarely changes)
  manifest.webmanifest ✅ Static (rarely changes)
```

### Dynamic Content & Assets

```
Nhost Storage
  blog-images/         ✅ Dynamic (frequent changes)
  blog-files/          ✅ Dynamic (frequent uploads)
  user-uploads/        ✅ Dynamic (user-generated)

Nhost Postgres
  posts                ✅ Dynamic (daily changes)
  redirects            ✅ Dynamic (occasional changes)
  site_config          🔮 Dynamic (rare changes)
```

---

## The Build Process: What's Left?

### Before (Full Static Build)

```bash
pnpm build
├── Process markdown files        ← Going away
├── Optimize images                ← Going away (moving to Nhost)
├── Generate posts.json            ← Going away
├── Generate tags.json             ← Going away
├── Generate assets metadata       ← Going away
├── Compile Svelte components      ✅ Keep
├── Bundle JavaScript              ✅ Keep
├── Generate CSS                   ✅ Keep
└── Optimize static assets         ✅ Keep
```

### After (Minimal Build)

```bash
pnpm build
├── Compile Svelte components      ✅ Keep
├── Bundle JavaScript              ✅ Keep
├── Generate CSS                   ✅ Keep
├── Optimize static assets         ✅ Keep (favicon, etc.)
└── Done! (much faster)
```

**Result**: Builds become **much faster** because you're not processing content.

---

## Source of Truth: The Image URL Dilemma

You asked: *"Do we sync image URLs back to Notion?"*

### The Core Question

```
Notion (input) ──> Postgres (storage) ──> Website (output)
                         ↑
                    Should we sync back?
```

### Decision Matrix

| Scenario | Sync Back? | Why? |
|----------|-----------|------|
| **DB is source of truth** | ❌ No | Notion is just an input method |
| **Notion is source of truth** | ✅ Yes | Notion needs correct URLs |
| **Hybrid (your case)** | ⚠️ Maybe | Depends on workflow |

### Recommendation for Hybrid Model

**DON'T sync back automatically**, instead:

1. **Track both URLs** in database:
```sql
blog_files (
  storage_file_id uuid,              -- Nhost Storage
  original_url text,                 -- Original Notion AWS S3
  current_url text                   -- Generated Nhost URL
)
```

2. **Notion keeps its URLs** (they still work there):
```
Notion page: ![diagram](https://s3.aws.notion.com/...)  ← Still works in Notion!
Database:    ![diagram](https://nhost.run/...)          ← Works on website!
```

3. **Only sync back if**:
   - You're editing in Notion AND need to see the migrated image
   - You switch source of truth back to Notion
   - You want Notion as a preview environment

### The Large File Solution

For files **>5MB** (Notion's limit):

```
Workflow 1: Direct Upload
  ↓ Upload to Nhost via admin panel
  ↓ Get Nhost URL: https://nhost.run/v1/files/abc123
  ↓ Paste URL in Notion markdown: ![Big file](https://nhost.run/...)
  ↓ Sync from Notion → URL already correct! No migration needed!

Workflow 2: External Reference
  ↓ Host file elsewhere (GitHub, Dropbox, etc.)
  ↓ Reference external URL in Notion
  ↓ Sync → URL copied as-is
```

**Key insight**: If you **start** with Nhost URLs in Notion, you don't need to migrate them!

---

## The Ultimate Vision: Fully Dynamic Site

### Phase 1: Content (✅ Done)
- Posts from Notion/Tiptap
- Synced to Postgres
- Rendered via SSR

### Phase 2: Media (🚧 Next)
- Images migrated to Nhost Storage
- Files uploaded directly
- On-demand optimization

### Phase 3: Configuration (🚧 Next)
- Redirects from database
- Managed via Notion/Admin UI
- Updated instantly

### Phase 4: Site Settings (🔮 Future)
```typescript
// Instead of hardcoded config:
export const siteConfig = {
  title: 'My Blog',
  description: '...',
  // ...
};

// Load from database:
export async function loadSiteConfig() {
  const config = await gqlClient.request(GET_SITE_CONFIG);
  return config.site_config;
}

// Use in +layout.server.ts
export const load = async () => {
  return {
    siteConfig: await loadSiteConfig(),
  };
};
```

### Phase 5: Navigation (🔮 Future)
```sql
-- Dynamic nav menu
CREATE TABLE public.nav_items (
  id uuid PRIMARY KEY,
  label text,
  url text,
  order int,
  parent_id uuid REFERENCES nav_items(id),
  visible boolean DEFAULT true
);
```

### Phase 6: Pages (🔮 Future)
```sql
-- Not just blog posts, ANY page
CREATE TABLE public.pages (
  id uuid PRIMARY KEY,
  slug text UNIQUE,
  title text,
  content text,
  template text,  -- 'blog', 'landing', 'about', etc.
  meta jsonb      -- SEO, OG tags, etc.
);
```

---

## Trade-offs: When to Stay Static

### Keep Static If:
- ✅ You're the only editor (no CMS needed)
- ✅ Content changes are rare (< once/week)
- ✅ You prefer Git-based workflow
- ✅ Maximum performance is critical
- ✅ Simple deployment (no database)

### Go Dynamic If:
- ✅ Non-technical editors need access
- ✅ Frequent content updates (daily)
- ✅ Need CMS features (workflows, drafts)
- ✅ Want instant updates
- ✅ Large amount of content (>1000 posts)

**Your case**: You want Notion + Tiptap editing → Dynamic is the right choice!

---

## Performance Implications

### Build-Time Static (QWER Original)
```
First Visit: 200ms (everything pre-rendered)
Navigation: 50ms (instant)
SEO: Perfect (full HTML)
Database: Not needed
CDN: Very effective
```

### Runtime Dynamic (Your Approach)
```
First Visit: 300-500ms (SSR from database)
Navigation: 50ms (instant, client-side routing)
SEO: Perfect (SSR provides full HTML)
Database: Required (Nhost Postgres)
CDN: Effective (cache SSR output)
```

**Performance strategies**:
1. **Cache SSR output**: `Cache-Control: public, max-age=300, stale-while-revalidate=600`
2. **Index database**: Proper indexes on common queries
3. **Lazy load images**: Use `loading="lazy"` attribute
4. **Paginate posts**: Don't load 1000 posts at once
5. **CDN**: Vercel/Netlify edge caching

**Result**: Dynamic is ~100-300ms slower, but still **fast enough** for great UX!

---

## Migration Roadmap

### Week 1: Content Foundation ✅
- [x] Set up Nhost Postgres
- [x] Implement Notion sync
- [x] SSR post loading
- [x] Dynamic stores

### Week 2-3: Media Management 🚧
- [ ] Implement image migration
- [ ] Set up Nhost Storage buckets
- [ ] Add file upload during sync
- [ ] Test image optimization

### Week 4: Tiptap Editor 🚧
- [ ] Build editor UI
- [ ] Integrate file uploads
- [ ] Real-time preview
- [ ] Direct database writes

### Week 5: Redirects & Polish 🚧
- [ ] Database schema for redirects
- [ ] SvelteKit middleware
- [ ] Notion sync for redirects
- [ ] Analytics dashboard

### Week 6+: Advanced Features 🔮
- [ ] Admin UI
- [ ] Dynamic site config
- [ ] Navigation management
- [ ] Page templates

---

## Success Metrics

### Before (Static)
- ❌ 3-4 minutes to publish changes
- ❌ Requires developer for any change
- ❌ Build breaks on errors
- ❌ Limited to small content volume

### After (Dynamic)
- ✅ < 1 second to publish changes
- ✅ Anyone can edit via Notion/Tiptap
- ✅ No build step to break
- ✅ Infinite content scalability
- ✅ Analytics & insights
- ✅ Advanced CMS features

---

## Key Insights from Your Thinking

Your questions revealed important insights:

### 1. **"The generated folder is going away"** ✅
- Correct! It's a **transitional artifact**
- Your stores already support dynamic loading
- Can safely ignore those generated files

### 2. **"I want to avoid rebuilds entirely"** ✅
- Absolutely achievable!
- Content → Instant
- Images → Instant (via Nhost Storage)
- Redirects → Instant (via middleware)

### 3. **"Notion URLs breaking is a problem"** ✅
- Solved by **tracking both URLs**
- Notion keeps working for previews
- Website gets optimized Nhost URLs
- Best of both worlds!

### 4. **"Large files exceed Notion's limit"** ✅
- Solved by **direct Nhost uploads**
- Or reference Nhost URLs in Notion
- No migration needed if URL is already Nhost!

### 5. **"Everything should be as dynamic as posts"** ✅
- Files → Nhost Storage ✅
- Redirects → Database ✅
- Config → Database (future) ✅
- Full CMS experience! ✅

---

## Decision Log

**Date**: 2025-10-05  
**Decision**: Commit to Zero-Rebuild CMS architecture  
**Rationale**:
- Notion + Tiptap require dynamic backend
- Instant updates improve content workflow
- Scalability for growing content
- Modern CMS user experience

**Trade-offs Accepted**:
- Slightly slower initial page load (~200ms)
- Requires database infrastructure
- More complex than pure static

**Rejected Alternatives**:
- Full static (too limiting)
- Hybrid with rebuilds (defeats purpose)
- Headless CMS (unnecessary complexity)

---

## Related Documentation

- **`.docs/symbiont-cms.md`** 📦 - Complete Symbiont CMS guide
- **`.docs/image-optimization-strategy.md`** - Image handling details
- **`.docs/dynamic-file-management.md`** - File upload & storage
- **`.docs/dynamic-redirects-strategy.md`** - Redirect management

---

## Conclusion

You're building a **modern headless CMS** that happens to be tightly integrated with your blog. This is the **right architecture** for:

- ✅ Notion as content source
- ✅ Tiptap as rich editor
- ✅ Nhost as backend
- ✅ SvelteKit as frontend

**Your intuition is correct**: Everything that can be dynamic, *should* be dynamic. The build step becomes just compilation, not content processing.

This is the future of web development! 🚀

---

## Related Documentation

### Core Documentation
- **[Symbiont CMS Complete Guide](symbiont-cms.md)** - Philosophy, architecture, and API reference

### Implementation Guides
- **[Quick Start](QUICKSTART.md)** - Get up and running
- **[Integration Guide](INTEGRATION_GUIDE.md)** - QWER + Symbiont integration
- **[Type Compatibility](TYPE_COMPATIBILITY.md)** - Type system details

### Strategy Documents
- **[Image Optimization Strategy](image-optimization-strategy.md)** - Specific image handling details
- **[Dynamic File Management](dynamic-file-management.md)** - File upload & storage strategy
- **[Dynamic Redirects Strategy](dynamic-redirects-strategy.md)** - Database-driven redirects

### Implementation Guides
- **[Quick Start](QUICKSTART.md)** - Get the system running
- **[Integration Guide](INTEGRATION_GUIDE.md)** - QWER + Symbiont integration
- **[Type Compatibility](TYPE_COMPATIBILITY.md)** - Type system details

### Strategy Documents
- **[Image Optimization Strategy](image-optimization-strategy.md)** - Notion AWS S3 → Nhost Storage
- **[Dynamic File Management](dynamic-file-management.md)** - File uploads & storage
- **[Dynamic Redirects Strategy](dynamic-redirects-strategy.md)** - Database-driven redirects

---

**Status:** 📖 Vision Documented  
**Current Phase:** ✅ Phase 1 Complete (Posts)  
**Next Phase:** 🚧 Phase 2 (Images & Files)  
**Last Updated:** October 5, 2025
