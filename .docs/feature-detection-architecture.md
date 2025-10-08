# Feature Detection Architecture

> **📖 Part of Phase 1.5 Enhancement** - Design is complete, partial implementation exists

> **⚠️ IMPLEMENTATION STATUS: PARTIALLY IMPLEMENTED**  
> - ✅ TypeScript interface exists (`ContentFeatures` in `markdown-processor.ts`)
> - ✅ Markdown processor accepts optional `features` parameter for optimization
> - ❌ Database schema doesn't have `features` JSONB column yet
> - ❌ No feature detection code during sync process
> - ❌ No backfill for existing content
> 
> This document describes the **recommended architecture** for feature detection. See `.docs/IMPLEMENTATION_STATUS.md` for tracking.

## Design Decision

Feature detection should happen during content **ingestion** (Notion→DB or Tiptap→DB), not during markdown **rendering**.

## Why This Approach?

### Problems with Render-Time Detection
❌ **Performance**: Parsing markdown twice (once for features, once for HTML)  
❌ **Complexity**: markdown-processor must track what features it used  
❌ **Server-Client Mismatch**: Server detects features, client needs to know too  
❌ **Redundancy**: Every render re-detects the same features  

### Benefits of Ingestion-Time Detection
✅ **Single Source of Truth**: Database field stores feature metadata  
✅ **Performance**: One-time detection during sync, not on every render  
✅ **Simplicity**: markdown-processor just renders, doesn't track  
✅ **Client Access**: Client can query feature flags directly from database  
✅ **Caching**: Feature flags cached with content, not computed on-demand  

---

## Architecture Overview

```
┌─────────────┐
│   Notion    │
│   Pages     │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────┐
│  Notion Sync Process            │
│  (notion-to-md → markdown)      │
│                                 │
│  1. Convert to markdown         │
│  2. Detect features used        │
│  3. Store in database           │
└──────┬──────────────────────────┘
       │
       ▼
┌─────────────────────────────────┐
│  Database (Nhost Postgres)      │
│                                 │
│  posts: {                       │
│    content: "markdown...",      │
│    features: {                  │
│      syntaxHighlighting: [...], │
│      math: true,                │
│      images: true,              │
│      footnotes: true,           │
│      embeds: [...],             │
│      ...                        │
│    }                            │
│  }                              │
└──────┬──────────────────────────┘
       │
       ├──────────────┬─────────────┐
       │              │             │
       ▼              ▼             ▼
┌──────────┐   ┌──────────┐  ┌───────────┐
│  Server  │   │  Client  │  │  Static   │
│  (SSR)   │   │  (CSR)   │  │  Build    │
│          │   │          │  │           │
│  Render  │   │  Load    │  │  Render   │
│  HTML    │   │  Assets  │  │  HTML     │
└──────────┘   └──────────┘  └───────────┘
```

---

## Database Schema

### Recommended `posts` Table Schema

```sql
CREATE TABLE posts (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,  -- Raw markdown (source of truth)
  
  -- Feature flags for optimization (both server and client)
  features JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Note**: No `html` or `toc` fields needed! These are rendered on-demand and cached via ISR.

### `features` JSONB Structure

```typescript
interface ContentFeatures {
  // Syntax highlighting
  syntaxHighlighting?: string[];  // ["javascript", "python", "rust"]
  syntaxHighlightingTheme?: string;  // "prism-tomorrow"
  
  // Math rendering
  math?: boolean;  // Has KaTeX equations
  
  // Image features
  images?: boolean;  // Has images (for medium-zoom)
  imageCount?: number;  // Optional: for preloading
  
  // Footnotes
  footnotes?: boolean;
  
  // Embeds
  embeds?: string[];  // ["youtube", "twitter", "codepen"]
  
  // Advanced formatting
  tables?: boolean;
  highlights?: boolean;  // ==text==
  spoilers?: boolean;  // ||text||
  
  // Notion-specific (if color workaround is used)
  colors?: boolean;  // Has colored text
}
```

### Example Database Row

```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "title": "Building a Rust Web Server",
  "slug": "rust-web-server",
  "content": "# Introduction\n\nLet's build a web server in Rust...",
  "features": {
    "syntaxHighlighting": ["rust", "bash", "toml"],
    "syntaxHighlightingTheme": "prism-tomorrow",
    "math": false,
    "images": true,
    "imageCount": 3,
    "footnotes": true,
    "embeds": [],
    "tables": true,
    "highlights": true,
    "spoilers": false,
    "colors": false
  },
  "created_at": "2025-10-08T12:00:00Z",
  "updated_at": "2025-10-08T12:00:00Z"
}
```

---

## Implementation Details

### 1. Feature Detection During Sync

**Location**: Notion sync process (before inserting to database)

```typescript
// packages/guutz-blog/src/routes/api/sync/+server.ts (or similar)

async function syncNotionPage(pageId: string) {
  // 1. Get Notion content
  const notion = new Client({ auth: process.env.NOTION_TOKEN });
  const page = await notion.pages.retrieve({ page_id: pageId });
  
  // 2. Convert to markdown
  const n2m = new NotionToMarkdown({ notionClient: notion });
  const mdblocks = await n2m.pageToMarkdown(pageId);
  const markdown = n2m.toMarkdownString(mdblocks);
  
  // 3. Detect features from markdown content
  const features = detectMarkdownFeatures(markdown);
  
  // 4. Store markdown + features (HTML/TOC rendered on-demand with ISR caching)
  await db.posts.insert({
    config: markdownConfig,  // From symbiont.config
    features  // Pass detected features to optimize Prism language loading
  });
  
  // 4. Store markdown + features (HTML/TOC rendered on-demand with ISR caching)
  await db.posts.insert({
    title: page.title,
    slug: generateSlug(page.title),
    content: markdown,      // Source of truth
    features,              // For optimization + client-side loading
    updated_at: new Date()
  });
}

function detectMarkdownFeatures(markdown: string): ContentFeatures {
  const features: ContentFeatures = {};
  
  // Detect code blocks and languages
  const codeBlockRegex = /```(\w+)/g;
  const languages = new Set<string>();
  let match;
  while ((match = codeBlockRegex.exec(markdown)) !== null) {
    languages.add(match[1]);
  }
  if (languages.size > 0) {
    features.syntaxHighlighting = Array.from(languages);
    features.syntaxHighlightingTheme = 'prism-tomorrow';
  }
  
  // Detect math
  if (markdown.includes('$$') || /\$[^$]+\$/.test(markdown)) {
    features.math = true;
  }
  
  // Detect images
  if (markdown.includes('![')) {
    features.images = true;
    features.imageCount = (markdown.match(/!\[/g) || []).length;
  }
  
  // Detect footnotes
  if (markdown.includes('[^')) {
    features.footnotes = true;
  }
  
  // Detect tables
  if (/\|.*\|/.test(markdown)) {
    features.tables = true;
  }
  
  // Detect highlights
  if (markdown.includes('==')) {
    features.highlights = true;
  }
  
  // Detect spoilers
  if (markdown.includes('||')) {
    features.spoilers = true;
  }
  
  // Detect embeds (YouTube, etc.)
  const embedUrls = markdown.match(/https?:\/\/(www\.)?(youtube\.com|youtu\.be|twitter\.com|codepen\.io)/g);
  if (embedUrls) {
    const embedTypes = new Set(embedUrls.map(url => {
      if (url.includes('youtube') || url.includes('youtu.be')) return 'youtube';
      if (url.includes('twitter')) return 'twitter';
      if (url.includes('codepen')) return 'codepen';
      return 'unknown';
    }));
    features.embeds = Array.from(embedTypes);
  }
  
  return features;
}
```

### 2. Simplified Markdown Processor

**Location**: `packages/symbiont-cms/src/lib/server/markdown-processor.ts`

```typescript
// Before (complex - feature detection during rendering):
export async function parseMarkdown(
  content: string,
  config?: MarkdownConfig
): Promise<{ html: string; toc: TocEntry[]; features: MarkdownFeatures }> {
  // ... complex feature tracking ...
  return { html, toc, features };  // ❌ Feature tracking burden
}

// After (simple - features provided by caller):
export async function parseMarkdown(
  content: string,
  options: MarkdownOptions
): Promise<{ html: string; toc: TocEntry[] }> {
  const { config, features } = options;
  
  // Preload Prism languages if features are known
  if (features?.syntaxHighlighting) {
    for (const lang of features.syntaxHighlighting) {
      loadPrismLanguage(lang);  // Preload instead of lazy load
    }
  }
  
  // Just render, don't track
  return { html, toc };  // ✅ Simple and focused
}
```

**Benefits**:
- ✅ **Optional optimization**: Features can be omitted, lazy loading still works
- ✅ **Faster rendering**: Preload all needed languages at once
- ✅ **No redundant work**: Features already detected during sync

### 3. Client-Side Asset Loading

**Location**: SvelteKit page component

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { PageData } from './$types';
  
  export let data: PageData;
  const { post } = data;
  
  onMount(async () => {
    // Load Prism.js for syntax highlighting
    if (post.features.syntaxHighlighting) {
      const Prism = await import('prismjs');
      
      // Load specific language grammars
      for (const lang of post.features.syntaxHighlighting) {
        await import(`prismjs/components/prism-${lang}.js`);
      }
      
      Prism.highlightAll();
    }
    
    // Load KaTeX for math
    if (post.features.math) {
      await import('katex/dist/katex.min.css');
    }
    
    // Initialize image zoom
    if (post.features.images) {
      const mediumZoom = (await import('medium-zoom')).default;
      mediumZoom('.prose img');
    }
  });
</script>

<article class="prose">
  {@html post.html}
</article>
```

### 4. Server-Side Rendering (SSR) with ISR Caching

Render HTML on-demand during SSR, cache with SvelteKit's ISR.

**During SSR** (`+page.server.ts`):
```typescript
import { parseMarkdown } from 'symbiont-cms/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
  // Query markdown content + features
  const { data } = await locals.nhost.graphql.request(`
    query GetPost($slug: String!) {
      posts(where: { slug: { _eq: $slug } }) {
        id
        title
        slug
        content    # Markdown
        features   # For optimization
        created_at
        updated_at
      }
    }
  `, { slug: params.slug });
  
  const post = data.posts[0];
  
  // Render on-demand with feature hints
  const { html, toc } = await parseMarkdown(post.content, {
    config: markdownConfig,
    features: post.features  // Preload Prism languages
  });
  
  // ISR caching - revalidate every hour or on-demand
  setHeaders({
    'cache-control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400'
  });
  
  return {
    post: { ...post, html, toc },
    features: post.features  // For client-side asset loading
  };
};
```

**Benefits of ISR over Database HTML**:
- ✅ **Cleaner schema**: Database only stores source content
- ✅ **Flexibility**: Can update renderer without re-syncing
- ✅ **Cache invalidation**: Built-in via SvelteKit/Vercel
- ✅ **Less storage**: Don't duplicate HTML in database
- ✅ **On-demand revalidation**: Fresh renders when needed

---

## Benefits Summary

### Performance
- **One-time cost**: Feature detection happens once during sync
- **No re-computation**: Features stored in database, not computed on every render
- **Faster SSR**: Markdown rendered on-demand with feature optimization, cached via ISR
- **Optimized loading**: Client loads only necessary assets
- **Prism optimization**: Preload all needed languages at once (no lazy loading overhead)

### Maintainability
- **Single responsibility**: markdown-processor just renders HTML
- **Clear separation**: Sync process handles detection, renderer handles rendering
- **Easy testing**: Test feature detection separately from rendering
- **Clean schema**: Database stores source markdown, not rendered HTML

### Flexibility
- **Manual overrides**: Can manually set features in database if needed
- **Multiple sources**: Works for Notion, Tiptap, or any markdown source
- **Extensibility**: Easy to add new feature flags
- **Renderer updates**: Change markdown processor without re-syncing content

---

## Migration Path

If you already have content in the database:

```typescript
// Migration script
async function migrateExistingPosts() {
  const posts = await db.posts.findMany();
  
  for (const post of posts) {
    const features = detectMarkdownFeatures(post.content);
    
    await db.posts.update({
      where: { id: post.id },
      data: { features }
    });
  }
}
```

---

## Future Enhancements

1. **Incremental Updates**: Only re-detect features if markdown content changed
2. **Feature Analytics**: Track which features are most used across all posts
3. **Smart Preloading**: Preload common assets based on feature usage patterns
4. **A/B Testing**: Test different syntax highlighting themes by feature flag

---

**Last Updated**: October 8, 2025  
**Architecture**: Ingestion-time feature detection with database storage
