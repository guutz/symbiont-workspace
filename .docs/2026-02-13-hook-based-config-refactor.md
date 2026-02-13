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

Based on the current `NotionPageToDatabasePageTransformer`, we can identify these lifecycle events:

```typescript
// Lifecycle events in page transformation pipeline
type HookEvent = 
    // Early validation
    | 'page:exclude'          // Should page be excluded from sync?
    | 'page:validate'         // Is page data valid?
    
    // Metadata extraction
    | 'metadata:title'        // Extract/transform title
    | 'metadata:tags'         // Extract/transform tags
    | 'metadata:authors'      // Extract/transform authors  
    | 'metadata:summary'      // Extract/transform summary
    | 'metadata:custom'       // Extract custom metadata
    
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

Symbiont would ship with default hooks that implement current behavior:

```typescript
// Built-in defaults (in symbiont-cms package)
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
    // ... more defaults
];
```

These hooks would be registered automatically but could be:
- **Overridden** by user hooks at the same priority
- **Augmented** by user hooks at different priorities
- **Disabled** explicitly if needed

### User Configuration

Users register hooks in their config:

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
                event: 'publish:date',
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
                event: 'slug:extract',
                priority: 40,
                fn: async (ctx) => {
                    const slug = ctx.page.properties['Website Slug']?.rich_text?.[0]?.plain_text;
                    return slug?.trim() || null;
                }
            },
            {
                name: 'caltech:metadata:layout',
                event: 'metadata:custom',
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
        
        // Simplified property mappings (still supported)
        tagsProperty: 'Tags',
        authorsProperty: 'Authors',
        summaryProperty: 'Summary',
        coverProperty: 'Cover'
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

## 🏗️ Implementation Strategy

### Phase 1: Hook Infrastructure (Non-Breaking)

**Goal:** Add hook system alongside existing config

1. Create `HookRegistry` class
2. Define hook types and lifecycle events
3. Implement default hooks that mirror current behavior
4. Update `NotionPageToDatabasePageTransformer` to use hooks internally
5. Add `hooks: Hook[]` property to `DatabaseBlueprint` (optional)

**Result:** Both old and new systems work simultaneously

### Phase 2: Documentation & Examples (Non-Breaking)

**Goal:** Show developers the new way

1. Add hook examples to documentation
2. Create migration guide for common patterns
3. Update California Tech and Guutz Blog to use hooks (as examples)
4. Add hook debugging/logging utilities

**Result:** Developers can start using hooks

### Phase 3: Deprecation Warnings (Semi-Breaking)

**Goal:** Signal the change

1. Add deprecation warnings for old-style rules
2. Auto-convert old rules to hooks internally
3. Update all internal tests to use hooks

**Result:** Old code still works but warns

### Phase 4: Breaking Change (v2.0.0)

**Goal:** Clean up API

1. Remove old rule properties
2. Remove auto-conversion layer
3. Hooks are the only way

**Result:** Clean, consistent API

---

## 🔄 Migration Path

### Converting Current Rules to Hooks

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

### Compatibility Layer (Phase 1-3)

During transition, provide auto-conversion:

```typescript
function convertLegacyRulesToHooks(blueprint: DatabaseBlueprint): Hook[] {
    const hooks: Hook[] = [];
    
    if (blueprint.publishDateRule) {
        hooks.push({
            name: '__legacy__:publish-date',
            event: 'publish:date',
            priority: 40,  // Override default
            fn: async (ctx) => blueprint.publishDateRule!(ctx.page)
        });
    }
    
    if (blueprint.slugRule) {
        hooks.push({
            name: '__legacy__:slug',
            event: 'slug:extract',
            priority: 40,
            fn: async (ctx) => blueprint.slugRule!(ctx.page)
        });
    }
    
    // ... etc
    
    return hooks;
}
```

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

**Fetch data from external sources:**
```typescript
hooks: [
    {
        name: 'cms:fetch-author-bios',
        event: 'metadata:authors',
        priority: 60,  // After default author extraction
        fn: async (ctx) => {
            const authors = ctx.data;  // Array of author names from Notion
            
            // Enrich with external data
            const enriched = await Promise.all(
                authors.map(async (name) => {
                    const bio = await fetchAuthorBio(name);
                    return { name, bio, avatar: bio.avatarUrl };
                })
            );
            
            return enriched;
        }
    }
]
```

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

**Option A: Array in Config (Proposed)**
```typescript
databases: [{
    hooks: [
        { name: 'x', event: 'y', priority: 50, fn: ... }
    ]
}]
```
**Pros:** Simple, all in one place  
**Cons:** Can't register hooks dynamically

**Option B: Imperative Registration**
```typescript
const client = createSymbiontClient({ ... });
client.hooks.register('publish:date', { name: 'x', priority: 50, fn: ... });
```
**Pros:** Dynamic registration, plugin system possible  
**Cons:** Hooks not visible in config, harder to type-check

**Recommendation:** Start with Option A, add Option B later if needed

### 2. Hook vs. Property Config Split

**Option A: Hooks for Everything (Pure)**
- All customization through hooks
- Remove property-based config entirely

**Option B: Hybrid (Proposed)**
- Keep property mappings for simple cases (tagsProperty)
- Use hooks for complex transformations
- Gradually migrate properties to hooks

**Option C: Properties Generate Hooks**
- Properties are syntactic sugar that generate hooks internally
- Users can use either style

**Recommendation:** Option B (Hybrid) for Phase 1, move toward Option A in v2.0

### 3. Default Hook Behavior

**Option A: Always Run Unless Disabled**
- Defaults always execute
- Users add higher priority hooks to override

**Option B: Optional Defaults**
- Defaults only run if no user hooks for that event
- Simpler execution model

**Option C: Explicit Disable Required**
- Defaults run unless explicitly disabled
- Clear intent, more config

**Recommendation:** Option A (Always Run) - most flexible

### 4. Error Handling in Hooks

**Option A: Fail Fast (Proposed)**
- Hook error stops page processing
- Page marked as failed in sync results

**Option B: Continue on Error**
- Log error but continue to next hook
- Page processed with partial data

**Option C: Configurable**
- Hook can specify `continueOnError: true/false`

**Recommendation:** Option A (Fail Fast) for safety, add Option C later

---

## 📊 Success Metrics

How to measure if this refactor is successful:

1. **Adoption Rate:** % of new projects using hooks vs. old rules
2. **Code Complexity:** Lines of config code in user projects (should decrease)
3. **Issue Reports:** Reduction in "how do I customize X?" issues
4. **Community Contributions:** Number of shared hooks/plugins
5. **Migration Smoothness:** Number of breaking issues during migration
6. **Performance:** Hook execution overhead (target: <5ms per page)

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

## 📝 Open Questions

1. **Should hooks be able to call other hooks?**
   - Pro: More composition options
   - Con: Complexity, circular dependency risk

2. **Should there be "action" hooks (side effects only) vs. "filter" hooks (transformations)?**
   - WordPress distinguishes these
   - Could simplify reasoning about hook behavior

3. **How to handle async dependencies between hooks?**
   - Some hooks might need to wait for external API calls
   - Need to manage parallel execution carefully

4. **Should hook context include access to Supabase client?**
   - Enables hooks to query database
   - Could lead to N+1 query problems

5. **How to version hooks?**
   - If hook signatures change, how do we handle compatibility?
   - Semver for hooks? Plugin API versioning?

6. **Should markdown config become hooks or stay separate?**
   - Markdown is common enough that dedicated config might be clearer
   - But hooks would be more consistent

---

## 🎯 Recommendation

**Proceed with Phase 1 implementation:**

1. Build hook infrastructure as non-breaking addition
2. Convert internal logic to use hooks
3. Maintain backward compatibility with current API
4. Document hook patterns thoroughly
5. Migrate california-tech and guutz-blog as examples

**Timeline:**
- **Week 1-2:** Core hook registry and types
- **Week 3-4:** Convert page transformer to use hooks internally
- **Week 5:** Documentation and migration guides
- **Week 6-7:** Migrate example projects
- **Week 8+:** Community feedback and iteration

**Success Criteria:**
- Both old and new APIs work
- No performance regression
- Documentation is clear
- Example migrations are trivial
- Developer feedback is positive

---

## 📚 References

- Current DatabaseBlueprint: `packages/symbiont-cms/src/lib/types.ts`
- Page Transformer: `packages/symbiont-cms/src/lib/server/notion/page-transformer.ts`
- Sync Coordinator: `packages/symbiont-cms/src/lib/server/sync/notion-to-database-sync.ts`
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
