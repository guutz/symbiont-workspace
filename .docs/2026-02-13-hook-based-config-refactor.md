# Memo: Hook-Based Config Refactor for Symbiont CMS

**Date:** February 13, 2026  
**Status:** Draft / Ideation  
**Author:** System Design

---

## 🎯 Executive Summary

This memo proposes a refactor of Symbiont CMS's configuration system from a property-based approach to a **hook-based architecture** inspired by WordPress's extensibility model. The goal is to maintain opinionated defaults while providing clear extension points for custom behavior.

**Key Changes:**
1. Replace inline function properties (`publishDateRule`, `slugRule`) with a formal hook system
2. Provide sensible defaults without requiring users to copy boilerplate
3. Enable multiple hooks per lifecycle event with priority ordering
4. Maintain strong TypeScript typing throughout

**Philosophy Shift:**
- **Current:** Opinionated config with narrow escape hatches
- **Proposed:** Opinionated defaults with clear, composable extension points

**Migration Note:**
- This is a breaking change for the workspace (only california-tech and guutz-blog use this)
- No backward compatibility layer needed - we'll migrate both packages directly
- Simpler implementation without legacy code maintenance

---

## 📍 Current State Analysis

### Current Configuration Structure

The `DatabaseBlueprint` interface currently defines several function properties that act as "rules":

```typescript
export interface DatabaseBlueprint {
    // Core identifiers
    alias: string;
    dataSourceId: string;
    
    // Publishing rules (inline functions)
    excludeRule?: (page: PageObjectResponse) => boolean;
    isPublicRule?: (page: PageObjectResponse) => boolean;
    publishDateRule?: (page: PageObjectResponse) => string | null;
    
    // Slug configuration
    slugRule?: (page: PageObjectResponse) => string | null;
    slugSyncProperty?: string | null;
    
    // Metadata mapping (property names)
    tagsProperty?: string | null;
    authorsProperty?: string | null;
    summaryProperty?: string | null;
    coverProperty?: string | null;
    
    // Flexible metadata (inline function)
    metadataExtractor?: (page: PageObjectResponse) => Record<string, any>;
    
    // Content source (union type or function)
    contentSourceRule?: 'NOTION' | 'WEB_EDITOR' | ((page: PageObjectResponse) => 'NOTION' | 'WEB_EDITOR');
}
```

### Current Usage Pattern

**California Tech Example:**
```typescript
export const symbiont = createSymbiontClient({
    supabase: { url, publishableKey },
    databases: [{
        alias: 'tech-article-staging',
        dataSourceId: NOTION_DATABASE_ID,
        
        publishDateRule: (page) => {
            // 30 lines of custom date parsing logic
            const issueProperty = page.properties.Issue?.select?.name;
            // ... complex parsing ...
            return constructedDate;
        },
        
        slugRule: (page) => {
            const slugProperty = page.properties['Website Slug']?.rich_text;
            return slugProperty?.[0]?.plain_text?.trim() || null;
        },
        
        tagsProperty: 'Tags',
        authorsProperty: 'Authors',
        summaryProperty: 'Summary'
    }]
});
```

### Current Pain Points

1. **No Hook Composition:** Can't run multiple transformations on the same data
2. **No Priority System:** Can't layer custom behavior over defaults
3. **Boilerplate Risk:** Complex logic (like California Tech's date parsing) must live in user config
4. **Limited Extensibility:** Hard to add new lifecycle events without config changes
5. **Property vs Function Inconsistency:** Some config uses property names (tagsProperty), others use functions (publishDateRule)

### What Works Well

1. **Type Safety:** TypeScript enforces function signatures clearly
2. **Simplicity:** For basic cases, inline functions are straightforward
3. **Flexibility:** Users can write arbitrary logic in their rules
4. **Sensible Defaults:** Most rules are optional with reasonable fallbacks

---

## 💡 Proposed Architecture: Hook-Based System

### Core Concept

Introduce a **hook registry** that allows:
- Multiple hooks per lifecycle event
- Priority-based execution order
- Default hooks shipped with Symbiont
- User hooks that can run before, after, or instead of defaults

### Hook Lifecycle Events

Based on the current `NotionPageToDatabasePageTransformer`, we can identify these lifecycle events.

**Note on naming:** Event names like `'publish:date'` or `'slug:extract'` are **built-in hook event types** that Symbiont defines. When you create a hook, you specify which event it responds to. The hook's `name` field (e.g., `'caltech:publish-date'`) is user-defined and helps identify your specific hook.

```typescript
// Lifecycle events in page transformation pipeline
// These are the EVENT TYPES you hook into (built-in, not user-defined)
type HookEvent = 
    // Early validation
    | 'page:exclude'          // Should page be excluded from sync?
    | 'page:validate'         // Is page data valid?
    
    // Metadata extraction (built-in events)
    | 'metadata:title'        // Extract/transform title
    | 'metadata:tags'         // Extract/transform tags
    | 'metadata:authors'      // Extract/transform authors  
    | 'metadata:summary'      // Extract/transform summary
    | 'metadata:custom'       // Extract custom metadata (user-defined data)
    
    // Publishing logic
    | 'publish:check'         // Should page be published?
    | 'publish:date'          // Determine publish date
    
    // Slug handling
    | 'slug:extract'          // Extract custom slug from Notion
    | 'slug:generate'         // Generate slug from title
    | 'slug:validate'         // Validate slug uniqueness
    | 'slug:transform'        // Transform slug (sanitization, etc.)
    
    // Content processing
    | 'content:fetch'         // Fetch page content
    | 'content:transform'     // Transform markdown content
    | 'content:images'        // Process inline images
    
    // Cover image
    | 'cover:extract'         // Extract cover image
    | 'cover:process'         // Upload/process cover image
    
    // Sync back to Notion
    | 'sync:slug'             // Sync slug back to Notion
    | 'sync:content'          // Sync content back to Notion
    | 'sync:images'           // Sync image URLs back to Notion
;
```

**Example to clarify naming:**
```typescript
// Event type: 'publish:date' (built-in, from HookEvent type)
// Hook name: 'caltech:publish-date' (user-defined, descriptive label)
{
    name: 'caltech:publish-date',  // YOUR name for this hook
    event: 'publish:date',          // Built-in event type it responds to
    priority: 40,
    fn: async (ctx) => { ... }
}
```

### Hook Function Signature

```typescript
type HookContext<T = any> = {
    page: PageObjectResponse;
    config: DatabaseBlueprint;
    data: T;  // Current state (title, slug, etc.)
    logger: Logger;
    abort: (reason: string) => void;  // Stop processing this page
    skip: () => void;  // Skip to next hook
};

type HookFunction<TInput = any, TOutput = any> = (
    context: HookContext<TInput>
) => Promise<TOutput> | TOutput;

type Hook<TInput = any, TOutput = any> = {
    name: string;
    event: HookEvent;
    priority: number;  // Lower runs first (default: 50)
    fn: HookFunction<TInput, TOutput>;
};
```

### Default Hooks (Shipped with Symbiont)

Symbiont ships with default hooks that implement current behavior. **These are automatically registered and well-documented** - users don't need to dig into source code to understand them.

**Default hooks will be documented in:**
1. Main API documentation with JSDoc comments
2. TypeScript IntelliSense (hover to see what each hook does)
3. Reference documentation listing all default hooks and their behavior

```typescript
// Built-in defaults (in symbiont-cms package)
// These are DOCUMENTED and exported for reference
const defaultHooks: Hook[] = [
    {
        name: 'symbiont:publish:check:default',
        event: 'publish:check',
        priority: 50,
        fn: async (ctx) => true  // Always publish by default
    },
    {
        name: 'symbiont:publish:date:default',
        event: 'publish:date',
        priority: 50,
        fn: async (ctx) => ctx.page.last_edited_time
    },
    {
        name: 'symbiont:slug:generate:default',
        event: 'slug:generate',
        priority: 50,
        fn: async (ctx) => createSlug(ctx.data.title)
    },
    {
        name: 'symbiont:metadata:title:default',
        event: 'metadata:title',
        priority: 50,
        fn: async (ctx) => getTitleProperty(ctx.page)
    },
    // ... more defaults (all documented in API reference)
];

// Exported for documentation and reference
export { defaultHooks };
```

These hooks are:
- **Automatically registered** when you create a client
- **Well-documented** in API docs and TypeScript hover tooltips
- **Overridable** by user hooks at the same or different priorities
- **Listed in reference docs** so you never have to dig into source

### User Configuration

Users register hooks in their config. For common cases, syntactic sugar properties may still be available:

```typescript
export const symbiont = createSymbiontClient({
    supabase: { url, publishableKey },
    databases: [{
        alias: 'tech-article-staging',
        dataSourceId: NOTION_DATABASE_ID,
        
        // Register custom hooks
        hooks: [
            {
                name: 'caltech:publish:date:issue-based',
                event: 'publish:date',  // Built-in event type
                priority: 40,  // Run before default
                fn: async (ctx) => {
                    const issue = ctx.page.properties.Issue?.select?.name;
                    if (!issue) {
                        // Fall through to default or next hook
                        return ctx.skip();
                    }
                    // Parse issue date
                    return parseIssueDate(issue);
                }
            },
            {
                name: 'caltech:slug:custom-property',
                event: 'slug:extract',  // Built-in event type
                priority: 40,
                fn: async (ctx) => {
                    const slug = ctx.page.properties['Website Slug']?.rich_text?.[0]?.plain_text;
                    return slug?.trim() || null;
                }
            },
            {
                name: 'caltech:metadata:layout',
                event: 'metadata:custom',  // Built-in event type
                priority: 50,
                fn: async (ctx) => {
                    return {
                        ...ctx.data,  // Preserve existing metadata
                        layout: ctx.page.properties.Layout?.select?.name || 'standard',
                        featured: ctx.page.properties.Featured?.checkbox || false
                    };
                }
            }
        ],
        
        // Option: Keep simple property mappings as syntactic sugar
        // These would internally generate hooks at appropriate priorities
        tagsProperty: 'Tags',          // Could generate metadata:tags hook
        authorsProperty: 'Authors',    // Could generate metadata:authors hook
        summaryProperty: 'Summary',    // Could generate metadata:summary hook
        coverProperty: 'Cover'         // Could generate cover:extract hook
    }]
});
```

### Hook Registry & Execution

The hook registry would handle:

```typescript
class HookRegistry {
    private hooks: Map<HookEvent, Hook[]> = new Map();
    
    register(hook: Hook): void {
        const existing = this.hooks.get(hook.event) || [];
        existing.push(hook);
        // Sort by priority (lower = earlier)
        existing.sort((a, b) => a.priority - b.priority);
        this.hooks.set(hook.event, existing);
    }
    
    async execute<TInput, TOutput>(
        event: HookEvent,
        context: HookContext<TInput>
    ): Promise<TOutput> {
        const hooks = this.hooks.get(event) || [];
        let result = context.data;
        
        for (const hook of hooks) {
            try {
                const output = await hook.fn({ ...context, data: result });
                
                // Handle special control flow
                if (context.aborted) {
                    throw new Error(`Hook aborted: ${context.abortReason}`);
                }
                if (context.skipped) {
                    context.skipped = false;
                    continue;  // Skip to next hook
                }
                
                // Update result for next hook
                result = output;
            } catch (error) {
                this.logger.error({
                    event: 'hook_execution_failed',
                    hookName: hook.name,
                    hookEvent: event,
                    error
                });
                // Continue to next hook or rethrow based on config
            }
        }
        
        return result;
    }
}
```

### Markdown Configuration as Hooks

The `MarkdownConfig` type could also become hooks:

**Current:**
```typescript
markdown: {
    toc: { enabled: true, minHeadingLevel: 2 },
    math: { enabled: true },
    extensions: { footnotes: true, gfm: true }
}
```

**Proposed:**
```typescript
hooks: [
    {
        name: 'markdown:toc',
        event: 'content:transform',
        priority: 30,  // Before main transform
        fn: async (ctx) => {
            return addTableOfContents(ctx.data, {
                minLevel: 2,
                maxLevel: 4
            });
        }
    },
    {
        name: 'markdown:math',
        event: 'content:transform',
        priority: 40,
        fn: async (ctx) => {
            return processMathBlocks(ctx.data);
        }
    },
    {
        name: 'markdown:render',
        event: 'content:transform',
        priority: 50,  // Main transform
        fn: async (ctx) => {
            return markdownIt.render(ctx.data);
        }
    }
]
```

However, this might be too granular. A **hybrid approach** could work better:

```typescript
databases: [{
    // ... other config ...
    
    // Keep markdown config for common cases
    markdown: {
        toc: { enabled: true },
        math: { enabled: true }
    },
    
    // But allow hooks for custom transforms
    hooks: [
        {
            name: 'custom:syntax-highlight',
            event: 'content:transform',
            priority: 45,  // Between TOC and main render
            fn: async (ctx) => {
                return addCustomSyntaxHighlighting(ctx.data);
            }
        }
    ]
}]
```

---

## 🔄 Symbiont's Version of "The Loop"

### Query API in Svelte Files

Inspired by WordPress's "The Loop" concept, Symbiont provides a simple, consistent way to query and display pages/posts in your Svelte components. **The hooks system doesn't change this** - it only affects how pages are transformed during sync from Notion to the database.

### Current Client API (Unchanged by Hooks)

The `SymbiontClient` provides two primary query methods:

```typescript
interface SymbiontClient {
    /** Fetch a single page by slug */
    getPageBySlug(slug: string, options?: GetPageOptions): Promise<WebsitePage | null>;
    
    /** Fetch all pages for a database */
    getAllPages(options?: GetAllPagesOptions): Promise<WebsitePage[]>;
    
    /** Direct access to Supabase client for advanced queries */
    supabase: SupabaseClient<Database>;
}

interface GetPageOptions {
    fetch?: typeof globalThis.fetch;  // For SSR
    alias?: string;                    // Database to query
}

interface GetAllPagesOptions {
    fetch?: typeof globalThis.fetch;
    limit?: number;
    offset?: number;
    alias?: string;
}
```

### Usage Patterns in SvelteKit

**Pattern 1: Single Page (Blog Post, Article)**

```typescript
// src/routes/blog/[slug]/+page.server.ts
import { symbiont } from '$lib/symbiont';

export async function load({ params, fetch }) {
    const page = await symbiont.getPageBySlug(params.slug, { fetch });
    
    if (!page) {
        throw error(404, 'Page not found');
    }
    
    return { page };
}
```

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
    export let data;
    const { page } = data;
</script>

<article>
    <h1>{page.title}</h1>
    <time>{page.publish_at}</time>
    {@html page.html}
</article>
```

**Pattern 2: Page List (Homepage, Archive)**

```typescript
// src/routes/+page.server.ts
import { symbiont } from '$lib/symbiont';

export async function load({ fetch, url }) {
    const query = url.searchParams.get('q') || '';
    const tag = url.searchParams.get('tag') || '';
    
    // Fetch pages (sorted by publish_at DESC by default)
    const allPages = await symbiont.getAllPages({ 
        fetch, 
        limit: 100 
    });
    
    // Filter in-memory (or use Supabase client for DB filtering)
    let pages = allPages;
    
    if (tag) {
        pages = pages.filter(p => p.tags?.includes(tag));
    }
    
    if (query) {
        pages = pages.filter(p => 
            p.title.toLowerCase().includes(query) ||
            p.summary?.toLowerCase().includes(query)
        );
    }
    
    return { 
        pages: pages.slice(0, 30),
        hasMore: pages.length > 30 
    };
}
```

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
    export let data;
    const { pages } = data;
</script>

{#each pages as page}
    <article>
        <h2><a href="/blog/{page.slug}">{page.title}</a></h2>
        <time>{page.publish_at}</time>
        <p>{page.summary}</p>
    </article>
{/each}
```

**Pattern 3: Advanced Queries (Using Supabase Client)**

For complex filtering, sorting, or searching, use the Supabase client directly:

```typescript
// src/routes/search/+page.server.ts
import { symbiont } from '$lib/symbiont';

export async function load({ fetch, url }) {
    const query = url.searchParams.get('q') || '';
    
    // Direct Supabase query for advanced filtering
    const { data: pages } = await symbiont.supabase
        .from('pages')
        .select('*')
        .eq('datasource_alias', 'blog')
        .not('publish_at', 'is', null)  // Only published
        .gte('publish_at', new Date().toISOString())  // Future posts
        .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)  // Full-text search
        .order('publish_at', { ascending: false })
        .limit(50);
    
    return { pages: pages || [] };
}
```

**Pattern 4: Client-Side Filtering (SPA-like Experience)**

California Tech example showing progressive enhancement:

```typescript
// src/routes/+page.server.ts - Initial SSR load
export async function load({ fetch }) {
    // Fast initial load: just 30 posts
    const pages = await symbiont.getAllPages({ fetch, limit: 30 });
    
    return { 
        pages,              // Initial posts for fast FCP
        initialOnly: true   // Flag that full data not loaded
    };
}
```

```svelte
<!-- src/routes/+page.svelte - Client-side enhancement -->
<script lang="ts">
    import { onMount } from 'svelte';
    export let data;
    
    let allPages = data.pages;
    let filtered = allPages;
    let searchQuery = '';
    
    onMount(async () => {
        if (data.initialOnly) {
            // Fetch full dataset in background
            const res = await fetch('/api/pages/preview');
            const previews = await res.json();
            allPages = previews;
            filtered = filterPages(allPages, searchQuery);
        }
    });
    
    function filterPages(pages, query) {
        if (!query) return pages;
        return pages.filter(p => 
            p.title.toLowerCase().includes(query.toLowerCase())
        );
    }
    
    $: filtered = filterPages(allPages, searchQuery);
</script>

<input bind:value={searchQuery} placeholder="Search..." />

{#each filtered as page}
    <article>
        <h2><a href="/blog/{page.slug}">{page.title}</a></h2>
    </article>
{/each}
```

### How Hooks Affect "The Loop"

**Key Point:** Hooks run during **sync** (Notion → Database), not during **query** (Database → Svelte).

```
┌─────────────────────────────────────────────────────────┐
│                   SYNC TIME (Hooks Run)                 │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Notion Page                                            │
│      ↓                                                  │
│  Hook: 'publish:date' (extract date)                    │
│      ↓                                                  │
│  Hook: 'slug:extract' (get slug)                        │
│      ↓                                                  │
│  Hook: 'metadata:custom' (extract metadata)             │
│      ↓                                                  │
│  Database Row (with transformed data)                   │
│                                                         │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│              QUERY TIME (No Hooks, Just SQL)            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  symbiont.getAllPages()                                 │
│      ↓                                                  │
│  SELECT * FROM pages WHERE ...                          │
│      ↓                                                  │
│  Array<WebsitePage> (already transformed)               │
│      ↓                                                  │
│  Svelte Component (display)                             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**What this means:**

1. **Hooks customize sync behavior** - e.g., California Tech's date parsing hook extracts publish dates from the "Issue" property during sync
2. **Query API stays the same** - `getAllPages()` and `getPageBySlug()` work exactly as before
3. **Pages are pre-transformed** - By the time you query them, hooks have already run, so you get clean, consistent data

### Future: Query Hooks (If Needed)

While hooks currently only run at sync time, we could add **query-time hooks** in the future:

```typescript
// Hypothetical future feature
databases: [{
    alias: 'blog',
    hooks: [
        // Sync-time hooks (existing)
        { name: 'sync:publish-date', event: 'publish:date', ... },
        
        // Query-time hooks (future)
        { 
            name: 'query:enrich-author', 
            event: 'query:post-process',  // Runs after DB query
            priority: 50,
            fn: async (ctx) => {
                // Enrich each page with live data
                ctx.data.pages = await Promise.all(
                    ctx.data.pages.map(async (page) => ({
                        ...page,
                        authorBio: await fetchAuthorBio(page.authors[0])
                    }))
                );
                return ctx.data;
            }
        }
    ]
}]
```

**However**, this is not part of the current design. For now, if you need to enrich query results:

```typescript
// Just do it in your load function
export async function load({ fetch }) {
    const pages = await symbiont.getAllPages({ fetch });
    
    // Enrich with live data
    const enriched = await Promise.all(
        pages.map(async (page) => ({
            ...page,
            authorBio: await fetchAuthorBio(page.authors[0])
        }))
    );
    
    return { pages: enriched };
}
```

### Summary: "The Loop" in Symbiont

**WordPress "The Loop":**
```php
<?php while (have_posts()) : the_post(); ?>
    <h2><?php the_title(); ?></h2>
    <?php the_content(); ?>
<?php endwhile; ?>
```

**Symbiont "The Loop":**
```typescript
// +page.server.ts
export async function load({ fetch }) {
    const pages = await symbiont.getAllPages({ fetch });
    return { pages };
}
```

```svelte
<!-- +page.svelte -->
{#each pages as page}
    <h2>{page.title}</h2>
    {@html page.html}
{/each}
```

**Key Differences:**
- WordPress: Hooks run at query time, can modify rendered output
- Symbiont: Hooks run at sync time, query returns pre-transformed data
- WordPress: Global state (`the_post()`, `the_title()`)
- Symbiont: Explicit data flow (TypeScript, props)

**Why this design?**
- **Performance**: Transform once during sync, not on every page view
- **Simplicity**: Queries are just SQL, no runtime transforms
- **Type Safety**: Pre-transformed data has known TypeScript types
- **Caching**: Static data can be cached aggressively (ISR, CDN)

---

## 🏗️ Implementation Strategy

### Single-Phase Implementation (Breaking Change)

**Goal:** Replace current config system with hooks

Since only california-tech and guutz-blog use Symbiont (both in this workspace), we can do a clean breaking change without backward compatibility.

**Steps:**

1. **Week 1-2:** Core hook infrastructure
   - Create `HookRegistry` class
   - Define hook types and lifecycle events
   - Implement default hooks for all current behavior

2. **Week 3-4:** Update page transformer
   - Modify `NotionPageToDatabasePageTransformer` to use hooks
   - Remove old rule-based logic
   - Ensure all default hooks cover existing functionality

3. **Week 5:** Update type definitions
   - Remove old rule properties from `DatabaseBlueprint`
   - Add `hooks: Hook[]` property
   - Update all TypeScript types

4. **Week 6-7:** Migrate workspace packages
   - Update california-tech to use hooks
   - Update guutz-blog to use hooks
   - Extract complex logic (like date parsing) to testable utilities

5. **Week 8:** Documentation and testing
   - Write comprehensive API documentation
   - Document all default hooks with examples
   - Add unit tests for hook system
   - Integration tests for both packages

**Result:** Clean hook-based API, no legacy code to maintain

---

## 🔄 Migration Path

### Converting Current Rules to Hooks

Since this is a breaking change for the workspace, we'll migrate both packages directly.

**Before (Current):**
```typescript
{
    publishDateRule: (page) => page.properties.Date?.date?.start || page.last_edited_time,
    slugRule: (page) => page.properties.Slug?.rich_text?.[0]?.plain_text || null,
    isPublicRule: (page) => page.properties.Public?.checkbox !== false
}
```

**After (Hooks):**
```typescript
{
    hooks: [
        {
            name: 'custom:publish-date',
            event: 'publish:date',
            priority: 40,
            fn: async (ctx) => {
                return ctx.page.properties.Date?.date?.start || ctx.page.last_edited_time;
            }
        },
        {
            name: 'custom:slug',
            event: 'slug:extract',
            priority: 40,
            fn: async (ctx) => {
                return ctx.page.properties.Slug?.rich_text?.[0]?.plain_text || null;
            }
        },
        {
            name: 'custom:is-public',
            event: 'publish:check',
            priority: 40,
            fn: async (ctx) => {
                return ctx.page.properties.Public?.checkbox !== false;
            }
        }
    ]
}
```

**No compatibility layer needed** - we migrate both packages at once.

---

## 🎨 Advanced Use Cases

### 1. Composable Metadata Extraction

**Current Problem:** Can't easily combine multiple metadata sources

**With Hooks:**
```typescript
hooks: [
    {
        name: 'meta:base',
        event: 'metadata:custom',
        priority: 30,
        fn: async (ctx) => ({
            layout: ctx.page.properties.Layout?.select?.name,
            featured: ctx.page.properties.Featured?.checkbox
        })
    },
    {
        name: 'meta:seo',
        event: 'metadata:custom',
        priority: 40,
        fn: async (ctx) => ({
            ...ctx.data,  // Preserve previous hooks
            ogImage: ctx.page.properties.OGImage?.url,
            keywords: ctx.page.properties.Keywords?.multi_select?.map(s => s.name)
        })
    },
    {
        name: 'meta:computed',
        event: 'metadata:custom',
        priority: 50,
        fn: async (ctx) => ({
            ...ctx.data,
            wordCount: countWords(ctx.page),
            readingTime: estimateReadingTime(ctx.page)
        })
    }
]
```

### 2. Conditional Processing

**Current Problem:** Hard to have complex conditional logic

**With Hooks:**
```typescript
hooks: [
    {
        name: 'caltech:conditional-processing',
        event: 'publish:check',
        priority: 30,
        fn: async (ctx) => {
            const status = ctx.page.properties.Status?.select?.name;
            const isStaging = ctx.config.alias.includes('staging');
            
            // Complex business logic
            if (isStaging) {
                return status === 'Review' || status === 'Published';
            } else {
                return status === 'Published';
            }
        }
    }
]
```

### 3. Logging & Debugging Hooks

**Built-in debugging:**
```typescript
hooks: [
    {
        name: 'debug:log-all-properties',
        event: 'metadata:custom',
        priority: 1,  // Run first
        fn: async (ctx) => {
            ctx.logger.debug({
                event: 'page_properties_dump',
                pageId: ctx.page.id,
                properties: Object.keys(ctx.page.properties)
            });
            return ctx.data;  // Pass through unchanged
        }
    }
]
```

### 4. External API Integration

**Access to database queries:**
```typescript
hooks: [
    {
        name: 'cms:fetch-author-bios',
        event: 'metadata:authors',
        priority: 60,  // After default author extraction
        fn: async (ctx) => {
            const authors = ctx.data;  // Array of author names from Notion
            
            // Option A: Include query helper in context
            // ctx.db could be a safe query proxy (not raw Supabase client)
            const enriched = await Promise.all(
                authors.map(async (name) => {
                    const bio = await ctx.db.query('author_bios', { name });
                    return { name, bio, avatar: bio.avatarUrl };
                })
            );
            
            return enriched;
        }
    }
]
```

**Note:** Direct Supabase client access is not recommended to avoid circular dependencies and N+1 query issues. A query proxy or helper could be provided if needed.

---

## 🔗 Hook Composition & Multi-Hook Behavior

### Understanding the Pipeline

When multiple hooks are registered for the same event, they execute in **priority order** (lower priority runs first). Each hook receives the **output of the previous hook** as `ctx.data`.

**Key insight:** The behavior depends on the hook's **return type**.

### Pattern 1: Single-Value Types (Last Hook Wins)

For hooks returning single values (Date, string, number), the **last non-skipped hook wins** by default.

```typescript
hooks: [
    {
        name: 'custom:date',
        event: 'publish:date',
        priority: 40,
        fn: async (ctx) => {
            const custom = ctx.page.properties.CustomDate?.date?.start;
            if (!custom) {
                return ctx.skip(); // ← Falls through to next hook
            }
            return new Date(custom);
        }
    },
    {
        name: 'default:date',
        event: 'publish:date',
        priority: 50,
        fn: async (ctx) => {
            return new Date(ctx.page.last_edited_time);
        }
    }
]
```

**Behavior:**
- If `CustomDate` exists: First hook returns date, second hook **overwrites** it
- If `CustomDate` is empty: First hook skips, second hook uses default

**To prevent overwrite:**
```typescript
fn: async (ctx) => {
    // Check if previous hook already set a value
    if (ctx.data) {
        return ctx.data; // Keep previous value
    }
    return new Date(ctx.page.last_edited_time);
}
```

### Pattern 2: Object Types (Explicit Merge)

For hooks returning objects (metadata, custom properties), **explicitly merge** using the spread operator:

```typescript
hooks: [
    {
        name: 'meta:layout',
        event: 'metadata:custom',
        priority: 30,
        fn: async (ctx) => ({
            layout: 'blog',
            featured: true
        })
    },
    {
        name: 'meta:seo',
        event: 'metadata:custom',
        priority: 40,
        fn: async (ctx) => ({
            ...ctx.data, // ← Preserve previous hooks' data
            ogImage: 'https://...',
            keywords: ['tag1']
        })
    }
]
```

**Result:** `{ layout: 'blog', featured: true, ogImage: 'https://...', keywords: ['tag1'] }`

**Without merging:** Second hook would return only `{ ogImage, keywords }` - losing layout and featured!

### Control Flow Methods

**`ctx.skip()`** - Skip current hook, pass `ctx.data` unchanged to next hook:
```typescript
fn: async (ctx) => {
    if (!canHandle(ctx.page)) {
        return ctx.skip(); // Next hook receives same data
    }
    return processPage(ctx.page);
}
```

**`ctx.abort(reason)`** - Stop all processing immediately:
```typescript
fn: async (ctx) => {
    if (isForbidden(ctx.page)) {
        ctx.abort('Forbidden content detected');
        return; // Throws error, stops all hooks
    }
    return processPage(ctx.page);
}
```

### Decision Tree

```
Is your return type a single value?
│
├─ YES → Last hook wins (unless you check ctx.data)
│   └─ Use skip() to fall through to next hook
│
└─ NO (returning object) → Explicitly merge
    └─ Always use { ...ctx.data, newFields }
```

### Best Practices

1. **Be explicit about merging:** Always use `...ctx.data` for object returns
2. **Document return types:** Add comments describing expected return type
3. **Use priority correctly:** Lower = earlier (custom logic), Higher = later (defaults/validation)
4. **Name hooks clearly:** Use format `category:action:variant`
5. **Test composition:** Verify behavior with multiple hooks

**For complete details, see:** `.docs/2026-02-13-HOOK_COMPOSITION_GUIDE.md`

---

## ⚖️ Tradeoffs & Considerations

### Pros

1. **Extensibility:** Clear extension points without modifying core
2. **Composition:** Multiple transformations can be chained
3. **Reusability:** Hooks can be packaged and shared
4. **Debugging:** Named hooks make logging clearer
5. **Priority Control:** Fine-grained control over execution order
6. **Defaults Included:** Users don't copy boilerplate
7. **Progressive Enhancement:** Start simple, add hooks as needed

### Cons

1. **More Boilerplate (for complex cases):** Hook objects are more verbose than inline functions
2. **Learning Curve:** Developers need to understand hook lifecycle and priorities
3. **Execution Model Complexity:** Priority system adds mental overhead
4. **Breaking Change:** Eventually requires migration
5. **Debugging Difficulty:** Stack traces might be harder to follow
6. **Performance:** Hook registry adds indirection (likely negligible)

### When to Use Hooks vs. Simple Config

**Use Hooks When:**
- Multiple transformations needed on same data
- Need to compose behavior from multiple sources
- Want to share/reuse logic across databases
- Need fine control over execution order
- Building plugins or extensions

**Use Simple Config When:**
- Simple property mappings (tagsProperty, authorsProperty)
- One-line transformations
- No composition needed
- Just starting out

### Comparison to WordPress

**WordPress "The Loop" Similarities:**
- Named hooks with priority system
- Default behavior that can be augmented
- Action hooks (side effects) vs. Filter hooks (transformations)
- Plugin ecosystem built on hooks

**Key Differences:**
- WordPress runs highest priority only (in some cases)
- Symbiont hooks are always async
- Symbiont has stronger typing
- Symbiont hooks are more granular (more events)

---

## 🚦 Decision Points

### 1. Hook Registration Style

**Decision: Option A (Array in Config)**

```typescript
databases: [{
    hooks: [
        { name: 'x', event: 'y', priority: 50, fn: ... }
    ]
}]
```

**Rationale:**
- Simple, all in one place
- Works great with imports: `hooks: [...myPluginHooks, customHook]`
- Type-safe and visible in config
- Imperative registration can be added later if needed

### 2. Hook vs. Property Config Split

**Decision: Option C (Properties Generate Hooks)**

Properties like `tagsProperty`, `authorsProperty` are syntactic sugar that internally generate hooks at appropriate priorities. Users can use either style or both together.

```typescript
databases: [{
    // Syntactic sugar (generates hooks internally)
    tagsProperty: 'Tags',          // → metadata:tags hook at priority 50
    authorsProperty: 'Authors',    // → metadata:authors hook at priority 50
    
    // Explicit hooks for complex cases
    hooks: [
        { name: 'custom:date', event: 'publish:date', priority: 40, fn: ... }
    ]
}]
```

**Rationale:**
- Best of both worlds: simple for common cases, powerful for complex cases
- Clear how properties translate to hooks (documented)
- Can gradually move toward pure hooks if desired

### 3. Default Hook Behavior

**Decision: Option A/C (Always Run Unless Disabled)**

Defaults always execute at priority 50. Users add hooks at different priorities to run before/after or override defaults.

**Rationale:**
- Most flexible approach
- Clear execution order
- No magic "check if user defined this" logic

### 4. Error Handling in Hooks

**Decision: Option A (Fail Fast)**

Hook error stops page processing. Page marked as failed in sync results.

**Rationale:**
- Safe default behavior
- Clear failure modes
- Can add `continueOnError` flag later if needed

### 5. Parallelization Strategy

**Decision: Parallelize at page level, not hook level**

All hooks for a single page run sequentially (data flows through), but multiple pages can be processed in parallel.

**Rationale:**
- Hooks need to compose (output → input)
- Sequential execution is simpler to reason about
- Page-level parallelization provides sufficient performance

### 6. Markdown Configuration

**Decision: Markdown uses hooks (with optional syntactic sugar)**

Markdown processing becomes hooks on `'content:transform'` event, but common cases can have syntactic sugar properties that generate hooks.

```typescript
databases: [{
    // Option 1: Syntactic sugar (generates hooks)
    markdown: {
        toc: { enabled: true },
        math: { enabled: true }
    },
    
    // Option 2: Explicit hooks for custom transforms
    hooks: [
        { name: 'custom:syntax-highlight', event: 'content:transform', 
          priority: 45, fn: ... }
    ]
}]
```

---

## 📊 Success Metrics

How to measure if this refactor is successful:

1. **Code Complexity:** Lines of config code in workspace packages (should decrease significantly)
2. **Testability:** Percentage of business logic covered by unit tests (should increase)
3. **Maintainability:** Time to add new customizations (should decrease)
4. **Documentation Clarity:** Can developers find default hook behavior without reading source? (yes/no)
5. **Performance:** Hook execution overhead (target: <5ms per page)
6. **Migration Success:** Both packages successfully using hooks with no regressions

---

## 🔮 Future Possibilities

### Plugin System

With hooks, a plugin system becomes feasible:

```typescript
import { SymbiontPlugin } from 'symbiont-cms';
import { authorEnrichmentPlugin } from 'symbiont-plugin-author-enrichment';
import { seoPlugin } from 'symbiont-plugin-seo';

export const symbiont = createSymbiontClient({
    supabase: { url, publishableKey },
    databases: [{
        alias: 'blog',
        dataSourceId: NOTION_DATABASE_ID,
        
        plugins: [
            authorEnrichmentPlugin({ apiKey: CLEARBIT_KEY }),
            seoPlugin({ generateOgImages: true })
        ]
    }]
});
```

### Hook Packages

Community-maintained hook collections:

```typescript
import { commonDateHooks } from '@symbiont/hooks-dates';
import { imageOptimizationHooks } from '@symbiont/hooks-images';

export const symbiont = createSymbiontClient({
    databases: [{
        hooks: [
            ...commonDateHooks,
            ...imageOptimizationHooks,
            // ... custom hooks
        ]
    }]
});
```

### Visual Hook Builder

A UI tool to build hook configurations:

```
┌─────────────────────────────────────────┐
│ Symbiont Hook Builder                   │
├─────────────────────────────────────────┤
│ Event: publish:date         Priority: 40│
│                                          │
│ [Extract from property ▼]               │
│   Property: "Published Date"            │
│   Fallback: [Use last_edited_time ▼]   │
│                                          │
│ [ Generate Code ]  [ Test Hook ]        │
└─────────────────────────────────────────┘
```

### Development Mode Hooks

Built-in hooks for debugging:

```typescript
import { devHooks } from 'symbiont-cms/dev';

// Automatically enabled in development
if (process.env.NODE_ENV === 'development') {
    databases[0].hooks.push(
        devHooks.logAllProperties(),
        devHooks.validateImageUrls(),
        devHooks.checkSlugCollisions()
    );
}
```

---

## 📝 Resolved Questions

Based on feedback, these questions have been resolved:

1. **Should hooks be able to call other hooks?**
   - **Decision:** No, not needed. Hooks compose through data flow.

2. **Should there be "action" hooks (side effects only) vs. "filter" hooks (transformations)?**
   - **Decision:** Not for now. All hooks are filter hooks (transformations). Can revisit if use cases emerge.

3. **How to handle async dependencies between hooks?**
   - **Decision:** All hooks are async and run sequentially per page. Parallelization happens at page level.

4. **Should hook context include access to Supabase client?**
   - **Decision:** No direct Supabase access (avoid circular dependencies). Could provide query proxy if needed.

5. **How to version hooks?**
   - **Decision:** Not needed while in development. Can address later if plugin ecosystem emerges.

6. **Should markdown config become hooks or stay separate?**
   - **Decision:** Markdown uses hooks with optional syntactic sugar for common cases.

---

## 🎯 Updated Recommendation

**Proceed with single-phase breaking change:**

1. Build complete hook infrastructure
2. Remove old rule-based config
3. Migrate california-tech and guutz-blog
4. Document all default hooks thoroughly
5. Add syntactic sugar properties that generate hooks

**Timeline:**
- **Week 1-2:** Core hook registry and types
- **Week 3-4:** Update page transformer
- **Week 5:** Update type definitions
- **Week 6-7:** Migrate both workspace packages
- **Week 8:** Documentation and testing

**Success Criteria:**
- Clean hook-based API
- No legacy code to maintain
- Clear documentation of all default hooks
- Both packages successfully migrated
- Complex logic extracted to testable utilities

---

## 📚 References

**Related Documentation:**
- **Hook Composition Guide:** `.docs/2026-02-13-HOOK_COMPOSITION_GUIDE.md` (Understanding multi-hook behavior)
- **Hook Config Examples:** `.docs/examples/hook-config-comparison.md` (Before/after examples)
- **Hook System POC:** `.docs/examples/hook-system-poc.ts` (Working implementation)
- **Hook Architecture:** `.docs/examples/hook-architecture-diagrams.md` (Visual diagrams)
- **Executive Summary:** `.docs/2026-02-13-hook-refactor-executive-summary.md` (TL;DR version)

**Code References:**
- Current DatabaseBlueprint: `packages/symbiont-cms/src/lib/types.ts`
- Page Transformer: `packages/symbiont-cms/src/lib/server/notion/page-transformer.ts`
- Sync Coordinator: `packages/symbiont-cms/src/lib/server/sync/notion-to-database-sync.ts`

**External References:**
- WordPress Plugin API: https://developer.wordpress.org/plugins/hooks/
- SvelteKit Hooks: https://kit.svelte.dev/docs/hooks (similar pattern)

---

## Appendix A: Complete Type Definitions

```typescript
// Hook system types
export type HookEvent = 
    | 'page:exclude'
    | 'page:validate'
    | 'metadata:title'
    | 'metadata:tags'
    | 'metadata:authors'
    | 'metadata:summary'
    | 'metadata:custom'
    | 'publish:check'
    | 'publish:date'
    | 'slug:extract'
    | 'slug:generate'
    | 'slug:validate'
    | 'slug:transform'
    | 'content:fetch'
    | 'content:transform'
    | 'content:images'
    | 'cover:extract'
    | 'cover:process'
    | 'sync:slug'
    | 'sync:content'
    | 'sync:images';

export type HookContext<T = any> = {
    page: PageObjectResponse;
    config: DatabaseBlueprint;
    data: T;
    logger: Logger;
    supabase?: SupabaseClient;  // Optional for advanced use cases
    abort: (reason: string) => void;
    skip: () => void;
};

export type HookFunction<TInput = any, TOutput = any> = (
    context: HookContext<TInput>
) => Promise<TOutput> | TOutput;

export interface Hook<TInput = any, TOutput = any> {
    name: string;
    event: HookEvent;
    priority?: number;  // Default: 50
    continueOnError?: boolean;  // Default: false
    fn: HookFunction<TInput, TOutput>;
}

// Updated DatabaseBlueprint (Phase 1: additive)
export interface DatabaseBlueprint {
    // ... existing properties ...
    
    // NEW: Hook registration
    hooks?: Hook[];
    
    // OLD: These still work but are deprecated
    /** @deprecated Use hooks with event 'page:exclude' instead */
    excludeRule?: (page: PageObjectResponse) => boolean;
    
    /** @deprecated Use hooks with event 'publish:check' instead */
    isPublicRule?: (page: PageObjectResponse) => boolean;
    
    /** @deprecated Use hooks with event 'publish:date' instead */
    publishDateRule?: (page: PageObjectResponse) => string | null;
    
    /** @deprecated Use hooks with event 'slug:extract' instead */
    slugRule?: (page: PageObjectResponse) => string | null;
    
    /** @deprecated Use hooks with event 'metadata:custom' instead */
    metadataExtractor?: (page: PageObjectResponse) => Record<string, any>;
}

// Hook registry
export class HookRegistry {
    private hooks: Map<HookEvent, Hook[]> = new Map();
    private logger: Logger;
    
    constructor(logger: Logger) {
        this.logger = logger;
    }
    
    register(hook: Hook): void;
    register(event: HookEvent, hook: Omit<Hook, 'event'>): void;
    
    unregister(hookName: string): void;
    
    async execute<TInput, TOutput>(
        event: HookEvent,
        context: Omit<HookContext<TInput>, 'abort' | 'skip'>
    ): Promise<TOutput>;
    
    getHooks(event: HookEvent): Hook[];
    
    clear(): void;
}
```

## Appendix B: California Tech Migration Example

**Before:**
```typescript
// packages/california-tech/src/lib/symbiont.ts
export const symbiont = createSymbiontClient({
    supabase: {
        url: PUBLIC_SUPABASE_URL,
        publishableKey: PUBLIC_SUPABASE_ANON_KEY
    },
    databases: [
        {
            alias: 'tech-article-staging',
            dataSourceId: NOTION_DATABASE_ID,
            publishDateRule: (page) => {
                const issueProperty = page.properties.Issue?.select?.name;
                if (!issueProperty) {
                    const websiteDate = page.properties['Website Publish Date']?.date?.start;
                    if (websiteDate) {
                        return new Date(websiteDate).toISOString();
                    }
                    return page.last_edited_time;
                }
                // ... 20 more lines of date parsing ...
            },
            slugRule: (page) => {
                const slugProperty = page.properties['Website Slug']?.rich_text;
                return slugProperty?.[0]?.plain_text?.trim() || null;
            },
            tagsProperty: 'Tags',
            authorsProperty: 'Authors',
            summaryProperty: 'Summary'
        }
    ]
});
```

**After:**
```typescript
// packages/california-tech/src/lib/symbiont.ts
import { createSymbiontClient } from 'symbiont-cms';
import { calTechHooks } from './hooks/caltech-hooks.js';

export const symbiont = createSymbiontClient({
    supabase: {
        url: PUBLIC_SUPABASE_URL,
        publishableKey: PUBLIC_SUPABASE_ANON_KEY
    },
    databases: [
        {
            alias: 'tech-article-staging',
            dataSourceId: NOTION_DATABASE_ID,
            
            // Use extracted hooks
            hooks: calTechHooks,
            
            // Simple mappings stay the same
            tagsProperty: 'Tags',
            authorsProperty: 'Authors',
            summaryProperty: 'Summary'
        }
    ]
});
```

**Extracted hooks file:**
```typescript
// packages/california-tech/src/lib/hooks/caltech-hooks.ts
import type { Hook } from 'symbiont-cms';
import { parseCalTechIssueDate } from './utils/date-parser.js';

export const calTechHooks: Hook[] = [
    {
        name: 'caltech:publish-date:issue-based',
        event: 'publish:date',
        priority: 40,  // Before default
        fn: async (ctx) => {
            // Try issue property first
            const issue = ctx.page.properties.Issue?.select?.name;
            if (issue) {
                return parseCalTechIssueDate(issue);
            }
            
            // Try website publish date
            const websiteDate = ctx.page.properties['Website Publish Date']?.date?.start;
            if (websiteDate) {
                return new Date(websiteDate).toISOString();
            }
            
            // Fall back to default (last_edited_time)
            return ctx.skip();
        }
    },
    
    {
        name: 'caltech:slug:custom-property',
        event: 'slug:extract',
        priority: 40,
        fn: async (ctx) => {
            const slugProperty = ctx.page.properties['Website Slug']?.rich_text;
            return slugProperty?.[0]?.plain_text?.trim() || null;
        }
    },
    
    {
        name: 'caltech:metadata:layout',
        event: 'metadata:custom',
        priority: 50,
        fn: async (ctx) => ({
            ...ctx.data,
            layout: ctx.page.properties.Layout?.select?.name || 'standard',
            featured: ctx.page.properties.Featured?.checkbox || false,
            issueNumber: ctx.page.properties.Issue?.select?.name
        })
    }
];
```

---

**End of Memo**
