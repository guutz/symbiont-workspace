# Symbiont CMS Terminology Refactor Plan

**Date:** February 1, 2026  
**Status:** Approved for Implementation  
**Context:** Complete naming refactor for clarity and consistency

---

## Naming Convention

### Core Pattern: `{Source}To{Destination}{Action}`

All transformations, syncs, and data flows use explicit source/destination naming.

**Examples:**
- `NotionToDatabaseSync` - Syncs from Notion to Supabase database
- `DatabaseToNotionSync` - Syncs from Supabase database to Notion
- `NotionPageToDatabasePageTransformer` - Transforms Notion page to website page object
- `MarkdownToHtmlRenderer` - Renders markdown to HTML
- `MarkdownToNotionBlocks` - Converts markdown to Notion blocks

### Database Pattern: `Database{EntityName}CRUD`

For database operations (Postgres):
- `DatabasePageCRUD` - Page CRUD operations in Supabase Postgres
- `DatabaseTable` - Reference to Postgres table

### Storage Pattern: `{Platform}Bucket{Action}`

For file storage operations (Supabase Storage):
- `SupabaseBucketUpload` - Upload to Supabase Storage bucket
- `imageBucket` - Reference to bucket name

### Client Pattern: `{Platform}Client`

For API wrappers:
- `NotionClient` - Notion API client
- `SupabaseClient` - Supabase client (from SDK)

---

## Terminology: "Page" vs "Post"

### Rationale for "Page"

**Use "Page" everywhere:**
- `NotionPage` - A page in Notion database
- `DatabasePage` - A page row in Supabase Postgres
- `WebsitePage` - A rendered page on the website

**Why not "Post"?**
- "Post" implies blog-specific content
- Symbiont CMS can handle any content type (pages, articles, docs, etc.)
- "Page" is more generic and accurate
- Matches Notion's terminology (Notion has "pages")

---

## Complete File Structure Refactor

### Before (Current)

```
lib/
├── client/
│   ├── image-zoom.ts
│   └── utils/
│       └── env.public.ts
├── server/
│   ├── sync/
│   │   ├── factory.ts
│   │   ├── orchestrator.ts
│   │   ├── post-builder.ts
│   │   ├── post-repository.ts
│   │   └── publish-to-notion.ts
│   ├── notion/
│   │   ├── adapter.ts
│   │   └── markdown-to-notion.ts
│   ├── utils/
│   │   ├── env.server.ts
│   │   ├── logger.ts
│   │   ├── markdown-migration.ts
│   │   └── slug-helpers.ts
│   ├── markdown-processor.ts
│   ├── sync.ts
│   └── webhook.ts
├── components/
│   ├── Editor.svelte
│   ├── PostHead.svelte
│   ├── PostMeta.svelte
│   └── TOC.svelte
├── client.ts
├── config.ts
├── database.types.ts
├── image-processor.ts
├── image-upload.ts
├── image-utils.ts
├── index.ts
├── server.ts
└── types.ts
```

### After (Proposed)

```
lib/
├── client/
│   ├── client.ts                                # Main client API (getPageBySlug, getAllPages)
│   ├── image-zoom.ts                            # Image zoom feature
│   └── utils/
│       └── env.ts                               # Was: env.public.ts
├── server/
│   ├── database/
│   │   └── page-crud.ts                         # Was: sync/post-repository.ts
│   ├── bucket/
│   │   └── image-upload.ts                      # Was: image-upload.ts (Supabase Storage)
│   ├── notion/
│   │   ├── client.ts                            # Was: adapter.ts
│   │   ├── page-to-website-page-transformer.ts  # Was: sync/post-builder.ts
│   │   ├── markdown-to-blocks.ts                # Was: markdown-to-notion.ts
│   │   └── blocks-to-markdown.ts                # Was: markdown-processor.ts
│   ├── sync/
│   │   ├── notion-to-database-sync.ts           # Was: orchestrator.ts
│   │   ├── database-to-notion-sync.ts           # Was: publish-to-notion.ts
│   │   └── coordinator.ts                       # Was: factory.ts (DI/factory)
│   ├── markdown/
│   │   ├── to-html-renderer.ts                  # Markdown → HTML rendering
│   │   └── image-url-extractor.ts               # Was: utils/markdown-migration.ts
│   ├── utils/
│   │   ├── env.ts                               # Was: env.server.ts
│   │   ├── logger.ts
│   │   └── slug.ts                              # Was: slug-helpers.ts
│   ├── webhook.ts                               # Notion webhook handler
│   └── index.ts                                 # Server-side exports
├── components/
│   ├── Editor.svelte
│   ├── PageHead.svelte                          # Was: PostHead.svelte
│   ├── PageMeta.svelte                          # Was: PostMeta.svelte
│   └── TOC.svelte
├── config.ts                                    # defineConfig helper
├── database.types.ts                            # Generated Supabase types
├── index.ts                                     # Main package exports
├── server.ts                                    # Server-side re-exports
└── types.ts                                     # Shared types
```

**Removed files:**
- `image-processor.ts` → logic moved to `server/notion/blocks-to-markdown.ts`
- `image-utils.ts` → merged into relevant modules
- `sync.ts` → redundant, logic in `sync/` folder

---

## Detailed File Renames

### Client Files

| Old Path | New Path | Notes |
|----------|----------|-------|
| `client/utils/env.public.ts` | `client/utils/env.ts` | Simpler name |
| `client.ts` | `client/client.ts` | Moved into client/ folder |

### Server Files - Database (Postgres)

| Old Path | New Path | Notes |
|----------|----------|-------|
| `server/sync/post-repository.ts` | `server/database/page-crud.ts` | Postgres CRUD ops |

### Server Files - Bucket (Storage)

| Old Path | New Path | Notes |
|----------|----------|-------|
| `image-upload.ts` | `server/bucket/image-upload.ts` | Supabase Storage uploads |

### Server Files - Notion

| Old Path | New Path | Notes |
|----------|----------|-------|
| `server/notion/adapter.ts` | `server/notion/client.ts` | Notion API client |
| `server/sync/post-builder.ts` | `server/notion/page-to-website-page-transformer.ts` | Transform Notion → WebsitePage |
| `server/notion/markdown-to-notion.ts` | `server/notion/markdown-to-blocks.ts` | Markdown → Notion blocks |
| `server/markdown-processor.ts` | `server/notion/blocks-to-markdown.ts` | Notion blocks → Markdown |

### Server Files - Sync

| Old Path | New Path | Notes |
|----------|----------|-------|
| `server/sync/orchestrator.ts` | `server/sync/notion-to-database-sync.ts` | Notion → Postgres sync |
| `server/sync/publish-to-notion.ts` | `server/sync/database-to-notion-sync.ts` | Postgres → Notion sync |
| `server/sync/factory.ts` | `server/sync/coordinator.ts` | Factory/DI for sync |

### Server Files - Markdown

| Old Path | New Path | Notes |
|----------|----------|-------|
| `image-processor.ts` | `server/markdown/to-html-renderer.ts` | Markdown → HTML (with images) |
| `server/utils/markdown-migration.ts` | `server/markdown/image-url-extractor.ts` | Extract/replace image URLs |

### Server Files - Utils

| Old Path | New Path | Notes |
|----------|----------|-------|
| `server/utils/env.server.ts` | `server/utils/env.ts` | Simpler name |
| `server/utils/slug-helpers.ts` | `server/utils/slug.ts` | Simpler name |

### Component Files

| Old Path | New Path | Notes |
|----------|----------|-------|
| `components/PostHead.svelte` | `components/PageHead.svelte` | Use "Page" terminology |
| `components/PostMeta.svelte` | `components/PageMeta.svelte` | Use "Page" terminology |

---

## Class/Function/Type Renames

### Classes

| Old Name | New Name | File |
|----------|----------|------|
| `PostRepository` | `DatabasePageCRUD` | `server/database/page-crud.ts` |
| `PostBuilder` | `NotionPageToDatabasePageTransformer` | `server/notion/page-to-website-page-transformer.ts` |
| `SyncOrchestrator` | `NotionToDatabaseSync` | `server/sync/notion-to-database-sync.ts` |
| `NotionAdapter` | `NotionClient` | `server/notion/client.ts` |
| `SyncMetrics` | `SyncMetrics` | No change (clear as-is) |

### Functions

| Old Name | New Name | File |
|----------|----------|------|
| `createSyncOrchestrator` | `createNotionToDatabaseSyncCoordinator` | `server/sync/coordinator.ts` |
| `parseMarkdown` | `renderMarkdownToHtml` | `server/markdown/to-html-renderer.ts` |
| `markdownToNotionBlocks` | `convertMarkdownToNotionBlocks` | `server/notion/markdown-to-blocks.ts` |
| `extractImages` | `extractImageUrls` | `server/markdown/image-url-extractor.ts` |
| `replaceImageUrls` | `replaceImageUrls` | No change (clear as-is) |
| `uploadImage` | `uploadImageToBucket` | `server/bucket/image-upload.ts` |
| `requireEnvVar` | `requireEnvVar` | No change (clear as-is) |
| `requirePublicEnvVar` | `requirePublicEnvVar` | No change (clear as-is) |
| `getAllPosts` | `getAllPages` | `client/client.ts` |
| `getPostBySlug` | `getPageBySlug` | `client/client.ts` |

### Types/Interfaces

| Old Name | New Name | Notes |
|----------|----------|-------|
| `Post` | `WebsitePage` | Rendered page for website |
| `PostData` | `DatabasePage` | Page row in Postgres |
| `SyncOptions` | `NotionSyncOptions` | Options for Notion sync |
| `SyncSummary` | `SyncResult` | Result of sync operation |
| `MarkdownResult` | `RenderedMarkdown` | Result of markdown rendering |
| `ImageReference` | `ImageUrlReference` | Reference to image URL in markdown |
| `GetPostOptions` | `GetPageOptions` | Options for fetching page |
| `GetAllPostsOptions` | `GetAllPagesOptions` | Options for fetching pages |

---

## Terminology Glossary

| Term | Meaning | Usage Examples |
|------|---------|----------------|
| **NotionPage** | Entry in Notion database | `NotionPage`, `notionPageId` |
| **WebsitePage** | Rendered page for display | `WebsitePage`, rendered content |
| **DatabasePage** | Row in Postgres pages table | `DatabasePage`, database record |
| **Transform** | Convert one format to another | `NotionPageToDatabasePageTransformer` |
| **CRUD** | Database create/read/update/delete | `DatabasePageCRUD` |
| **Bucket** | Supabase Storage container | `uploadImageToBucket`, `mediaBucket` |
| **Database** | Supabase Postgres | `DatabasePageCRUD`, `NotionToDatabaseSync` |
| **Client** | API wrapper | `NotionClient`, `SupabaseClient` |
| **Sync** | Direction specified | `NotionToDatabaseSync`, `DatabaseToNotionSync` |
| **Render** | Format data for output | `renderMarkdownToHtml` |
| **Convert** | Change format/structure | `convertMarkdownToNotionBlocks` |
| **Extract** | Pull specific data | `extractImageUrls` |
| **Coordinator** | Orchestrate/manage operations | `createNotionToDatabaseSyncCoordinator` |

---

## Implementation Plan (Single Phase)

### Step 1: Create New Directory Structure

```bash
cd packages/symbiont-cms/src/lib

# Create new folders
mkdir -p server/database
mkdir -p server/bucket
mkdir -p server/markdown
```

### Step 2: Move and Rename Files

Execute all file moves/renames:

```bash
cd packages/symbiont-cms/src/lib

# Client files
mv client/utils/env.public.ts client/utils/env.ts

# Database files (Postgres)
mv server/sync/post-repository.ts server/database/page-crud.ts

# Bucket files (Storage)
mv image-upload.ts server/bucket/image-upload.ts

# Notion files
mv server/notion/adapter.ts server/notion/client.ts
mv server/sync/post-builder.ts server/notion/page-to-website-page-transformer.ts
mv server/notion/markdown-to-notion.ts server/notion/markdown-to-blocks.ts
mv server/markdown-processor.ts server/notion/blocks-to-markdown.ts

# Sync files
mv server/sync/orchestrator.ts server/sync/notion-to-database-sync.ts
mv server/sync/publish-to-notion.ts server/sync/database-to-notion-sync.ts
mv server/sync/factory.ts server/sync/coordinator.ts

# Markdown files
mv server/utils/markdown-migration.ts server/markdown/image-url-extractor.ts

# Utils files
mv server/utils/env.server.ts server/utils/env.ts
mv server/utils/slug-helpers.ts server/utils/slug.ts

# Component files
mv components/PostHead.svelte components/PageHead.svelte
mv components/PostMeta.svelte components/PageMeta.svelte

# Delete redundant files
rm image-processor.ts image-utils.ts server/sync.ts
```

### Step 3: Update Exports and Imports

Update all import statements across codebase to use new paths.

### Step 4: Rename Classes/Functions

In each file, rename classes and functions according to the table above.

### Step 5: Update Type Names

Rename types/interfaces throughout codebase.

### Step 6: Update Tests

Update any test files to use new names and imports.

### Step 7: Update Documentation

Update README and other docs to reference new names.

---

## Import Path Changes

### Client-Side Imports

```typescript
// Before
import { createSymbiontClient } from 'symbiont-cms';

// After (no change - public API stable, but method names change)
import { createSymbiontClient } from 'symbiont-cms';

const client = createSymbiontClient(config);
const page = await client.getPageBySlug('my-slug'); // was: getPostBySlug
const pages = await client.getAllPages(); // was: getAllPosts
```

### Server-Side Imports

```typescript
// Before
import { PostRepository } from 'symbiont-cms/server';
import { createSyncOrchestrator } from 'symbiont-cms/server';
import { parseMarkdown } from 'symbiont-cms/server';
import type { Post, PostData } from 'symbiont-cms/server';

// After
import { DatabasePageCRUD } from 'symbiont-cms/server';
import { createNotionToDatabaseSyncCoordinator } from 'symbiont-cms/server';
import { renderMarkdownToHtml } from 'symbiont-cms/server';
import type { WebsitePage, DatabasePage } from 'symbiont-cms/server';
```

---

## Example Code Changes

### Before: Creating Sync Orchestrator

```typescript
// server/sync/factory.ts
export function createSyncOrchestrator(config: HydratedSymbiontConfig) {
  const repository = new PostRepository(
    config.supabase.url,
    config.supabase.serviceRoleKey
  );
  
  const adapter = new NotionAdapter(notionToken);
  const builder = new PostBuilder(config, logger);
  
  return new SyncOrchestrator(repository, adapter, builder, logger);
}
```

### After: Creating Sync Coordinator

```typescript
// server/sync/coordinator.ts
export function createNotionToDatabaseSyncCoordinator(config: HydratedSymbiontConfig) {
  const pageCrud = new DatabasePageCRUD(
    config.supabase.url,
    config.supabase.serviceRoleKey
  );
  
  const notionClient = new NotionClient(notionToken);
  const transformer = new NotionPageToDatabasePageTransformer(config, logger);
  
  return new NotionToDatabaseSync(pageCrud, notionClient, transformer, logger);
}
```

### Before: Client API Usage

```typescript
// app/routes/[slug]/+page.server.ts
import { symbiont } from '$lib/symbiont';

export const load = async ({ params }) => {
  const post = await symbiont.getPostBySlug(params.slug);
  return { post };
};
```

### After: Client API Usage

```typescript
// app/routes/[slug]/+page.server.ts
import { symbiont } from '$lib/symbiont';

export const load = async ({ params }) => {
  const page = await symbiont.getPageBySlug(params.slug);
  return { page };
};
```

---

## Benefits

1. **Crystal clear data flow**: Every name tells you source and destination
2. **No ambiguity**: `NotionToDatabaseSync` vs `DatabaseToNotionSync` - completely obvious
3. **Consistent terminology**: "Page" throughout (Notion, Database, Website)
4. **Clear storage distinctions**: "Bucket" for files, "Database" for Postgres
5. **Easier onboarding**: New developers immediately understand architecture
6. **Better IDE support**: Autocomplete surfaces related functionality
7. **Grep-friendly**: `git grep NotionToDatabase` finds all Notion→DB code
8. **Future-proof**: Pattern scales to new integrations (e.g., `ContentfulToDatabaseSync`)

---

## Migration Checklist

- ⬜ Create new directory structure (`database/`, `bucket/`, `markdown/`)
- ⬜ Move/rename all files
- ⬜ Update imports in `lib/index.ts`
- ⬜ Update imports in `lib/server.ts`
- ⬜ Update imports in `lib/client/client.ts`
- ⬜ Rename classes in each file (PostRepository → DatabasePageCRUD, etc.)
- ⬜ Rename functions in each file (getPostBySlug → getPageBySlug, etc.)
- ⬜ Rename types/interfaces (Post → WebsitePage, PostData → DatabasePage)
- ⬜ Update webhook.ts imports and usage
- ⬜ Update california-tech app imports and usage
- ⬜ Update guutz-blog app imports and usage
- ⬜ Update all test files
- ⬜ Run `pnpm build:package`
- ⬜ Run type checking (`pnpm check`)
- ⬜ Update documentation
- ⬜ Test sync functionality end-to-end

---

## Summary

**One-phase refactor with no backwards compatibility:**
- Move all files to logical groupings (`database/`, `bucket/`, `notion/`, `markdown/`)
- Use consistent `{Source}To{Destination}{Action}` naming
- Replace "Post" with "Page" terminology throughout
- Use "Database" for Postgres, "Bucket" for Storage
- Explicit sync directions: `NotionToDatabaseSync` and `DatabaseToNotionSync`
- Clean up redundant files (`image-processor.ts`, `sync.ts`, etc.)

**Result:** A codebase where every file name and class name clearly communicates purpose and data flow, with consistent "Page" terminology and clear storage distinctions.
