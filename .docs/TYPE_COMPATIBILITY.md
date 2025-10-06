# Type Compatibility: QWER + Symbiont Integration

> **📖 Part of the Zero-Rebuild CMS Vision** - See `.docs/zero-rebuild-cms-vision.md` for the complete architecture

## Overview
Enhanced type compatibility between QWER's `Post.Post` type and Symbiont's `Post` type to enable seamless data transformation and reduce mapping complexity.

This type system enables the hybrid approach described in the Zero-Rebuild CMS vision, allowing static and dynamic content to coexist during the transition.

---

## Changes Made

### 1. **Symbiont Post Type Extended** (`packages/symbiont-cms/src/lib/types.ts`)

**Before:**
```typescript
export type Post = {
    id: string;
    title: string;
    slug: string;
    content: string | null;
    publish_at: string | null;
    tags?: string[] | null;
    [key: string]: any;
};
```

**After:**
```typescript
export type Post = {
    id: string;
    title: string | null;        // ✨ Now nullable for consistency
    slug: string;
    content: string | null;
    publish_at: string | null;
    updated_at?: string | null;  // ✨ Added for QWER compatibility
    tags?: string[] | any[] | null;  // ✨ More flexible tag types
    
    // Optional QWER-compatible fields
    summary?: string;            // ✨ Added
    description?: string;        // ✨ Added
    language?: string;           // ✨ Added
    cover?: string;              // ✨ Added
    
    [key: string]: any;
};
```

### 2. **Fixed QWER Post Transformation** (`packages/qwer-test/src/routes/+page.server.ts`)

**Issue:** `coverStyle: 0` was causing type error
```typescript
// ❌ Before
coverStyle: 0  // Type 'number' is not assignable to type 'CoverStyle'
```

**Solution:** Use enum value
```typescript
// ✅ After
import { Post } from '$lib/types/post';  // Import as value, not type

coverStyle: Post.CoverStyle.NONE
```

### 3. **Fixed [slug] Page Component** (`packages/qwer-test/src/routes/[slug]/+page.svelte`)

**Issue:** Invalid closing tag structure with slots
```svelte
<!-- ❌ Before -->
<BlogPostPage>
  <svelte:fragment slot="before">
    <article>
  </svelte:fragment>
  <svelte:fragment slot="after">
    </article>  <!-- Invalid! -->
  </svelte:fragment>
</BlogPostPage>
```

**Solution:** Simplified structure
```svelte
<!-- ✅ After -->
<div class="max-w-4xl mx-auto px-4 py-8">
  <BlogPostPage 
    post={data.post} 
    {formatDate}
    classMap={{ ... }}
  />
</div>
```

---

## Type Mapping Strategy

### Minimal Transformation Approach

With the enhanced Symbiont `Post` type, the transformation from database → QWER is more straightforward:

```typescript
// Symbiont Post (from database)
{
  id: "uuid-123",
  title: "My Post",
  slug: "my-post",
  content: "# Hello",
  publish_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-02T00:00:00Z",
  tags: ["tech", "blog"]
}

// ↓ Transform to QWER Post.Post

// QWER Post
{
  slug: "my-post",
  title: "My Post",
  content: "# Hello",
  published: "2024-01-01T00:00:00Z",
  updated: "2024-01-02T00:00:00Z",
  tags: ["tech", "blog"],
  // ... QWER-specific UI fields
  coverStyle: Post.CoverStyle.NONE,
  language: 'en',
  // etc.
}
```

### Optional Fields for Future Enhancement

The extended Symbiont type now supports optional fields that can be populated directly from the database:

- `summary` - Post excerpt/summary
- `description` - SEO description
- `language` - Content language code
- `cover` - Cover image URL

**Example GraphQL Query Enhancement:**
```graphql
query GetAllPosts {
  posts {
    id
    title
    slug
    content
    publish_at
    updated_at
    tags
    summary      # ✨ Can add to schema
    description  # ✨ Can add to schema
    language     # ✨ Can add to schema
    cover        # ✨ Can add to schema
  }
}
```

---

## Benefits

### ✅ **Type Safety**
- No more `any` types in transformations
- Compile-time checks for field access
- Better IDE autocomplete

### ✅ **Reduced Mapping**
- Fewer fields need transformation
- More direct pass-through of data
- Less code to maintain

### ✅ **Future-Proof**
- Easy to add new fields to both systems
- Graceful handling of optional fields
- Extensible with `[key: string]: any`

### ✅ **Developer Experience**
- Clear type definitions
- Self-documenting code
- Easier to onboard new developers

---

## Migration Path (Optional)

If you want to fully align the types in the future:

### 1. **Add Fields to Database Schema**
```sql
ALTER TABLE posts ADD COLUMN summary TEXT;
ALTER TABLE posts ADD COLUMN description TEXT;
ALTER TABLE posts ADD COLUMN language VARCHAR(10) DEFAULT 'en';
ALTER TABLE posts ADD COLUMN cover TEXT;
```

### 2. **Update Notion Sync to Extract These Fields**
```typescript
// In page-processor.ts
const summary = extractSummary(page);
const description = extractDescription(page);
const language = extractLanguage(page);
const cover = extractCoverImage(page);
```

### 3. **Update GraphQL Queries**
```typescript
export const GET_ALL_POSTS = gql`
  query GetAllPosts {
    posts {
      id
      title
      slug
      content
      publish_at
      updated_at
      tags
      summary
      description
      language
      cover
    }
  }
`;
```

### 4. **Simplify Transformation**
```typescript
// Much simpler transformation!
const qwerPosts: Post.Post[] = postsFromDb.map((post) => ({
  ...post,  // Most fields pass through!
  published: post.publish_at ?? new Date().toISOString(),
  updated: post.updated_at ?? post.publish_at ?? new Date().toISOString(),
  coverStyle: Post.CoverStyle.NONE,
  // Only QWER-specific UI fields need mapping
}));
```

---

## Type Reference

### QWER Post Type
```typescript
namespace Post {
  export type Post = {
    slug: string;
    title: string;
    language: string;
    description: string;
    summary?: string;
    content?: string;
    html?: string;
    published: string;
    updated: string;
    created: string;
    cover?: string;
    coverInPost?: boolean;
    coverCaption?: string;
    coverStyle: CoverStyle;
    options?: Array<string>;
    series_tag?: string;
    series_title?: string;
    prev?: string;
    next?: string;
    toc?: TOC.Heading[];
    tags?: Array<any>;
  };
  
  export enum CoverStyle {
    TOP = 'TOP',
    RIGHT = 'RIGHT',
    BOT = 'BOT',
    LEFT = 'LEFT',
    IN = 'IN',
    NONE = 'NONE',
  }
}
```

### Symbiont Post Type (Extended)
```typescript
export type Post = {
    id: string;
    title: string | null;
    slug: string;
    content: string | null;
    publish_at: string | null;
    updated_at?: string | null;
    tags?: string[] | any[] | null;
    summary?: string;
    description?: string;
    language?: string;
    cover?: string;
    [key: string]: any;
};
```

---

## Checklist

- [x] Extended Symbiont `Post` type with QWER-compatible fields
- [x] Fixed `coverStyle` enum usage
- [x] Fixed [slug] page component structure
- [x] Removed unused CSS
- [x] Rebuilt symbiont-cms package
- [x] All TypeScript errors resolved
- [ ] (Optional) Add new fields to database schema
- [ ] (Optional) Update Notion sync to extract metadata
- [ ] (Optional) Simplify transformation logic

---

## Related Documentation

- **📦 [Symbiont CMS Complete Guide](symbiont-cms.md)** - Full system documentation
- **🎯 [Zero-Rebuild CMS Vision](zero-rebuild-cms-vision.md)** - Architecture overview
- **[Integration Guide](INTEGRATION_GUIDE.md)** - How QWER + Symbiont work together
- **[Image Optimization Strategy](image-optimization-strategy.md)** - Handling media files

---

**Status:** ✅ Type Compatibility Implemented
**Build Status:** ✅ All Packages Building Successfully
**TypeScript Errors:** ✅ None
**Last Updated:** October 5, 2025
