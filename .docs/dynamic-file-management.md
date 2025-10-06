# Dynamic File Management Strategy

> **📖 Part of the Zero-Rebuild CMS Vision** - See `.docs/zero-rebuild-cms-vision.md` for the complete architecture

## Vision

Transition from build-time static assets to fully dynamic file management where:

---

## The Problem with Static Assets

**Current QWER Approach:**
- Files in `user/assets/` → Copied to `static/` at build time
- Images optimized by `vite-imagetools` during build
- **Problem**: Adding new files requires rebuild & redeploy
- **Problem**: Can't dynamically manage files from CMS

**Limitations:**
- No file uploads from Notion (5MB limit anyway)
- No file uploads from Tiptap editor
- No dynamic file management
- Tightly coupled to build process

---

## Dynamic Asset Strategy

### Architecture

```
┌─────────────────┐
│  Upload Sources │
├─────────────────┤
│ • Notion Sync   │──┐
│ • Tiptap Editor │──┼──> Nhost Storage ──> CDN URLs
│ • Admin Panel   │──┘       │
└─────────────────┘          ├──> Postgres Metadata
                             └──> Public URLs (no rebuild!)
```

### Key Benefits

✅ **No Rebuilds**: Upload files anytime, available immediately  
✅ **Large Files**: Beyond Notion's 5MB limit  
✅ **Centralized**: One storage location for all assets  
✅ **Metadata**: Track file info in Postgres  
✅ **Permissions**: Control access per file/bucket  
✅ **CDN**: Automatic global distribution

---

## Implementation

### 1. Nhost Storage Buckets

**File**: `nhost/nhost.toml`

```toml
[storage]
version = '0.6.1'

# Blog post images (public)
[[storage.buckets]]
id = "blog-images"
publicRead = true
maxUploadFileSize = 10485760  # 10 MB
cacheControl = "public, max-age=31536000"

# Downloadable files (public)
[[storage.buckets]]
id = "blog-files"
publicRead = true
maxUploadFileSize = 52428800  # 50 MB
cacheControl = "public, max-age=31536000"

# Private uploads (authenticated only)
[[storage.buckets]]
id = "private-files"
publicRead = false
maxUploadFileSize = 104857600  # 100 MB
```

### 2. File Upload Utility

**File**: `packages/symbiont-cms/src/lib/server/file-upload.ts`

```typescript
import { NhostClient } from '@nhost/nhost-js';

const nhost = new NhostClient({
  subdomain: process.env.NHOST_SUBDOMAIN!,
  region: process.env.NHOST_REGION!,
});

/**
 * Upload file to Nhost Storage
 */
export async function uploadFile(
  file: File | Buffer,
  options: {
    bucket: 'blog-images' | 'blog-files' | 'private-files';
    filename: string;
    metadata?: Record<string, any>;
  }
): Promise<{ id: string; url: string }> {
  
  const { fileMetadata, error } = await nhost.storage.upload({
    file,
    bucketId: options.bucket,
    name: options.filename,
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  return {
    id: fileMetadata.id,
    url: nhost.storage.getPublicUrl({ fileId: fileMetadata.id }),
  };
}

/**
 * Download file from external URL and upload to Nhost
 */
export async function mirrorExternalFile(
  externalUrl: string,
  options: {
    bucket: 'blog-images' | 'blog-files';
    filename?: string;
  }
): Promise<{ id: string; url: string }> {
  
  // Download from external source
  const response = await fetch(externalUrl);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }
  
  const blob = await response.blob();
  const buffer = Buffer.from(await blob.arrayBuffer());
  
  // Generate filename if not provided
  const filename = options.filename || extractFilenameFromUrl(externalUrl);
  
  return uploadFile(buffer, {
    bucket: options.bucket,
    filename,
  });
}

function extractFilenameFromUrl(url: string): string {
  const urlObj = new URL(url);
  const pathname = urlObj.pathname;
  return pathname.split('/').pop() || `file-${Date.now()}`;
}
```

### 3. Track Files in Database

**File**: `nhost/migrations/default/[timestamp]_create_blog_files.sql`

```sql
CREATE TABLE public.blog_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_file_id uuid NOT NULL REFERENCES storage.files(id) ON DELETE CASCADE,
  
  -- File info
  filename text NOT NULL,
  original_url text,  -- External URL before migration
  file_type text,     -- 'image', 'pdf', 'document', etc.
  file_size bigint,
  mime_type text,
  
  -- Context
  uploaded_by uuid REFERENCES auth.users(id),
  related_post_id uuid REFERENCES posts(id),
  
  -- Metadata
  description text,
  alt_text text,  -- For images
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for lookups
CREATE INDEX idx_blog_files_storage_id ON public.blog_files(storage_file_id);
CREATE INDEX idx_blog_files_post_id ON public.blog_files(related_post_id);
CREATE INDEX idx_blog_files_type ON public.blog_files(file_type);

-- Permissions (adjust as needed)
ALTER TABLE public.blog_files ENABLE ROW LEVEL SECURITY;

-- Public read access
CREATE POLICY "Blog files are publicly readable"
  ON public.blog_files FOR SELECT
  USING (true);

-- Admin write access
CREATE POLICY "Admins can manage blog files"
  ON public.blog_files FOR ALL
  USING (auth.role() = 'admin');
```

---

## Use Cases

### Use Case 1: Notion Image Migration

```typescript
// During Notion sync
import { mirrorExternalFile } from './file-upload';

async function processNotionImage(notionImageUrl: string, postId: string) {
  // Download from Notion AWS S3, upload to Nhost
  const { id, url } = await mirrorExternalFile(notionImageUrl, {
    bucket: 'blog-images',
    filename: `post-${postId}-${Date.now()}.jpg`,
  });
  
  // Track in database
  await gqlClient.request(gql`
    mutation InsertBlogFile($file: blog_files_insert_input!) {
      insert_blog_files_one(object: $file) { id }
    }
  `, {
    file: {
      storage_file_id: id,
      original_url: notionImageUrl,
      file_type: 'image',
      related_post_id: postId,
    }
  });
  
  return url;  // Nhost Storage URL
}
```

### Use Case 2: Tiptap Direct Upload

```typescript
// In Tiptap editor configuration
import { uploadFile } from 'symbiont-cms/server';

// Configure image upload handler
const editor = new Editor({
  extensions: [
    Image.configure({
      uploadFn: async (file) => {
        // Upload directly to Nhost Storage
        const { url } = await uploadFile(file, {
          bucket: 'blog-images',
          filename: `editor-${Date.now()}-${file.name}`,
        });
        return url;  // Return Nhost URL to insert in markdown
      },
    }),
  ],
});
```

### Use Case 3: Large File Downloads

```markdown
<!-- In your blog post markdown -->
Download the PDF: [Research Paper](https://[subdomain].storage.[region].nhost.run/v1/files/abc123)

<!-- Or use a custom component -->
<FileDownload 
  fileId="abc123" 
  filename="research-paper.pdf" 
  size="25 MB"
/>
```

---

## Image URL Migration Strategy

### The Image Reference Problem

**You're right to be concerned!** When you migrate an image from Notion AWS S3 to Nhost Storage:

```
Before: ![diagram](https://s3.aws.notion.com/image123.jpg)
After:  ![diagram](https://yourapp.nhost.run/v1/files/xyz789)
```

**Should you sync the URL back to Notion?**

### Recommendation: Track Both URLs

```typescript
// Store mapping in blog_files table
{
  storage_file_id: 'xyz789',           // New Nhost ID
  original_url: 'https://s3.aws...',   // Original Notion URL
  related_post_id: 'post-uuid',
}

// In posts table
{
  content: '![diagram](https://yourapp.nhost.run/...)',  // Nhost URLs
  notion_original_content: '![diagram](https://s3.aws...)', // Backup
}
```

**Benefits:**
- Keep original URLs for reference
- Can reverse migration if needed
- No need to write back to Notion (unless switching source of truth)

### Source of Truth Considerations

| Scenario | Strategy |
|----------|----------|
| **DB is source of truth** | Don't sync URLs back to Notion. Notion is just an input. |
| **Notion is source of truth** | Must sync URLs back. Otherwise Notion has broken links. |
| **Hybrid (your approach)** | Track both. Sync back only if editing in Notion matters. |

**My Recommendation for Your Hybrid Model:**
1. On sync: Replace URLs in DB with Nhost URLs
2. Store mapping in `blog_files` table
3. DON'T sync back to Notion automatically
4. If you edit in Notion later, images still work (Notion keeps its S3 URLs)
5. On next sync, detect if Notion content changed, re-migrate images if needed

---

## Large File Handling (>5MB)

### Problem: Notion's 5MB Upload Limit

**Solution: Bypass Notion for Large Files**

```typescript
// Option 1: Upload directly via Tiptap editor
// (Already uploads to Nhost, no Notion limitation)

// Option 2: Admin upload interface
// Create a simple file upload page:
// /admin/files/upload → Nhost Storage → Generate markdown link

// Option 3: External link
// Host file elsewhere (GitHub Releases, Dropbox, etc.)
// Include external URL directly in markdown
```

### Workflow for Large Files

```
1. Upload large file to Nhost Storage via admin panel
   ↓
2. Get Nhost Storage URL
   ↓
3. Insert markdown link in Notion: [Download](https://nhost.run/v1/files/abc)
   ↓
4. Sync from Notion → URL already points to Nhost (no migration needed!)
```

---

## Static Assets Migration Plan

### Phase 1: Coexist (Current State)

```
Static Assets (user/assets/) ──> Build ──> _app/immutable/assets/
                                             ↓
Dynamic Assets (Nhost Storage) ────────────> Direct URLs
```

**Both work simultaneously!**
- Existing static assets keep working
- New uploads go to Nhost Storage
- Gradually migrate critical static assets

### Phase 2: Hybrid Database

```sql
-- Track both static and dynamic assets
CREATE TABLE public.site_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Asset info
  name text NOT NULL,          -- 'avatar', 'logo', 'og-image'
  asset_type text NOT NULL,    -- 'image', 'icon', 'file'
  
  -- Location (one of these)
  static_path text,            -- '/avatar.png' (build-time)
  storage_file_id uuid,        -- Nhost Storage ID (dynamic)
  external_url text,           -- Third-party CDN
  
  -- Metadata
  description text,
  dimensions jsonb,            -- { width: 800, height: 600 }
  
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
```

### Phase 3: Full Dynamic (Future)

- Remove `user/assets/` folder
- All assets in Nhost Storage
- Site config loads from database
- True zero-rebuild CMS

---

## Benefits Summary

| Aspect | Static Build | Dynamic Storage |
|--------|--------------|-----------------|
| **Add File** | Rebuild + Deploy | Upload + Instant |
| **Update File** | Rebuild + Deploy | Replace + Instant |
| **Large Files** | Bundle bloat | No limit |
| **CDN** | Build-time | Runtime |
| **Metadata** | Hardcoded | Database |
| **Permissions** | Public only | Granular control |

---

## Implementation Priority

### Do Now (Immediate Need)
- ✅ Image migration during Notion sync
- ✅ Track file metadata in `blog_files` table
- ✅ Configure Nhost Storage buckets

### Do Soon (When Tiptap Editor Built)
- ⏳ Tiptap file upload integration
- ⏳ File management admin panel
- ⏳ Large file upload workflow

### Do Later (Nice to Have)
- 🔮 Migrate all static assets to Nhost
- 🔮 Dynamic site config from database
- 🔮 File deduplication & optimization
- 🔮 Usage analytics per file

---

## Related Documentation

- **[Symbiont CMS Complete Guide](symbiont-cms.md)** 📦 - Full system documentation
- **[Zero-Rebuild CMS Vision](zero-rebuild-cms-vision.md)** 🎯 - The complete architecture overview
- **[Image Optimization Strategy](image-optimization-strategy.md)** - Specific image handling details
- **[Dynamic Redirects Strategy](dynamic-redirects-strategy.md)** - Database-driven redirects
- **[Integration Guide](INTEGRATION_GUIDE.md)** - How QWER + Symbiont work together

---

**Status:** 📋 Strategy Documented (Not Yet Implemented)  
**Phase 1 Priority:** ⚠️ High (Notion image migration)  
**Last Updated:** October 5, 2025
