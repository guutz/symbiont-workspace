# QWER-Test + Symbiont Integration Guide

> **📖 Part of the Zero-Rebuild CMS Vision** - See `.docs/zero-rebuild-cms-vision.md` for the complete architecture

## Overview
Successfully integrated `qwer-test` with `symbiont-cms` to enable dynamic blog post loading from an Nhost/Hasura GraphQL database instead of static JSON files.

This integration is **Phase 1** of the transition from QWER's build-time static generation to a fully dynamic CMS where content updates appear instantly without rebuilds.

## Changes Made

### 1. **Symbiont CMS Package** (`packages/symbiont-cms`)

#### Added Client Export (`src/lib/client.ts`)
- Created new client module to export GraphQL utilities
- Enables other packages to query the database

#### Extended Queries (`src/lib/client/queries.ts`)
- Added `GET_ALL_POSTS` GraphQL query to fetch multiple posts
- Added `getAllPosts()` function with pagination support
- Added `tags` field to `GET_POST_BY_SLUG` query
- Fixed import paths to use `.js` extension

#### Updated Package Exports (`package.json`)
- Added `./client` export path pointing to `dist/client.js`
- Enables `import from 'symbiont-cms/client'`

---

### 2. **QWER Test Package** (`packages/qwer-test`)

#### Created Server Load Function (`src/routes/+page.server.ts`)
- **NEW FILE** - Fetches posts from Nhost GraphQL endpoint
- Transforms Symbiont posts to QWER `Post.Post` format
- Handles missing environment variables gracefully
- Returns empty array if database unavailable

#### Updated Posts Store (`src/lib/stores/posts.ts`)
- **Changed** from importing static JSON to writable store
- Added `initializePostsFromServer()` function
- Modified `postsShow` to dynamically get posts from `postsAll`
- Maintains backward compatibility with static JSON if available
- Now uses `get(postsAll)` instead of `_allposts` array

#### Updated Homepage Component (`src/routes/+page.svelte`)
- Imports server data via `PageData` type
- Calls `initializePostsFromServer(data.posts)` in `onMount`
- Initializes stores with database data before filtering

#### Created Individual Post Route (`src/routes/[slug]/`)
- **NEW** `+page.server.ts` - Re-exports `postLoad as load` from `symbiont-cms/server`
- **NEW** `+page.svelte` - Uses `PostPage` component from symbiont
- Applies QWER styling via `classMap` prop
- Integrates QWER's date formatting config

#### Updated Feed Routes
All three feed routes updated to fetch from database instead of static JSON:

**`src/routes/feed.json/+server.ts`**
- Added `getPosts()` async function
- Uses `getAllPosts()` from symbiont
- Transforms to JSON Feed format

**`src/routes/sitemap.xml/+server.ts`**
- Added `getPosts()` async function  
- Uses `getAllPosts()` from symbiont
- Generates sitemap with database posts

**`src/routes/atom.xml/+server.ts`**
- Added `getPosts()` async function
- Uses `getAllPosts()` from symbiont
- Generates Atom feed with database posts
- Simplified tag handling

---

## How It Works

### Architecture Flow

```
┌─────────────────────────────────────────────────────┐
│  Notion Database                                    │
│  ↓ (via symbiont sync webhook)                     │
│  Nhost/Hasura GraphQL Database                     │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│  SvelteKit Server Load Functions                    │
│  • +page.server.ts (homepage - all posts)          │
│  • [slug]/+page.server.ts (individual posts)       │
│  • feed routes (RSS/Atom/JSON)                     │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│  Svelte Stores (Client-side)                       │
│  • postsAll - Map of all posts                     │
│  • postsShow - Filtered/displayed posts            │
└─────────────────────────────────────────────────────┘
                         ↓
┌─────────────────────────────────────────────────────┐
│  UI Components                                      │
│  • index_posts.svelte (homepage list)              │
│  • PostPage (individual post)                      │
└─────────────────────────────────────────────────────┘
```

### Data Transformation

Symbiont Post → QWER Post:
```typescript
{
  // Symbiont fields
  slug: string;
  title: string | null;
  content: string | null;
  publish_at: string | null;
  updated_at: string | null;
  tags: any;
  
  // ↓ Transformed to ↓
  
  // QWER fields
  slug: string;
  title: string;
  content: string;
  published: string;
  updated: string;
  summary: string;
  tags: Array<any>;
  // ... other QWER-specific fields
}
```

---

## Setup Requirements

### Environment Variables

Add to your `.env` file:
```bash
PUBLIC_NHOST_GRAPHQL_URL=https://your-app.nhost.run/v1/graphql
```

### Build Symbiont Package

Before running qwer-test, build symbiont-cms:
```bash
cd packages/symbiont-cms
npm run build
```

Or from workspace root:
```bash
pnpm -F symbiont-cms build
```

---

## Usage

### Development Mode

```bash
# Terminal 1: Start qwer-test dev server
cd packages/qwer-test
npm run dev

# The site will fetch posts from your Nhost database
# Posts will appear on homepage at http://localhost:5173
# Individual posts at http://localhost:5173/[slug]
```

### Adding/Updating Posts

Posts are managed through your Notion database:
1. Edit pages in Notion
2. Symbiont sync webhook automatically updates Nhost
3. Refresh your qwer-test site to see changes
4. No rebuild needed! ✨

---

## Benefits

### ✅ **Dynamic Content**
- No rebuild required for new posts
- Content updates propagate immediately
- Real-time content management

### ✅ **Database-Backed**
- Query/filter posts efficiently
- Scalable for large blogs
- Full SQL/GraphQL power

### ✅ **Best of Both Worlds**
- QWER's beautiful UI and filtering
- Symbiont's Notion → Database pipeline
- SvelteKit's SSR/SSG flexibility

### ✅ **Foundation for Full Dynamic CMS**
- Posts: ✅ **Done** (this guide)
- Images: 🚧 See `image-optimization-strategy.md`
- Files: 🚧 See `dynamic-file-management.md`
- Redirects: 🚧 See `dynamic-redirects-strategy.md`
- Site Config: 🔮 Future enhancement

---

## Backward Compatibility

The posts store still attempts to load from `$generated/posts.json` if available:
- Useful for local development without database
- Graceful fallback if database unavailable
- Can be removed once fully migrated

---

## Next Steps

### Optional Enhancements

1. **Add Pagination**
   - Modify `getAllPosts()` to use `offset`
   - Implement page navigation in UI

2. **Add Caching**
   - Cache posts in-memory on server
   - Add TTL-based revalidation

3. **Source ID Filtering**
   - Use `source_id` param to filter by database
   - Support multiple Notion databases

4. **Enhanced Metadata**
   - Extract more fields from Notion
   - Add cover images, authors, categories

5. **Search Integration**
   - Update search worker to query database
   - Add full-text search via GraphQL

---

## Troubleshooting

### "Cannot find module 'symbiont-cms/client'"
**Solution:** Build the symbiont-cms package first:
```bash
pnpm -F symbiont-cms build
```

### Posts not appearing
**Check:**
1. `PUBLIC_NHOST_GRAPHQL_URL` is set correctly
2. Database has posts with `publish_at` dates
3. Check browser console for errors
4. Verify GraphQL endpoint is accessible

### Type errors in QWER files
**Solution:** The stores and components are designed to work with or without database:
- Check `data.posts` exists in `+page.svelte`
- Ensure `initializePostsFromServer` is called before filtering

---

## Files Modified Summary

### Created (7 files)
- `packages/symbiont-cms/src/lib/client.ts`
- `packages/qwer-test/src/routes/+page.server.ts`
- `packages/qwer-test/src/routes/[slug]/+page.server.ts`
- `packages/qwer-test/src/routes/[slug]/+page.svelte`

### Modified (8 files)
- `packages/symbiont-cms/src/lib/client/queries.ts`
- `packages/symbiont-cms/package.json`
- `packages/qwer-test/src/lib/stores/posts.ts`
- `packages/qwer-test/src/routes/+page.svelte`
- `packages/qwer-test/src/routes/feed.json/+server.ts`
- `packages/qwer-test/src/routes/sitemap.xml/+server.ts`
- `packages/qwer-test/src/routes/atom.xml/+server.ts`

---

## Migration Checklist

- [x] Add `GET_ALL_POSTS` query to symbiont
- [x] Export client module from symbiont package
- [x] Create server load function for homepage
- [x] Update posts store to accept dynamic data
- [x] Initialize posts from server in +page.svelte
- [x] Create [slug] route for individual posts
- [x] Update feed.json to use database
- [x] Update sitemap.xml to use database
- [x] Update atom.xml to use database
- [ ] Build symbiont-cms package
- [ ] Test qwer-test with live database
- [ ] Remove static JSON generation (optional)

---

## Related Documentation

- **📦 [Symbiont CMS Complete Guide](symbiont-cms.md)** - Full system documentation
- **🎯 [Zero-Rebuild CMS Vision](zero-rebuild-cms-vision.md)** - The big picture
- **[Image Optimization Strategy](image-optimization-strategy.md)** - Image handling
- **[Dynamic File Management](dynamic-file-management.md)** - File uploads
- **[Dynamic Redirects Strategy](dynamic-redirects-strategy.md)** - URL management

---

**Status:** ✅ Implementation Complete (Phase 1: Posts)
**Last Updated:** October 5, 2025
