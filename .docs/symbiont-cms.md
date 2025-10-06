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

```bash
# .env
PUBLIC_NHOST_GRAPHQL_URL=https://your-project.nhost.run/v1/graphql
NOTION_API_KEY=secret_xxxxx
NOTION_BLOG_DATABASE_ID=xxxxx
NHOST_ADMIN_SECRET=xxxxx
```

### Step 5: Create Configuration

Create `symbiont.config.ts` in your project root:

```typescript
import { defineSymbiontConfig, type PageObjectResponse } from 'symbiont-cms';

const config = defineSymbiontConfig({
  databases: [
    {
      short_db_ID: 'my-blog',
      notionDatabaseIdEnvVar: 'NOTION_BLOG_DATABASE_ID',
      
      // When is a post published?
      isPublicRule: (page: PageObjectResponse) => {
        const status = page.properties.Status as { select: { name: string } | null };
        return status.select?.name === 'Published';
      },
      
      // Where does content come from?
      sourceOfTruthRule: () => 'NOTION',
      
      // Which property contains the slug?
      slugPropertyName: "Website Slug",
      
      // How to extract the slug?
      slugRule: (page: PageObjectResponse) => {
        const slugProperty = (page.properties["Website Slug"] as any)?.rich_text;
        return slugProperty?.[0]?.plain_text?.trim() || null;
      },
    },
  ],
});

export default config;
```

### Step 6: Create Sync Endpoint

```typescript
// src/routes/api/sync/poll-blog/+server.ts
export { handlePollBlogRequest as GET } from 'symbiont-cms/server';
```

### Step 7: Create Blog Routes

```typescript
// src/routes/blog/[slug]/+page.server.ts
export { blogLoad as load } from 'symbiont-cms/server';
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import { BlogPostPage } from 'symbiont-cms';
  import type { PageData } from './$types';
  
  export let data: PageData;
</script>

<BlogPostPage post={data.post} />
```

### Step 8: First Sync

```bash
# Trigger sync
curl http://localhost:5173/api/sync/poll-blog

# Visit your site
open http://localhost:5173/blog/your-first-post
```

---

## IV. Configuration

### Configuration Reference

```typescript
import { defineSymbiontConfig, type PageObjectResponse } from 'symbiont-cms';

const config = defineSymbiontConfig({
  databases: [
    {
      // Required: Unique identifier for this database
      short_db_ID: string;
      
      // Required: Name of env var containing Notion database ID
      notionDatabaseIdEnvVar: string;
      
      // Required: Function determining if a page should be published
      isPublicRule: (page: PageObjectResponse) => boolean;
      
      // Required: Where content comes from ('NOTION' or 'DATABASE')
      sourceOfTruthRule: (page: PageObjectResponse) => 'NOTION' | 'DATABASE';
      
      // Required: Name of Notion property containing the slug
      slugPropertyName: string;
      
      // Optional: Custom slug extraction logic
      slugRule?: (page: PageObjectResponse) => string | null;
      
      // Optional: Custom title extraction logic
      titleRule?: (page: PageObjectResponse) => string | null;
    }
  ]
});

export default config;
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PUBLIC_NHOST_GRAPHQL_URL` | ✅ Yes | Your Nhost GraphQL endpoint |
| `NOTION_API_KEY` | ✅ Yes | Notion integration secret |
| `NOTION_BLOG_DATABASE_ID` | ✅ Yes | Notion database ID to sync |
| `NHOST_ADMIN_SECRET` | ✅ Yes | Nhost admin secret for mutations |

### Configuration Loader

The `loadConfig()` function securely hydrates your configuration at runtime:

```typescript
import { loadConfig } from 'symbiont-cms/server';

const hydratedConfig = await loadConfig();
// Config now has actual database IDs from environment variables
```

**What it does:**
1. Reads your `symbiont.config.ts` file
2. Securely accesses environment variables on the server
3. "Hydrates" the configuration by injecting actual secret values
4. Returns fully assembled config for the sync service

**Security:** The hydrated config (with secrets) never leaves the server.

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

The package provides **two main entry points** to ensure server-only code doesn't get bundled in your client:

```
symbiont-cms
├── Client exports (import from 'symbiont-cms')
│   ├── <Renderer /> - Markdown to HTML
│   ├── <BlogPostPage /> - Complete blog post component
│   ├── <Editor /> - Tiptap editor (planned)
│   ├── GraphQL utilities (getPostBySlug, getAllPosts)
│   ├── Type definitions (Post, SymbiontConfig)
│   └── defineSymbiontConfig() helper
│
└── Server exports (import from 'symbiont-cms/server')
    ├── handlePollBlogRequest() - Manual sync handler
    ├── handleNotionWebhookRequest() - Webhook handler
    ├── syncFromNotion() - Core sync logic
    ├── loadConfig() - Config hydration
    ├── blogLoad() - Pre-built load function
    └── createBlogLoad() - Custom load factory
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

#### `<BlogPostPage />` - Complete Blog Post Component

Renders a complete blog post with built-in formatting:

```svelte
<script>
  import { BlogPostPage } from 'symbiont-cms';
  export let data;
</script>

<BlogPostPage 
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

Query your content directly:

```typescript
import { getAllPosts, getPostBySlug } from 'symbiont-cms';

// In +page.server.ts
export const load = async ({ params, fetch }) => {
  // Get all posts
  const posts = await getAllPosts(
    process.env.PUBLIC_NHOST_GRAPHQL_URL!,
    { fetch, limit: 10 }
  );
  
  // Or get specific post
  const post = await getPostBySlug(
    process.env.PUBLIC_NHOST_GRAPHQL_URL!,
    params.slug,
    { fetch }
  );
  
  return { posts, post };
};
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

#### Blog Load Functions

**Simple Usage:**
```typescript
// src/routes/blog/[slug]/+page.server.ts
export { blogLoad as load } from 'symbiont-cms/server';
// Automatically fetches post by slug from GraphQL
```

**Custom Usage:**
```typescript
import { createBlogLoad } from 'symbiont-cms/server';

export const load = createBlogLoad({
  graphqlEndpoint: process.env.PUBLIC_NHOST_GRAPHQL_URL!,
  formatPost: (post) => ({
    ...post,
    readingTime: calculateReadingTime(post.content)
  })
});
```

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
  Post,                    // Blog post type
  SymbiontConfig,          // Config type
  PageObjectResponse,      // Notion page type
  ClassMap,               // Styling type
  SyncSummary,            // Sync result type
  DatabaseBlueprint,      // Database config type
  HydratedDatabaseConfig, // Runtime config type
} from 'symbiont-cms';
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

### ✅ Implemented (Working Now)

- **Core Sync Engine**
  - ✅ Notion API integration
  - ✅ Page-to-Markdown processor
  - ✅ GraphQL mutations to Nhost
  - ✅ Configurable sync rules

- **Configuration System**
  - ✅ `symbiont.config.ts` definition
  - ✅ Type-safe config helper
  - ✅ Environment variable hydration
  - ✅ Multi-database support

- **UI Components**
  - ✅ `<Renderer />` with classMap styling
  - ✅ `<BlogPostPage />` complete component
  - ✅ SSR support
  - ✅ GraphQL client utilities

- **Server Utilities**
  - ✅ Pre-built sync handlers
  - ✅ Blog load functions
  - ✅ GraphQL query helpers
  - ✅ Type exports

### 🚧 In Progress

- **Image Migration**
  - 🚧 Download images during sync
  - 🚧 Upload to Nhost Storage
  - 🚧 Transform URLs in content
  - 📋 See: `image-optimization-strategy.md`

- **Rich Editor**
  - 🚧 Tiptap integration
  - 🚧 Direct database writes
  - 🚧 File upload support
  - 🚧 Real-time collaboration

### 🔮 Future Enhancements

- **Advanced Sync**
  - 🔮 Scheduled cron jobs
  - 🔮 Incremental sync (only changed pages)
  - 🔮 Conflict resolution
  - 🔮 Rollback/versioning

- **File Management**
  - 🔮 Admin UI for file browser
  - 🔮 Direct file uploads
  - 🔮 Asset deduplication
  - 📋 See: `dynamic-file-management.md`

- **Redirects**
  - 🔮 Database-driven redirects
  - 🔮 Auto-create on slug changes
  - 🔮 Analytics tracking
  - 📋 See: `dynamic-redirects-strategy.md`

- **Real-Time Collaboration**
  - 🔮 Hocuspocus server function
  - 🔮 Y.js CRDT for multiplayer editing
  - 🔮 Live cursor tracking

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
