# Image Optimization Strategy for Symbiont CMS

> **📖 Part of the Zero-Rebuild CMS Vision** - See `.docs/zero-rebuild-cms-vision.md` for the complete architecture

## Context

We're building a dynamic blog CMS where:

## Overview

This document outlines the recommended approach for handling images in the Symbiont CMS blog system, specifically addressing the challenge of migrating images from external sources (Notion AWS S3, Tiptap uploads) to Nhost Storage with on-the-fly optimization.

---

## The Problem

**Challenge**: Images come from multiple sources with different constraints:

1. **Notion Images**: Hosted on AWS S3 with **expiring signed URLs** (~1 hour TTL)
2. **Tiptap Uploads**: Need to be uploaded somewhere and referenced in markdown
3. **Existing QWER Setup**: Expects local file paths, processes images at build time with `vite-imagetools`

**Goal**: Unify image handling to work with database-driven content while maintaining performance and SEO.

---

## Recommended Strategy: Option 3 - Download During Sync

### High-Level Approach

When syncing content from Notion (or processing Tiptap uploads), automatically:
1. **Extract** all image URLs from markdown content
2. **Download** images from their source (Notion AWS S3, etc.)
3. **Upload** to Nhost Storage
4. **Replace** URLs in markdown with Nhost Storage URLs
5. **Store** cover image URL in `posts.cover` field

### Why This Approach?

✅ **Permanent URLs**: Nhost Storage URLs don't expire  
✅ **Built-in Optimization**: Nhost provides on-the-fly image transformation  
✅ **Database Integration**: Storage metadata stored in Postgres alongside posts  
✅ **CDN-Backed**: Globally distributed with proper cache headers  
✅ **SEO-Friendly**: Fast loading, proper formats (WebP, AVIF)

---

## Nhost Storage Image Optimization

Nhost Storage provides URL-based image transformations:

```typescript
// Original image URL from Nhost Storage
const baseUrl = "https://[subdomain].storage.[region].nhost.run/v1/files/[file-id]";

// Transform on-the-fly with query parameters
const thumbnail = `${baseUrl}?w=400&h=300&q=80`;
const webp = `${baseUrl}?w=800&fm=webp`;
const retina = `${baseUrl}?w=1600&dpr=2`;
```

### Supported Transformations

| Parameter | Description | Example |
|-----------|-------------|---------|
| `w` | Width in pixels | `?w=800` |
| `h` | Height in pixels | `?h=600` |
| `q` | Quality (1-100) | `?q=85` |
| `fm` | Format | `?fm=webp` or `?fm=avif` |
| `fit` | Resize mode | `?fit=cover` |
| `dpr` | Device pixel ratio | `?dpr=2` |
| `blur` | Blur radius | `?blur=50` |
| `auto` | Auto-optimization | `?auto=format,compress` |

---

## Image Size Hints with @mdit/plugin-img-size

Symbiont CMS uses `@mdit/plugin-img-size` to support explicit width/height dimensions in markdown:

```markdown
<!-- Specify width and height for better CLS (Cumulative Layout Shift) -->
![Alt text](https://nhost-url.com/image.jpg =800x600)

<!-- Width only (auto height) -->
![Alt text](https://nhost-url.com/image.jpg =800x)

<!-- Height only (auto width) -->
![Alt text](https://nhost-url.com/image.jpg =x600)

<!-- Combined with Nhost optimization -->
![Alt text](https://nhost-url.com/image.jpg?w=1200&fm=webp =800x600)
```

**Generated HTML:**
```html
<img src="https://nhost-url.com/image.jpg?w=1200&fm=webp" 
     width="800" 
     height="600" 
     alt="Alt text">
```

### Benefits

✅ **Better Performance**: Browser reserves space before image loads (no layout shift)  
✅ **Clean Markdown**: Size hints are readable and portable  
✅ **No Metadata Table**: Dimensions stored inline with content  
✅ **Works with External URLs**: No database dependency  

### During Notion Sync

When downloading images from Notion, you can optionally:
1. Detect original image dimensions
2. Append size hint to markdown: `![alt](nhost-url =WxH)`
3. Store in database

This improves Core Web Vitals (CLS) without requiring a separate metadata table.

---

## Implementation Plan

### Phase 1: Core Infrastructure

**File**: `packages/symbiont-cms/src/lib/server/image-processor.ts`

```typescript
/**
 * Process markdown content and migrate images to Nhost Storage
 * 
 * @param markdown - Original markdown content with external image URLs
 * @param notionPageId - Notion page ID for organizing uploads
 * @param detectDimensions - Whether to detect and append image dimensions
 * @returns Markdown with Nhost Storage URLs (and optional size hints)
 */
export async function processMarkdownImages(
  markdown: string,
  notionPageId: string,
  detectDimensions = true
): Promise<string> {
  // 1. Extract all image URLs from markdown
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images = [...markdown.matchAll(imageRegex)];
  
  // 2. Download and upload each image
  for (const [fullMatch, alt, url] of images) {
    const { nhostUrl, width, height } = await downloadAndUploadImage(url, notionPageId, alt);
    
    // Optionally append size hint for better CLS
    const sizeHint = (detectDimensions && width && height) ? ` =${width}x${height}` : '';
    markdown = markdown.replace(fullMatch, `![${alt}](${nhostUrl}${sizeHint})`);
  }
  
  return markdown;
}
    const nhostUrl = await downloadAndUploadImage(url, notionPageId, alt);
    markdown = markdown.replace(fullMatch, `![${alt}](${nhostUrl})`);
  }
  
  return markdown;
}

/**
 * Download image from external URL and upload to Nhost Storage
 */
async function downloadAndUploadImage(
  externalUrl: string,
  notionPageId: string,
  altText: string
): Promise<string> {
  // Implementation:
  // 1. Fetch image from external URL
  // 2. Upload to Nhost Storage (via REST API or SDK)
  // 3. Return Nhost Storage URL
}
```

### Phase 2: Integration with Notion Sync

**File**: `packages/symbiont-cms/src/lib/server/page-processor.ts`

```typescript
// In processPageBatch() and processPageWebhook()
export async function processPageBatch(...) {
  const title = getTitle(page);
  const short_post_ID = getShortPostID(page);
  const mdString = await pageToMarkdown(page.id);
  
  // NEW: Process images in markdown
  const mdWithNhostImages = await processMarkdownImages(mdString, page.id);
  
  // Extract cover image if present (first image in content)
  const coverUrl = extractCoverImage(mdWithNhostImages);
  
  // Continue with existing logic...
  let slug: string;
  // ... rest of function
  
  // Pass coverUrl to upsert
  await upsertPost(page, config, title, short_post_ID, slug, mdWithNhostImages, coverUrl);
}
```

### Phase 3: Cover Image Extraction

```typescript
/**
 * Extract the first image from markdown as cover image
 * Respects explicit cover property from Notion if available
 */
function extractCoverImage(markdown: string): string | null {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/;
  const match = markdown.match(imageRegex);
  return match ? match[2] : null;
}
```

### Phase 4: Update GraphQL Mutation

**File**: `packages/symbiont-cms/src/lib/server/graphql.ts`

```typescript
// Add cover field to post insertion
export const UPSERT_POST_MUTATION = gql`
  mutation UpsertPost($post: posts_insert_input!) {
    insert_posts_one(
      object: $post
      on_conflict: {
        constraint: posts_source_id_notion_page_id_key
        update_columns: [
          title, 
          content, 
          slug, 
          publish_at, 
          tags, 
          updated_at, 
          notion_short_id,
          cover  # NEW
        ]
      }
    ) {
      id
    }
  }
`;
```

---

## Nhost Storage Setup

### Required Configuration

**File**: `nhost/nhost.toml`

```toml
[storage]
version = '0.6.1'

# Default bucket configuration
[[storage.buckets]]
id = "default"
publicRead = true
maxUploadFileSize = 10485760  # 10 MB

# Bucket for blog images
[[storage.buckets]]
id = "blog-images"
publicRead = true
maxUploadFileSize = 10485760
cacheControl = "public, max-age=31536000"  # 1 year cache
```

### Storage Permissions

Ensure proper permissions in Hasura for the `storage.files` table to allow:
- Public read access for images
- Admin/service write access for uploads during sync

---

## Frontend Display (Already Works!)

The existing QWER `ImgBanner` component already handles external URLs:

```svelte
<!-- From: packages/qwer-test/src/lib/components/image_banner.svelte -->
<script lang="ts">
  let asset: Asset.Image | undefined = $assets.get(src);
</script>

{#if asset}
  <!-- Build-time optimized image from $generated/assets -->
  <picture>...</picture>
{:else}
  <!-- Fallback: displays external URLs directly -->
  <img src={src} alt={alt} />
{/if}
```

**This means:** Once `post.cover` contains a Nhost Storage URL, it will display correctly without any frontend changes!

---

## Why Inline URLs Instead of Separate Image Metadata?

### ❌ Separate Metadata Table Approach (Not Recommended)

Some systems store image metadata separately:

```typescript
// posts table
{ content: "![cover](ref:image-1)" }

// post_images table
{ id: "image-1", url: "...", width: 1920, height: 1080 }
```

**Problems:**
- ❌ **Not portable**: References break if exported
- ❌ **Complex rendering**: Need joins or resolution step
- ❌ **Fragile**: Broken references if images deleted
- ❌ **Not standard**: Markdown parsers won't work

### ✅ Inline URLs with Size Hints (Recommended)

```markdown
![Alt text](https://nhost-url.com/image.jpg?w=1200&fm=webp =800x600)
```

**Benefits:**
- ✅ **Portable**: Markdown works anywhere (GitHub, editors, exports)
- ✅ **Simple**: No joins, no resolution, just render
- ✅ **Standards-compliant**: Works with any markdown parser
- ✅ **Self-contained**: All info in markdown source
- ✅ **Still queryable**: Can extract from markdown when needed

### When You Need Image Metadata

Nhost already tracks uploads in `storage.files`:
- File size, upload date, MIME type
- Can join with posts using regex on markdown content
- Or extract image URLs during feature detection at sync time

---

## Alternative Approaches (Considered but Not Recommended)

### Option 1: Keep External URLs
- Store AWS S3 URLs directly in database
- ❌ **Problem**: URLs expire after ~1 hour
- ❌ **Problem**: No control over optimization
- ⚠️ Only viable for non-Notion sources with permanent URLs

### Option 2: Proxy Through Server (Lazy Loading)
- Download images on-demand when first accessed
- Cache in Nhost Storage after first request
- ❌ **Problem**: Slow first load (download + upload)
- ❌ **Problem**: Complex caching logic
- ⚠️ Good for gradual migration but not ideal long-term

### Option 3: Separate Image Registry
- Store image references in markdown: `![alt](ref:image-1)`
- Resolve references from `post_images` table during rendering
- ❌ **Problem**: Not portable, breaks markdown ecosystem
- ❌ **Problem**: Adds complexity to rendering and exporting
- ⚠️ Only useful if you need heavy image management (DAM system)

---

## Performance Considerations

### Responsive Images

Generate responsive image URLs using Nhost transformations:

```typescript
// Example: Generate srcset for responsive images
const widths = [400, 800, 1200, 1600];
const srcset = widths
  .map(w => `${baseUrl}?w=${w}&fm=webp ${w}w`)
  .join(', ');

// In HTML:
<img 
  src="${baseUrl}?w=800&fm=webp"
  srcset="${srcset}"
  sizes="(max-width: 768px) 100vw, 50vw"
/>
```

### Modern Format Support

```html
<picture>
  <!-- AVIF for modern browsers (best compression) -->
  <source srcset="${baseUrl}?w=800&fm=avif" type="image/avif">
  
  <!-- WebP for most browsers -->
  <source srcset="${baseUrl}?w=800&fm=webp" type="image/webp">
  
  <!-- Fallback JPEG -->
  <img src="${baseUrl}?w=800" alt="...">
</picture>
```

---

## Migration Strategy

### For Existing Notion Content

1. Run initial sync with `wipe=true` to reprocess all posts
2. Images will be downloaded and migrated automatically
3. Old AWS S3 URLs in database will be replaced with Nhost URLs

### For New Tiptap Uploads

1. Configure Tiptap editor to upload directly to Nhost Storage
2. Store returned Nhost URL in markdown
3. No additional processing needed (already using Nhost)

### Monitoring

Track image processing in logs:
```typescript
console.log(`[symbiont] Processing ${imageCount} images for page ${pageId}`);
console.log(`[symbiont] Uploaded image: ${externalUrl} → ${nhostUrl}`);
```

---

## Future Enhancements

### Potential Additions (Not Implemented Yet)

1. **Image Deduplication**: Hash-based checking to avoid re-uploading identical images
2. **Lazy Loading**: Add `loading="lazy"` attributes automatically
3. **Blurhash Placeholders**: Generate low-quality image placeholders
4. **Alt Text Extraction**: Parse alt text from Notion image blocks
5. **Batch Upload**: Process multiple images in parallel for faster sync
6. **Cleanup Job**: Remove orphaned images from Nhost Storage

---

## Decision Log

**Date**: 2025-10-05  
**Decision**: Use Option 3 (Download During Sync) with Nhost Storage  
**Rationale**:
- Nhost Storage already integrated with Postgres
- Built-in CDN and optimization
- No external dependencies (Cloudinary, Vercel Image)
- Permanent URLs that don't expire
- Simple implementation path

**Deferred**: Image optimization utilities (`image.ts`, `OptimizedImage.svelte`)  
**Reason**: QWER's existing `ImgBanner` component already handles external URLs correctly. Additional optimization layer not needed until performance issues arise.

---

## Related Files

- `packages/symbiont-cms/src/lib/server/page-processor.ts` - Where image processing will be integrated
- `packages/symbiont-cms/src/lib/server/notion.ts` - Notion API interactions
- `packages/qwer-test/src/lib/components/image_banner.svelte` - Frontend image display
- `packages/qwer-test/src/lib/components/index_post.svelte` - Post card using `post.cover`
- `nhost/metadata/databases/default/tables/storage_files.yaml` - Storage schema

---

## References

- [Nhost Storage Documentation](https://docs.nhost.io/storage)
- [Nhost Image Transformation Guide](https://docs.nhost.io/storage/image-transformation)
- [QWER Theme - Image Processing](https://github.com/kwchang0831/svelte-QWER)

---

## Image Zoom / Lightbox Feature

Symbiont CMS includes built-in support for image zoom functionality using the lightweight `medium-zoom` library.

### How It Works

1. **Server-side**: The markdown processor uses `@mdit/plugin-figure` to wrap standalone images in semantic `<figure>` tags with captions
2. **Client-side**: Optional `medium-zoom` integration provides lightbox/zoom functionality
3. **Feature Detection**: `post.features.images` from the database tells the client when images are present

### Setup

#### 1. Install medium-zoom

```bash
pnpm add medium-zoom
```

#### 2. Basic Usage (Svelte)

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { initializeImageZoom } from 'symbiont-cms';
  import mediumZoom from 'medium-zoom';
  
  export let html: string;
  export let features;
  
  let containerElement: HTMLElement;
  
  onMount(() => {
    if (features.images) {
      const zoom = initializeImageZoom(mediumZoom, {
        container: containerElement,
        background: 'rgba(25, 18, 25, 0.9)',
      });
      
      return () => zoom.destroy();
    }
  });
</script>

<article bind:this={containerElement}>
  {@html html}
</article>
```

#### 3. Using Svelte Action (Even Simpler)

```svelte
<script lang="ts">
  import { imageZoom } from 'symbiont-cms';
  import mediumZoom from 'medium-zoom';
  
  export let html: string;
  export let features;
</script>

{#if features.images}
  <article use:imageZoom={{ mediumZoom }}>
    {@html html}
  </article>
{:else}
  <article>
    {@html html}
  </article>
{/if}
```

### Customization

Target only images within figures:

```typescript
initializeImageZoom(mediumZoom, {
  selector: 'figure img',
  container: containerElement,
});
```

Custom styling:

```typescript
initializeImageZoom(mediumZoom, {
  background: 'rgba(0, 0, 0, 0.95)',
  scrollOffset: 40,
});
```

### Size Impact

- **Server-side**: `@mdit/plugin-figure` (~9.5KB, included in symbiont-cms)
- **Client-side**: `medium-zoom` (~13KB minified+gzipped, installed separately)
- **Total**: Only ~13KB client-side when images are present

### Why This Approach?

✅ **Lightweight**: Only ~13KB of client-side JS  
✅ **Zero CSS**: `medium-zoom` creates overlays programmatically  
✅ **Semantic HTML**: Uses proper `<figure>` and `<figcaption>` tags  
✅ **Conditional Loading**: Only load when images are present  
✅ **Flexible**: Works with any image in markdown  

### Markdown Syntax

Any standalone image will automatically get the figure treatment:

```markdown
![Alt text](image.png)

![Alt text with title](image.png "This becomes the caption")

[![Linked image](image.png)](https://example.com)
```

---

## Related Documentation

- **[Symbiont CMS Complete Guide](symbiont-cms.md)** 📦 - Full system documentation
- **[Zero-Rebuild CMS Vision](zero-rebuild-cms-vision.md)** 🎯 - The complete architecture overview
- **[Dynamic File Management](dynamic-file-management.md)** - Broader file upload & storage strategy
- **[Integration Guide](INTEGRATION_GUIDE.md)** - How QWER + Symbiont work together
- **[Dynamic Redirects Strategy](dynamic-redirects-strategy.md)** - Database-driven redirects

---

**Status:** 📋 Strategy Documented (Image Zoom: ✅ Implemented, Image Size Hints: ✅ Implemented)  
**Priority:** ⚠️ High (Notion URLs expire after ~1 hour)  
**Last Updated:** October 8, 2025
