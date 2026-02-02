# Supabase Image Storage Strategy

**Date:** February 1, 2026  
**Status:** Implementation Plan  
**Context:** Upload images to Supabase Storage during Notion sync

---

## Goals

1.  **Upload all Notion-hosted images to Supabase Storage** (Notion URLs expire after ~1 hour)
2.  **Migrate existing Nhost-hosted images** during normal sync (no separate migration script)
3.  **Simple, sensible organization** by page ID
4.  **Preserve original filenames** when available

---

## File Organization

### Path Structure

```
media/
└── {page_id}/
    └── {filename}.{ext}
```

**Examples:**

```
media/
├── 6cc3888f-d9fa-4075-add9-b596e6fc44f3/
│   ├── cover.jpg
│   ├── diagram.png
│   └── screenshot-2026-01-15.webp
├── 8dd4999g-e0ga-5186-bee0-c707e7gd55g4/
│   ├── cover.png
│   └── a3f2b9c8d1e0.jpg  # Hash fallback when no filename available
```

### Filename Resolution

**Priority order:**
1. **Extract from Notion CDN URL** (has filename in path before query params)
2. **Use markdown alt text** if available (from `![alt text](url)`)
3. **Fall back to content hash** (first 12 chars of SHA-256)

**URL patterns:**
- **Notion CDN**: `https://prod-files-secure.s3.us-west-2.amazonaws.com/.../tech_sports_graphic.png?X-Amz-...`
- **Nhost**: `https://ygsdnfrbruuhtxczekur.supabase.co/storage/v1/object/public/...` (no filename)
- **Google**: `https://lh3.googleusercontent.com/...` (no filename)

```typescript
function resolveFilename(url: string, buffer: Buffer, altText?: string): string {
  // 1. Try to extract filename from Notion CDN URLs
  if (url.includes('prod-files-secure') || url.includes('s3.us-west-2.amazonaws.com')) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname; // e.g., /.../4423f3ce-.../tech_sports_graphic.png
      const segments = pathname.split('/');
      const lastSegment = segments[segments.length - 1];
      
      // Check if it looks like a real filename (has extension)
      if (lastSegment && /\.\w{2,4}$/.test(lastSegment)) {
        const sanitized = lastSegment
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .substring(0, 100); // Limit length
        return sanitized;
      }
    } catch {
      // URL parsing failed, continue to fallback
    }
  }
  
  // 2. Try to use alt text from markdown (if provided and looks reasonable)
  if (altText && altText.length > 0 && altText.length < 100) {
    const sanitized = altText
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9._-]/g, '')
      .substring(0, 80);
    
    if (sanitized.length > 3) { // Only use if we got something meaningful
      const ext = getExtensionFromUrl(url) || 'jpg';
      return `${sanitized}.${ext}`;
    }
  }
  
  // 3. Fall back to content hash
  const hash = crypto.createHash('sha256')
    .update(buffer)
    .digest('hex')
    .substring(0, 12);
  
  const ext = getExtensionFromUrl(url) || 'jpg';
  return `${hash}.${ext}`;
}

function getExtensionFromUrl(url: string): string {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\.(\w{2,4})(?:$|\?)/);
    return match ? match[1] : 'jpg';
  } catch {
    return 'jpg';
  }
}
```

**Example outputs:**
- Notion: `tech_sports_graphic.png`
- Nhost with alt "Team Photo": `team-photo.jpg`
- Google with no alt: `a3f2b9c8d1e0.jpg` (hash)

---

## Access Control

### Public Bucket (Recommended)

Make the `media` bucket public for **serving files**. This means:

*   ✅ Anyone with the URL can download/view images
*   ✅ No signed URLs needed
*   ❌ Cannot list bucket contents via public API (requires auth)
*   ❌ Cannot query `storage.objects` table publicly

**Security through obscurity:** Page IDs are UUIDs - practically impossible to guess. Images for unpublished posts won't have their URLs exposed anywhere.

```
-- Create public bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('media', 'media', true);
```

### No Metadata Needed

Since we're organizing by page ID in the path itself:

*   Don't need `page_ids` array in metadata
*   Don't need timestamps
*   Path structure provides all organization

---

## URL Detection

### Which URLs Need Migration?

```typescript
function needsUploadToSupabase(url: string): boolean {
  return url.includes('prod-files-secure') ||  // Notion CDN
         url.includes('googleusercontent') ||   // Google images
         url.includes('ygsdnfrbruuhtxczekur');  // Old Nhost instance
}
```

---

## Implementation

### Core Upload Function

```typescript
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export interface UploadImageOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
  pageId: string;
  altText?: string; // Optional alt text from markdown for filename
}

export interface UploadImageResult {
  originalUrl: string;
  newUrl: string;
  path: string;
  filename: string;
}

/**
 * Upload an image to Supabase Storage
 */
export async function uploadImageToSupabase(
  url: string,
  options: UploadImageOptions
): Promise<UploadImageResult> {
  const { supabaseUrl, serviceRoleKey, pageId, altText } = options;
  
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  
  // Download image
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download image: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  
  // Resolve filename (with optional alt text)
  const filename = resolveFilename(url, buffer, altText);
  const path = `${pageId}/${filename}`;
  
  // Get content type
  const contentType = response.headers.get('content-type') || `image/${getExtensionFromUrl(filename)}`;
  
  // Upload (upsert to handle re-syncs)
  const { error } = await supabase.storage
    .from('media')
    .upload(path, buffer, {
      contentType,
      cacheControl: '31536000', // 1 year
      upsert: true
    });
  
  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }
  
  // Get public URL
  const { data } = supabase.storage.from('media').getPublicUrl(path);
  
  return {
    originalUrl: url,
    newUrl: data.publicUrl,
    path,
    filename
  };
}

function resolveFilename(url: string, buffer: Buffer, altText?: string): string {
  // 1. Try to extract filename from Notion CDN URLs
  if (url.includes('prod-files-secure') || url.includes('s3.us-west-2.amazonaws.com')) {
    try {
      const urlObj = new URL(url);
      const pathname = urlObj.pathname;
      const segments = pathname.split('/');
      const lastSegment = segments[segments.length - 1];
      
      if (lastSegment && /\.\w{2,4}$/.test(lastSegment)) {
        const sanitized = lastSegment
          .replace(/[^a-zA-Z0-9._-]/g, '_')
          .substring(0, 100);
        return sanitized;
      }
    } catch {
      // URL parsing failed, continue to fallback
    }
  }
  
  // 2. Try to use alt text from markdown
  if (altText && altText.length > 0 && altText.length < 100) {
    const sanitized = altText
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9._-]/g, '')
      .substring(0, 80);
    
    if (sanitized.length > 3) {
      const ext = getExtensionFromUrl(url) || 'jpg';
      return `${sanitized}.${ext}`;
    }
  }
  
  // 3. Fall back to content hash
  const hash = crypto.createHash('sha256')
    .update(buffer)
    .digest('hex')
    .substring(0, 12);
  
  const ext = getExtensionFromUrl(url) || 'jpg';
  return `${hash}.${ext}`;
}

function getExtensionFromUrl(urlOrFilename: string): string {
  try {
    const urlObj = new URL(urlOrFilename);
    const pathname = urlObj.pathname;
    const match = pathname.match(/\.(\w{2,4})(?:$|\?)/);
    return match ? match[1] : 'jpg';
  } catch {
    // Not a URL, treat as filename
    const match = urlOrFilename.match(/\.(\w{2,4})$/);
    return match ? match[1] : 'jpg';
  }
}
```

### Integration with Sync

During sync, process images in content and cover:

```typescript
// In post-builder.ts or wherever content is processed

import { uploadImageToSupabase, needsUploadToSupabase } from './image-upload.js';

async function processContent(
  content: string,
  pageId: string,
  config: { supabaseUrl: string; serviceRoleKey: string }
): Promise<string> {
  // Find all image URLs in markdown (capture alt text)
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  let result = content;
  let match;
  
  while ((match = imageRegex.exec(content)) !== null) {
    const [fullMatch, alt, url] = match;
    
    if (needsUploadToSupabase(url)) {
      try {
        const uploaded = await uploadImageToSupabase(url, {
          pageId,
          supabaseUrl: config.supabaseUrl,
          serviceRoleKey: config.serviceRoleKey,
          altText: alt // Pass alt text for filename resolution
        });
        
        result = result.replace(fullMatch, `![${alt}](${uploaded.newUrl})`);
        console.log(`✓ Uploaded: ${uploaded.filename}`);
      } catch (error) {
        console.warn(`✗ Failed to upload image: ${url}`, error);
        // Keep original URL on failure
      }
    }
  }
  
  return result;
}

async function processCoverImage(
  coverUrl: string | null,
  pageId: string,
  config: { supabaseUrl: string; serviceRoleKey: string }
): Promise<string | null> {
  if (!coverUrl || !needsUploadToSupabase(coverUrl)) {
    return coverUrl;
  }
  
  try {
    const uploaded = await uploadImageToSupabase(coverUrl, {
      pageId,
      supabaseUrl: config.supabaseUrl,
      serviceRoleKey: config.serviceRoleKey
    });
    
    console.log(`✓ Uploaded cover: ${uploaded.filename}`);
    return uploaded.newUrl;
  } catch (error) {
    console.warn(`✗ Failed to upload cover image: ${coverUrl}`, error);
    return coverUrl;
  }
}
```

---

## Image Transformations (Pro Plan Only)

Image transformations require Supabase Pro plan. On free tier, use original images.

```typescript
/**
 * Get image URL with optional transformations
 * Falls back to original URL on free tier
 */
export function getImageUrl(
  supabase: any,
  path: string,
  transform?: {
    width?: number;
    height?: number;
    quality?: number;
    resize?: 'cover' | 'contain' | 'fill';
  }
): string {
  if (transform) {
    const { data } = supabase.storage
      .from('media')
      .getPublicUrl(path, { transform });
    
    return data.publicUrl;
  }
  
  const { data } = supabase.storage.from('media').getPublicUrl(path);
  return data.publicUrl;
}
```

**Note:** On free tier, transformation URLs still work but return the original image (no error thrown).

---

## Bucket Setup

**Via Supabase Dashboard:**

*   Storage > New Bucket
*   Name: `media`
*   Public: Yes
*   File size limit: 50MB
*   Allowed MIME types: `image/*`

**Via SQL:**

```
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('media', 'media', true, 52428800, ARRAY['image/*']);
```

---

## Migration During Sync

No separate migration script needed. When a post is synced:

1.  If content/cover contains Notion/Nhost/Google URLs → upload to Supabase
2.  Replace URLs in content/meta before saving to database
3.  Next sync of same post: URLs already point to Supabase, no re-upload needed

This means:

*   **Full re-sync** will migrate all images
*   **Incremental sync** only processes changed posts
*   No need to track "migrated" state

---

## Implementation Checklist

1.  ⬜ Create `media` bucket in Supabase Storage
2.  ⬜ Create `uploadImageToSupabase()` function
3.  ⬜ Create `needsUploadToSupabase()` URL detection
4.  ⬜ Integrate image processing into post-builder
5.  ⬜ Add `getImageUrl()` helper for transformations
6.  ⬜ Test with california-tech sync
7.  ⬜ (Future) Enable image transformations on Pro plan

---

## Summary

*   **Structure**: `media/{page_id}/{filename}.ext`
*   **Filenames**: Original when available, hash fallback
*   **Access**: Public bucket (URLs secret via UUID page IDs)
*   **Migration**: Happens during normal sync, no separate script
*   **No metadata tracking**: Path structure provides organization
*   **Transformations**: Ready for Pro plan, graceful on free tier