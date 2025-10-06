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

## Implementation Plan

### Phase 1: Core Infrastructure

**File**: `packages/symbiont-cms/src/lib/server/image-processor.ts`

```typescript
/**
 * Process markdown content and migrate images to Nhost Storage
 * 
 * @param markdown - Original markdown content with external image URLs
 * @param notionPageId - Notion page ID for organizing uploads
 * @returns Markdown with Nhost Storage URLs
 */
export async function processMarkdownImages(
  markdown: string,
  notionPageId: string
): Promise<string> {
  // 1. Extract all image URLs from markdown
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images = [...markdown.matchAll(imageRegex)];
  
  // 2. Download and upload each image
  for (const [fullMatch, alt, url] of images) {
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

## Related Documentation

- **[Symbiont CMS Complete Guide](symbiont-cms.md)** 📦 - Full system documentation
- **[Zero-Rebuild CMS Vision](zero-rebuild-cms-vision.md)** 🎯 - The complete architecture overview
- **[Dynamic File Management](dynamic-file-management.md)** - Broader file upload & storage strategy
- **[Integration Guide](INTEGRATION_GUIDE.md)** - How QWER + Symbiont work together
- **[Dynamic Redirects Strategy](dynamic-redirects-strategy.md)** - Database-driven redirects

---

**Status:** 📋 Strategy Documented (Not Yet Implemented)  
**Priority:** ⚠️ High (Notion URLs expire after ~1 hour)  
**Last Updated:** October 5, 2025
