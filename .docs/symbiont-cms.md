# Symbiont CMS: Complete Guide

> **📖 Part of the Zero-Rebuild CMS Vision** - See `zero-rebuild-cms-vision.md` for the broader dynamic CMS strategy

**A powerful, flexible CMS package for SvelteKit that syncs content from Notion to your database.**

---

## Table of Contents

- [I. Philosophy & Principles](#i-philosophy--principles)
- [II. System Architecture](#ii-system-architecture)
- [III. Installation & Quick Start](#iii-installation--quick-start)
- [IV. Configuration](#iv-configuration)
- [V. Package API Reference](#v-package-api-reference)
- [VI. Advanced Usage](#vi-advanced-usage)
- [VII. Implementation Status](#vii-implementation-status)
- [VIII. Architectural Decisions](#viii-architectural-decisions)
- [IX. Performance & Security](#ix-performance--security)

---

## I. Philosophy & Principles

The Symbiont CMS is a **reusable framework** for building headless content systems deeply integrated with Notion. It's for developers who find existing tools "painfully close" but need more flexibility and control.

### Core Principles

1. **The User-Defined Rulebook**  
   The system imposes no rigid structure. A central `symbiont.config.ts` file teaches the CMS how to interpret your existing Notion properties, making the system an extension of your unique workflow.

2. **Notion as the Control Panel**  
   Notion serves as the beautiful, high-level user interface for managing content metadata and, when desired, the content itself. It is the human-facing dashboard.

3. **The Dedicated Backend Platform**  
   A high-performance Nhost (PostgreSQL + Hasura GraphQL) project acts as the system's true engine. It provides the database, an instant GraphQL API, authentication, and serverless functions in a single, cohesive platform.

4. **An Adaptable Framework**  
   This is a pattern for creating custom publishing solutions, from collaborative newspapers to personal blogs, without reinventing the wheel.

5. **Zero-Rebuild Workflow**  
   Content changes appear instantly without rebuilds. The database is the source of truth, enabling dynamic, real-time updates.

### Features

✅ **Notion Integration** - Write in Notion, publish to your site  
✅ **Zero-Rebuild** - Content updates appear instantly without rebuilds  
✅ **Type-Safe** - Full TypeScript support with type-safe configuration  
✅ **Flexible Rules** - Define your own sync logic via `symbiont.config.ts`  
✅ **GraphQL Client** - Built-in utilities for querying your content  
✅ **SSR Support** - Server-side rendering for SEO and performance  
✅ **Customizable UI** - Full styling control via `classMap` props  

---

## II. System Architecture

The system is a decoupled, modern web architecture. Your frontend platform (Vercel, Netlify, etc.) orchestrates communication between the user's browser, Notion, and the Nhost data platform.

```
┌───────────────────────┐       ┌─────────────────────────┐       ┌────────────────────────┐
│   USER'S BROWSER      │       │   FRONTEND PLATFORM     │       │   NHOST PLATFORM       │
│  (SvelteKit Client)   │◄─────►│  (SvelteKit Server)     │◄─────►│  (Postgres + GraphQL)  │
└───────────────────────┘       │  - SSR                  │       │  - Database            │
                                │  - API Routes           │       │  - Hasura GraphQL      │
                                │  - Sync Handlers        │       │  - Storage (S3)        │
                                └─────────────────────────┘       │  - Authentication      │
                                          ▲                        └────────────────────────┘
                                          │
                                          ▼
                                ┌─────────────────────────┐
                                │    NOTION API           │
                                │  (The Control Panel)    │
                                └─────────────────────────┘
```

### Components

- **Frontend (SvelteKit)**: The user-facing application. It displays published content, hosts the editor pages, and makes GraphQL queries to Nhost. SSR provides SEO and performance.

- **Backend Platform (Nhost)**: The core data and services layer. It provides:
  - PostgreSQL database for content storage
  - Instant Hasura GraphQL API (auto-generated from schema)
  - File Storage (S3-compatible)
  - Authentication & permissions
  - Serverless functions (future: Hocuspocus for real-time editing)

- **The Sync Service**: The intelligent bridge between Notion and Nhost. It runs on-demand via API routes, reads the `symbiont.config.ts` rules, and synchronizes data.

- **The Control Panel (Notion)**: The human interface for managing content metadata, rich text editing, and workflow (draft/published status).

### Data Flow

```
Notion Page → Sync Trigger → Process Page → Transform → Store in Postgres → Available via GraphQL
```

---

## III. Installation & Quick Start

### Step 1: Install the Package

```bash
npm install symbiont-cms
# or
pnpm add symbiont-cms
```

### Step 2: Set Up Nhost

1. Sign up at [nhost.io](https://nhost.io)
2. Create a new project
3. Deploy backend from template repository
4. Note your GraphQL endpoint

### Step 3: Set Up Notion

1. Create a Notion database with these properties:
   - **Title** (title) - Post title
   - **Status** (select) - Draft/Published
   - **Website Slug** (text) - URL slug
   - **Publish Date** (date) - Publication date
   - **Tags** (multi-select) - Post tags

2. Create an integration at [notion.so/my-integrations](https://notion.so/my-integrations)
3. Share your database with the integration
4. Copy the database ID from the URL

### Step 4: Configure Environment

**Secrets only** - Store sensitive data in `.env`:

```bash
# .env
NOTION_API_KEY=secret_xxxxx
NHOST_ADMIN_SECRET=xxxxx
```

**Non-secrets** go in `symbiont.config.js` (see Step 5).

### Step 5: Create Configuration

Create `symbiont.config.js` in your project root:

> ⚠️ **Must be `.js` (not `.ts`)** - The config file must be a `.js` or `.mjs` file so it can be loaded at build time and runtime without transpilation.

```javascript
// @ts-check
import { defineConfig } from 'symbiont-cms/config';

export default defineConfig({
  // GraphQL endpoint (public, non-secret)
  graphqlEndpoint: 'https://your-project.nhost.run/v1/graphql',
  
  // Notion database ID (public, non-secret)
  notionDatabaseId: 'your-notion-database-id-here',
  
  // Primary database identifier
  primaryShortDbId: 'blog',
  
  databases: [
    {
      short_db_ID: 'blog',
      
      // When is a post published?
      isPublicRule: (page) => {
        const status = page.properties.Status;
        return status.select?.name === 'Published';
      },
      
      // Where does content come from?
      sourceOfTruthRule: () => 'NOTION',
      
      // Which property contains the slug?
      slugPropertyName: "Website Slug",
      
      // How to extract the slug?
      slugRule: (page) => {
        const slugProperty = page.properties["Website Slug"]?.rich_text;
        return slugProperty?.[0]?.plain_text?.trim() || null;
      },
    },
  ],
});
```

**TypeScript autocomplete works!** The `defineConfig()` helper provides full IntelliSense in `.js` files via JSDoc type hints.

### Step 6: Add Vite Plugin

In your `vite.config.js` (or `.ts`), add the Symbiont plugin:

```javascript
import { sveltekit } from '@sveltejs/kit/vite';
import { symbiontVitePlugin } from 'symbiont-cms';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    symbiontVitePlugin(), // ← Add this!
    sveltekit()
  ]
});
```

**What does this do?** The plugin creates a virtual module `virtual:symbiont/config` that makes your config available at build time (for SSG) and runtime (for SSR).

### Step 7: Create Sync Endpoint

```typescript
// src/routes/api/sync/poll-blog/+server.ts
export { handlePollBlogRequest as GET } from 'symbiont-cms/server';
```

### Step 8: Create Post Routes

```typescript
// src/routes/[slug]/+page.server.ts
export { postLoad as load } from 'symbiont-cms/server';
```

```svelte
<!-- src/routes/[slug]/+page.svelte -->
<script lang="ts">
  import { PostPage } from 'symbiont-cms';
  import type { PageData } from './$types';
  
  export let data: PageData;
</script>

<PostPage post={data.post} />
```

### Step 9: First Sync

```bash
# Trigger sync
curl http://localhost:5173/api/sync/poll-blog

# Visit your site
open http://localhost:5173/blog/your-first-post
```

---

## IV. Configuration

### Configuration Reference

> ⚠️ **Must be `.js` file** - Use `symbiont.config.js` (not `.ts`) for compatibility.

```javascript
// @ts-check
import { defineConfig } from 'symbiont-cms/config';

export default defineConfig({
  // ═══════════════════════════════════════════════════════════
  // REQUIRED: Core Configuration
  // ═══════════════════════════════════════════════════════════
  
  /** GraphQL endpoint URL (public, non-secret) */
  graphqlEndpoint: 'https://your-project.nhost.run/v1/graphql',
  
  /** Notion database ID (public, non-secret) */
  notionDatabaseId: 'your-notion-database-id',
  
  /** Primary database identifier (used as default) */
  primaryShortDbId: 'blog',
  
  // ═══════════════════════════════════════════════════════════
  // REQUIRED: Database Configuration
  // ═══════════════════════════════════════════════════════════
  
  databases: [
    {
      /** Unique identifier for this database */
      short_db_ID: 'blog',
      
      /** Determines if a Notion page should be published */
      isPublicRule: (page) => {
        const status = page.properties.Status;
        return status.select?.name === 'Published';
      },
      
      /** Where content comes from: 'NOTION' or 'DATABASE' */
      sourceOfTruthRule: (page) => 'NOTION',
      
      /** Name of Notion property containing the URL slug */
      slugPropertyName: 'Website Slug',
      
      // ─────────────────────────────────────────────────────────
      // Optional: Custom Extraction Rules
      // ─────────────────────────────────────────────────────────
      
      /** Custom slug extraction logic */
      slugRule: (page) => {
        const prop = page.properties['Website Slug']?.rich_text;
        return prop?.[0]?.plain_text?.trim() || null;
      },
      
      /** Custom title extraction logic */
      titleRule: (page) => {
        const title = page.properties.Name?.title;
        return title?.[0]?.plain_text || null;
      },
    }
  ],
  
  // ═══════════════════════════════════════════════════════════
  // OPTIONAL: Additional Databases
  // ═══════════════════════════════════════════════════════════
  
  // You can add more databases here with different rules
  // shortDbIds: ['blog', 'docs', 'recipes']
});
```

**Why `.js` not `.ts`?**
- Works at build time AND runtime without transpilation
- Simpler tooling, no extra dependencies
- Standard practice (like `vite.config.js`, `tailwind.config.js`)
- Full TypeScript autocomplete via `defineConfig()` helper

### Config Properties

export default config;
```

### Environment Variables

Store only **secrets** in `.env` - public configuration goes in `symbiont.config.js`:

| Variable | Required | Description |
|----------|----------|-------------|
| `NOTION_API_KEY` | ✅ Yes | Notion integration secret |
| `NHOST_ADMIN_SECRET` | ✅ Yes | Nhost admin secret for mutations |

> **Note**: GraphQL endpoint and database IDs are public (non-secret) and belong in your config file, not environment variables.

### Configuration Loader

The `loadConfig()` function dynamically imports your config file at runtime:

```typescript
import { loadConfig } from 'symbiont-cms/server';

// In server-side code (API routes, load functions, etc.)
const config = await loadConfig();
// config.graphqlEndpoint, config.notionDatabaseId, etc.
```

**What it does:**
1. Looks for `symbiont.config.js` (or `.mjs`) in your project root
2. Dynamically imports it using Node.js native `import()`
3. Returns the complete configuration object
4. Throws helpful error if config file not found

**Virtual module vs loadConfig():**
- `virtual:symbiont/config` - Build-time config extraction (for SSG/prerendering)
- `loadConfig()` - Runtime config loading (for SSR/API routes)

Both are needed for a complete SvelteKit app!

### Multiple Databases

```typescript
const config = defineSymbiontConfig({
  databases: [
    {
      short_db_ID: 'tech-blog',
      notionDatabaseIdEnvVar: 'NOTION_TECH_DB_ID',
      // ... rules
    },
    {
      short_db_ID: 'personal-blog',
      notionDatabaseIdEnvVar: 'NOTION_PERSONAL_DB_ID',
      // ... rules
    }
  ]
});
```

---

## V. Package API Reference

### Package Structure

The package provides **three main entry points** to ensure proper code splitting:

```
symbiont-cms
├── 📦 symbiont-cms (Client exports)
│   ├── <Renderer /> - Markdown to HTML
│   ├── <PostPage /> - Complete post rendering component
│   ├── <Editor /> - Tiptap editor (planned)
│   ├── GraphQL utilities (getPosts, getPostBySlug, getAllPosts)
│   └── Type definitions (SymbiontPost, SymbiontConfig)
│
├── 📦 symbiont-cms/server (Server-only exports)
│   ├── handlePollBlogRequest() - Manual sync handler
│   ├── handleNotionWebhookRequest() - Webhook handler
│   ├── syncFromNotion() - Core sync logic
│   ├── loadConfig() - Config loader
│   ├── postLoad() - Pre-built load function
│   └── createPostLoad() - Custom load factory
│
└── 📦 symbiont-cms/config (Config helper)
    └── defineConfig() - Type-safe config helper for .js files
```

### Client-Side Components

#### `<Renderer />` - Markdown Renderer

Safely renders Markdown content with full styling control:

```svelte
<script>
  import { Renderer } from 'symbiont-cms';
  export let data;
</script>

<Renderer 
  markdown={data.post.content} 
  classMap={{
    h1: 'text-4xl font-bold',
    h2: 'text-3xl font-semibold mt-8',
    p: 'my-4 text-gray-700',
    code: 'bg-gray-100 px-2 py-1 rounded',
    pre: 'bg-gray-900 text-white p-4 rounded-lg overflow-x-auto'
  }}
/>
```

#### `<PostPage />` - Complete Post Component

Renders a complete post page with built-in formatting:

```svelte
<script>
  import { PostPage } from 'symbiont-cms';
  export let data;
</script>

<PostPage 
  post={data.post}
  formatDate={(date) => new Date(date).toLocaleDateString()}
  classMap={{
    title: 'text-4xl font-bold mb-4',
    date: 'text-gray-500 mb-8',
    content: 'prose lg:prose-xl'
  }}
/>
```

#### `<Editor />` - Rich Text Editor (Planned)

Tiptap wrapper for collaborative, Markdown-native editing:

```svelte
<script>
  import { Editor } from 'symbiont-cms';
</script>

<Editor 
  postId={data.post.id}
  initialContent={data.post.content}
  on:save={handleSave}
/>
```

### GraphQL Client Utilities

Symbiont provides **three layers** of GraphQL clients for different use cases:

#### Layer 1: Client-Side Queries (Public)

For components and client-side load functions:

```typescript
import { getPosts, getPost } from 'symbiont-cms';

// In +page.ts (client-side) or +page.server.ts
export const load = async ({ fetch }) => {
  // Get posts from primary database
  const posts = await getPosts({ 
    fetch,
    limit: 10 
  });
  
  return { posts };
};

// Get posts from specific database
const docs = await getPosts({ 
  fetch,
  limit: 20,
  shortDbId: 'documentation' 
});

// Get specific post by slug
const post = await getPost(params.slug, { fetch });
```

#### Layer 2: Server-Side Queries (Server-Only)

For `+page.server.ts` and API routes with cleaner API:

```typescript
import { getPostBySlug, getAllPosts } from 'symbiont-cms/server';

// In +page.server.ts
export const load = async ({ params, fetch }) => {
  // Simpler API - no client creation needed
  const post = await getPostBySlug(params.slug, { fetch });
  
  if (!post) {
    throw error(404, 'Post not found');
  }
  
  return { post };
};

// Get all posts with pagination
export const load = async ({ fetch }) => {
  const posts = await getAllPosts({ 
    fetch,
    limit: 20,
    offset: 0,
    shortDbId: 'blog' // optional
  });
  
  return { posts };
};
```

#### Layer 3: Admin Client (Server-Only)

For sync operations and admin mutations:

```typescript
import { gqlAdminClient } from 'symbiont-cms/server';

// Requires NHOST_ADMIN_SECRET env var
const result = await gqlAdminClient.request(MUTATION, variables);
```

**Architecture Summary:**
- **`symbiont-cms`** (client) → Public queries, works client-side and SSR
- **`symbiont-cms/server`** (server) → Clean wrappers, auto-config loading
- **`gqlAdminClient`** (server) → Admin operations, lazy singleton

**Why pass `fetch`?** SvelteKit's special `fetch` function enables:
- Cookie/session forwarding for auth
- Request deduplication
- Better SSR performance
```

### Server-Side Functions

#### Sync Handlers

**Manual Sync (Polling):**
```typescript
// src/routes/api/sync/poll-blog/+server.ts
export { handlePollBlogRequest as GET } from 'symbiont-cms/server';
```

Call endpoint to sync on-demand:
```bash
curl http://localhost:5173/api/sync/poll-blog
```

**Webhook Sync (Real-time):**
```typescript
// src/routes/api/sync/webhook/+server.ts
export { handleNotionWebhookRequest as POST } from 'symbiont-cms/server';
```

Notion sends webhook when pages change for instant updates.

#### Post Page Loaders

**Simple Usage** - Use the default loader:

```typescript
// src/routes/[slug]/+page.server.ts
export { postLoad as load } from 'symbiont-cms/server';
// Automatically fetches post by slug from primary database
```

**Custom Usage** - Create a customized loader:

```typescript
// src/routes/[slug]/+page.server.ts
import { createPostLoad } from 'symbiont-cms/server';

export const load = createPostLoad({
  // Optional: Override database
  shortDbId: 'documentation',
  
  // Optional: Transform post data
  formatPost: (post) => ({
    ...post,
    readingTime: calculateReadingTime(post.content),
    relatedPosts: findRelatedPosts(post.tags)
  })
});
```

**What does it do?**
- Extracts `slug` from route params (`params.slug`)
- Queries GraphQL for the post
- Returns `{ post }` for your page component
- Throws 404 if post not found

#### Direct Sync

```typescript
import { syncFromNotion, loadConfig } from 'symbiont-cms/server';

// In your custom endpoint
export const POST = async () => {
  const config = await loadConfig();
  const summary = await syncFromNotion(config);
  
  return json(summary);
};
```

### TypeScript Types

```typescript
import type {
  SymbiontPost,           // Post data type
  SymbiontConfig,         // Config type
  PageObjectResponse,     // Notion page type (from @notionhq/client)
  ClassMap,               // Styling type for components
  SyncSummary,            // Sync result type
  DatabaseBlueprint,      // Database config type
  HydratedDatabaseConfig, // Runtime config type (with secrets)
  PostServerLoad,         // SvelteKit load type
  PostLoadEvent,          // Load function event type
} from 'symbiont-cms';
```

**Import from `symbiont-cms/config`:**

```typescript
import { defineConfig } from 'symbiont-cms/config';
// Provides type safety for JavaScript configs
```

---

## VI. Advanced Usage

### Custom Post Transformation

```typescript
// src/routes/+page.server.ts
import { getAllPosts } from 'symbiont-cms';

export const load = async ({ fetch }) => {
  const posts = await getAllPosts(
    process.env.PUBLIC_NHOST_GRAPHQL_URL!,
    { fetch }
  );
  
  // Add custom fields
  const enrichedPosts = posts.map(post => ({
    ...post,
    readingTime: calculateReadingTime(post.content),
    excerpt: post.summary || extractExcerpt(post.content),
    author: getAuthorFromTags(post.tags)
  }));
  
  return { posts: enrichedPosts };
};
```

### Custom Styling

```typescript
const customClassMap = {
  // Typography
  h1: 'text-5xl font-black mb-6',
  h2: 'text-4xl font-bold mb-4 mt-8',
  h3: 'text-3xl font-semibold mb-3 mt-6',
  p: 'my-4 leading-relaxed',
  
  // Lists
  ul: 'list-disc list-inside my-4',
  ol: 'list-decimal list-inside my-4',
  li: 'my-2',
  
  // Code
  code: 'bg-gray-800 text-green-400 px-2 py-1 rounded font-mono text-sm',
  pre: 'bg-gray-900 p-6 rounded-lg overflow-x-auto my-6',
  
  // Links
  a: 'text-blue-600 hover:text-blue-800 underline',
  
  // Blockquotes
  blockquote: 'border-l-4 border-gray-300 pl-4 italic my-4',
};
```

### What Gets Synced

From Notion page to database:
- ✅ Title
- ✅ Slug (from custom property)
- ✅ Content (Markdown from Notion blocks)
- ✅ Publish date
- ✅ Updated timestamp
- ✅ Tags
- ✅ Status (draft/published)
- 🚧 Images (future: migrate to Nhost Storage)
- 🚧 Cover images (future)
- 🚧 Custom metadata fields

---

## VII. Implementation Status

> **Last Updated:** October 8, 2025

### ✅ Production Ready (Phase 1)

**Core Sync Engine**
- ✅ Notion API integration with `notion-to-md`
- ✅ Page-to-Markdown processor with feature detection
- ✅ GraphQL mutations to Nhost
- ✅ Configurable sync rules via `symbiont.config.js`
- ✅ Poll-based sync endpoint (`/api/sync`)

**Configuration System**
- ✅ `symbiont.config.js` definition (runtime-compatible)
- ✅ Type-safe config helper with JSDoc
- ✅ Environment variable separation (secrets in `.env`)
- ✅ Multi-database support via `source_id`

**UI Components**
- ✅ `<Renderer />` with classMap styling
- ✅ `<PostPage />` complete component
- ✅ SSR-first architecture
- ✅ Markdown rendering with plugins

**Server Utilities**
- ✅ Pre-built sync handlers (`handlePollBlogRequest`)
- ✅ Post loader functions (`postLoad`)
- ✅ GraphQL client helpers (`getPosts`, `getAllPosts`)
- ✅ Full TypeScript type exports

**Database Schema**
- ✅ Multi-tenant posts table with `source_id`
- ✅ Unique constraints on slug, notion_page_id, notion_short_id
- ✅ Indexes for performance
- ✅ Auto-update triggers for `updated_at`

### ⚠️ Missing from Phase 1 (Needs Implementation)

- ❌ **Testing Infrastructure** - No unit tests exist
- ❌ **Observability** - No structured logging or error tracking
- ❌ **Retry Logic** - Sync failures are not retried automatically
- ❌ **Webhook Support** - Only polling implemented, no Notion webhook handler

### � Designed but Not Implemented (Phase 2)

**Image Management** (See `image-optimization-strategy.md`)
- � Nhost Storage bucket configuration
- � File upload utilities (`file-upload.ts`)
- � Image download from Notion during sync
- � URL rewriting in markdown content
- 📋 Cover image handling

**File Management** (See `dynamic-file-management.md`)
- � Direct file upload endpoints
- � Asset deduplication logic
- 📋 File metadata tracking in database

### 📋 Designed but Not Implemented (Phase 3)

**Dynamic Redirects** (See `dynamic-redirects-strategy.md`)
- � Database migration for redirects table
- 📋 Middleware implementation in `hooks.server.ts`
- 📋 Redirect caching layer
- 📋 Admin UI for redirect management
- � Auto-redirect on slug changes
- � Analytics tracking

### 💭 Future Concepts (Phase 4+)

**Advanced Sync**
- � Scheduled cron jobs (beyond manual polling)
- 💭 Incremental sync (only changed pages)
- 💭 Conflict resolution strategies
- 💭 Content versioning and rollback

**Rich Editor Integration**
- 💭 Tiptap direct-to-database writes
- 💭 Real-time collaboration via Hocuspocus
- 💭 Inline file upload support
- 💭 WYSIWYG editing without Notion

**Site Configuration**
- 💭 Dynamic site settings in database
- 💭 Theme switching without rebuild
- 💭 Editorial workflow management

**Real-Time Collaboration**
- � Y.js CRDT for multiplayer editing
- � Live cursor tracking
- 💭 Hocuspocus server for WebSocket connections

---

## VIII. Architectural Decisions

### Why Nhost?

**All-in-One Platform:**
- ✅ PostgreSQL database (powerful, scalable)
- ✅ Hasura GraphQL (instant API from schema)
- ✅ S3-compatible storage (files, images)
- ✅ Authentication (future user features)
- ✅ Serverless functions (custom logic)
- ✅ One platform, one bill, one config

**Alternatives Rejected:**
- ❌ Supabase: Less mature GraphQL, more REST-focused
- ❌ Firebase: NoSQL limitations, vendor lock-in
- ❌ Custom setup: Too much infrastructure work

### Why SvelteKit?

- ✅ Modern framework with excellent SSR
- ✅ File-based routing
- ✅ API routes alongside pages
- ✅ Fast builds, great DX
- ✅ Growing ecosystem

### Why Notion?

- ✅ Beautiful, intuitive editor
- ✅ Powerful databases (filters, views, relations)
- ✅ Collaboration built-in
- ✅ Mobile apps
- ✅ API for programmatic access
- ✅ Non-technical users love it

### Why Not a Traditional CMS?

- ❌ WordPress: Heavy, PHP-based, security burden
- ❌ Contentful: Expensive, rigid content modeling
- ❌ Sanity: Good but requires learning Studio
- ❌ Strapi: Self-hosted complexity

**Symbiont gives you:**
- ✅ Notion's UX + Your database + Your frontend
- ✅ Full control over data model
- ✅ No CMS admin UI to maintain
- ✅ Standard web technologies (GraphQL, SQL, REST)

### Use Cases

**Personal Blog** (Current Implementation)
- Write in Notion
- Sync to database
- Display on custom SvelteKit site
- Zero rebuild time

**Team Blog / Publication**
- Multiple authors in Notion
- Approval workflow (Draft → Review → Published)
- Custom frontend per publication
- Shared Symbiont backend

**Documentation Site**
- Technical docs in Notion (easy for non-devs)
- Version control via database
- Custom navigation/sidebar
- Search via GraphQL

**Multi-Site CMS**
- One Notion workspace
- Multiple databases (blog, docs, changelog)
- One Nhost backend
- Multiple frontend sites reading same data

---

## IX. Performance & Security

### Database Performance
- **PostgreSQL** handles millions of rows easily
- **Indexes** on slug, publish_at for fast queries
- **GraphQL** provides efficient data fetching (no over-fetching)

### Frontend Performance
- **SSR** provides fast initial page load + SEO
- **Static asset optimization** via Vite
- **Image optimization** via Nhost Storage transforms (future)
- **CDN caching** at edge (Vercel/Netlify)

### Sync Performance
- **Incremental sync** (future) only processes changed pages
- **Parallel processing** for multiple pages
- **Webhook triggers** for instant updates
- **Rate limiting** respects Notion API limits

### Security Model

**Secrets Management:**
- ✅ Environment variables on server only
- ✅ Never exposed to client
- ✅ Config references env var names, not values

**Database Access:**
- ✅ Hasura permissions control GraphQL access
- ✅ Public queries: read published posts
- ✅ Admin queries: manage all content
- ✅ Row-level security via Postgres

**API Routes:**
- ✅ Sync endpoints can be protected
- ✅ Webhook endpoints verify signatures
- ✅ CORS configured properly

---

## Examples

See working examples in this workspace:

- **[qwer-test](../packages/qwer-test/)** - Integration with QWER template
- **[guutz-blog](../packages/guutz-blog/)** - Personal blog implementation

---

## Development

### Building the Package

```bash
npm run build
```

### Testing Locally

```bash
npm pack
# Then in your project:
npm install /path/to/symbiont-cms-x.x.x.tgz
```

---

## Related Documentation

### Implementation Guides
- **[Quick Start](QUICKSTART.md)** - Get up and running in 5 minutes
- **[Integration Guide](INTEGRATION_GUIDE.md)** - QWER + Symbiont integration
- **[Type Compatibility](TYPE_COMPATIBILITY.md)** - Type system details

### Architecture & Strategy
- **[Zero-Rebuild CMS Vision](zero-rebuild-cms-vision.md)** 🎯 - The big picture
- **[Image Optimization Strategy](image-optimization-strategy.md)** - Image handling
- **[Dynamic File Management](dynamic-file-management.md)** - File uploads
- **[Dynamic Redirects Strategy](dynamic-redirects-strategy.md)** - URL management

---

**Status:** 📖 Complete Guide  
**Current Phase:** ✅ Core Implementation Complete  
**Next Phase:** 🚧 Image Migration & Rich Editor  
**Last Updated:** October 5, 2025
