# Hook-Based Config: Before & After Examples

This document shows side-by-side comparisons of the current config approach vs. the proposed hook-based approach.

## Example 1: Simple Blog

### Current (Property-Based)

```typescript
import { createSymbiontClient } from 'symbiont-cms';

export const symbiont = createSymbiontClient({
    supabase: {
        url: PUBLIC_SUPABASE_URL,
        publishableKey: PUBLIC_SUPABASE_ANON_KEY
    },
    databases: [{
        alias: 'blog',
        dataSourceId: NOTION_DATABASE_ID,
        
        // Inline function rules
        isPublicRule: (page) => page.properties.Public?.checkbox !== false,
        publishDateRule: (page) => page.properties['Publish Date']?.date?.start || page.last_edited_time,
        slugRule: (page) => page.properties.Slug?.rich_text?.[0]?.plain_text || null,
        
        // Property mappings
        tagsProperty: 'Tags',
        authorsProperty: 'Authors',
        summaryProperty: 'Summary'
    }]
});
```

### Proposed (Hook-Based)

```typescript
import { createSymbiontClient } from 'symbiont-cms';

export const symbiont = createSymbiontClient({
    supabase: {
        url: PUBLIC_SUPABASE_URL,
        publishableKey: PUBLIC_SUPABASE_ANON_KEY
    },
    databases: [{
        alias: 'blog',
        dataSourceId: NOTION_DATABASE_ID,
        
        // Hook-based customization
        hooks: [
            {
                name: 'blog:is-public',
                event: 'publish:check',
                priority: 40,
                fn: async (ctx) => ctx.page.properties.Public?.checkbox !== false
            },
            {
                name: 'blog:publish-date',
                event: 'publish:date',
                priority: 40,
                fn: async (ctx) => {
                    return ctx.page.properties['Publish Date']?.date?.start 
                        || ctx.page.last_edited_time;
                }
            },
            {
                name: 'blog:custom-slug',
                event: 'slug:extract',
                priority: 40,
                fn: async (ctx) => {
                    return ctx.page.properties.Slug?.rich_text?.[0]?.plain_text || null;
                }
            }
        ],
        
        // Property mappings (unchanged)
        tagsProperty: 'Tags',
        authorsProperty: 'Authors',
        summaryProperty: 'Summary'
    }]
});
```

**Analysis:**
- Slightly more verbose (explicit `name`, `event`, `priority`)
- More explicit about what each hook does
- Can easily add more hooks without changing API
- Default hooks still handle basic cases automatically

---

## Example 2: California Tech (Complex Date Logic)

### Current (30+ Lines in Config)

```typescript
export const symbiont = createSymbiontClient({
    supabase: { url, publishableKey },
    databases: [{
        alias: 'tech-article-staging',
        dataSourceId: NOTION_DATABASE_ID,
        
        // Complex inline logic - hard to test/reuse
        publishDateRule: (page) => {
            const issueProperty = page.properties.Issue?.select?.name;
            if (!issueProperty) {
                const websiteDate = page.properties['Website Publish Date']?.date?.start;
                if (websiteDate) {
                    return new Date(websiteDate).toISOString();
                }
                return page.last_edited_time;
            }
            
            // Parse "October 21, 2024" format
            const match = issueProperty.match(/(\w+)\s+(\d+),\s+(\d{4})/);
            if (match) {
                const [_, month, day, year] = match;
                const monthMap = {
                    January: 0, February: 1, March: 2, April: 3,
                    May: 4, June: 5, July: 6, August: 7,
                    September: 8, October: 9, November: 10, December: 11
                };
                const monthIndex = monthMap[month as keyof typeof monthMap];
                if (monthIndex !== undefined) {
                    const date = new Date(parseInt(year), monthIndex, parseInt(day));
                    return date.toISOString();
                }
            }
            
            return page.last_edited_time;
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

### Proposed (Extracted, Testable, Reusable)

```typescript
// src/lib/symbiont.ts
import { createSymbiontClient } from 'symbiont-cms';
import { calTechHooks } from './hooks/caltech.js';

export const symbiont = createSymbiontClient({
    supabase: { url, publishableKey },
    databases: [{
        alias: 'tech-article-staging',
        dataSourceId: NOTION_DATABASE_ID,
        
        // Clean config - logic extracted
        hooks: calTechHooks,
        
        tagsProperty: 'Tags',
        authorsProperty: 'Authors',
        summaryProperty: 'Summary'
    }]
});
```

```typescript
// src/lib/hooks/caltech.ts
import type { Hook } from 'symbiont-cms';
import { parseCalTechIssueDate } from './utils/date-parser.js';

export const calTechHooks: Hook[] = [
    {
        name: 'caltech:publish-date:issue-based',
        event: 'publish:date',
        priority: 40,
        fn: async (ctx) => {
            // Try Issue property first
            const issue = ctx.page.properties.Issue?.select?.name;
            if (issue) {
                const parsed = parseCalTechIssueDate(issue);
                if (parsed) return parsed;
            }
            
            // Try Website Publish Date
            const websiteDate = ctx.page.properties['Website Publish Date']?.date?.start;
            if (websiteDate) {
                return new Date(websiteDate).toISOString();
            }
            
            // Fall back to default hook
            ctx.skip();
            return null;
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
    }
];
```

```typescript
// src/lib/hooks/utils/date-parser.ts (testable utility)
export function parseCalTechIssueDate(issueText: string): string | null {
    // Parse "October 21, 2024" format
    const match = issueText.match(/(\w+)\s+(\d+),\s+(\d{4})/);
    if (!match) return null;
    
    const [_, month, day, year] = match;
    const monthMap = {
        January: 0, February: 1, March: 2, April: 3,
        May: 4, June: 5, July: 6, August: 7,
        September: 8, October: 9, November: 10, December: 11
    };
    
    const monthIndex = monthMap[month as keyof typeof monthMap];
    if (monthIndex === undefined) return null;
    
    const date = new Date(parseInt(year), monthIndex, parseInt(day));
    return date.toISOString();
}

// Easy to test in isolation!
```

**Benefits:**
- Logic extracted to separate, testable files
- Can write unit tests for `parseCalTechIssueDate`
- Hooks can be reused across multiple databases
- Config file is clean and readable
- Clear separation of concerns

---

## Example 3: Multi-Step Metadata Transformation

### Current (Limited)

```typescript
// Can only define ONE metadata extractor
export const symbiont = createSymbiontClient({
    databases: [{
        alias: 'blog',
        dataSourceId: NOTION_DATABASE_ID,
        
        metadataExtractor: (page) => {
            // Have to do everything in one function
            return {
                layout: page.properties.Layout?.select?.name,
                featured: page.properties.Featured?.checkbox,
                ogImage: page.properties.OGImage?.url,
                keywords: page.properties.Keywords?.multi_select?.map(s => s.name),
                // Can't easily compose or layer these
            };
        }
    }]
});
```

### Proposed (Composable)

```typescript
export const symbiont = createSymbiontClient({
    databases: [{
        alias: 'blog',
        dataSourceId: NOTION_DATABASE_ID,
        
        hooks: [
            // Step 1: Extract basic layout metadata
            {
                name: 'meta:layout',
                event: 'metadata:custom',
                priority: 30,
                fn: async (ctx) => ({
                    layout: ctx.page.properties.Layout?.select?.name || 'standard',
                    featured: ctx.page.properties.Featured?.checkbox || false
                })
            },
            
            // Step 2: Add SEO metadata
            {
                name: 'meta:seo',
                event: 'metadata:custom',
                priority: 40,
                fn: async (ctx) => ({
                    ...ctx.data,  // Preserve previous hooks' data
                    ogImage: ctx.page.properties.OGImage?.url,
                    keywords: ctx.page.properties.Keywords?.multi_select?.map(s => s.name)
                })
            },
            
            // Step 3: Compute derived metadata
            {
                name: 'meta:computed',
                event: 'metadata:custom',
                priority: 50,
                fn: async (ctx) => {
                    const content = await fetchContent(ctx.page.id);
                    return {
                        ...ctx.data,
                        wordCount: content.split(/\s+/).length,
                        readingTime: Math.ceil(content.split(/\s+/).length / 200)
                    };
                }
            }
        ]
    }]
});
```

**Benefits:**
- Can break complex logic into steps
- Each step has clear responsibility
- Can add/remove/reorder steps easily
- Can share steps across databases
- Previous hooks' data flows to next hooks

---

## Example 4: Conditional Processing

### Current (Awkward)

```typescript
// Have to handle all conditionals in one place
export const symbiont = createSymbiontClient({
    databases: [{
        alias: 'tech-staging',
        dataSourceId: NOTION_DATABASE_ID,
        
        isPublicRule: (page) => {
            // Complex conditional logic mixed together
            const status = page.properties.Status?.select?.name;
            const isStaging = process.env.NODE_ENV === 'staging';
            const hasWebsiteSlug = page.properties['Website Slug']?.rich_text?.length > 0;
            
            if (isStaging) {
                return status === 'Review' || status === 'Published';
            } else {
                return status === 'Published' && hasWebsiteSlug;
            }
        }
    }]
});
```

### Proposed (Clear Steps)

```typescript
export const symbiont = createSymbiontClient({
    databases: [{
        alias: 'tech-staging',
        dataSourceId: NOTION_DATABASE_ID,
        
        hooks: [
            // Check 1: Status must be appropriate
            {
                name: 'publish:check-status',
                event: 'publish:check',
                priority: 30,
                fn: async (ctx) => {
                    const status = ctx.page.properties.Status?.select?.name;
                    const isStaging = ctx.config.alias.includes('staging');
                    
                    if (isStaging) {
                        return status === 'Review' || status === 'Published';
                    }
                    return status === 'Published';
                }
            },
            
            // Check 2: Production requires website slug
            {
                name: 'publish:check-slug-required',
                event: 'publish:check',
                priority: 40,
                fn: async (ctx) => {
                    // If already failed previous checks, skip
                    if (!ctx.data) return false;
                    
                    const isProduction = !ctx.config.alias.includes('staging');
                    if (!isProduction) return ctx.data;
                    
                    // Production: require website slug
                    const hasSlug = ctx.page.properties['Website Slug']?.rich_text?.length > 0;
                    return ctx.data && hasSlug;
                }
            }
        ]
    }]
});
```

**Benefits:**
- Each check is isolated and testable
- Clear execution order
- Easy to add more checks
- Self-documenting (hook names explain logic)

---

## Example 5: Debugging Hooks

### Current (No Built-in Support)

```typescript
// Have to manually add logging everywhere
export const symbiont = createSymbiontClient({
    databases: [{
        alias: 'blog',
        dataSourceId: NOTION_DATABASE_ID,
        
        publishDateRule: (page) => {
            const date = page.properties.Date?.date?.start || page.last_edited_time;
            console.log('Publish date:', date);  // Manual logging
            return date;
        },
        
        slugRule: (page) => {
            const slug = page.properties.Slug?.rich_text?.[0]?.plain_text || null;
            console.log('Slug:', slug);  // Manual logging
            return slug;
        }
    }]
});
```

### Proposed (Built-in Debug Hooks)

```typescript
import { createSymbiontClient } from 'symbiont-cms';
import { devHooks } from 'symbiont-cms/dev';  // Debug utilities

export const symbiont = createSymbiontClient({
    databases: [{
        alias: 'blog',
        dataSourceId: NOTION_DATABASE_ID,
        
        hooks: [
            // Your hooks
            ...myCustomHooks,
            
            // Debug hooks (only in dev)
            ...(process.env.NODE_ENV === 'development' ? [
                devHooks.logAllProperties(),    // Priority 1: Log all Notion properties
                devHooks.validateImageUrls(),   // Priority 99: Check image URLs
                devHooks.measureHookTiming()    // Wrap all hooks with timing
            ] : [])
        ]
    }]
});
```

**Benefits:**
- Built-in debugging utilities
- Can enable/disable per environment
- Composable with other hooks
- No need to modify production code

---

## Example 6: Shared Hook Collections

### Current (Copy-Paste Between Projects)

```typescript
// In project A
export const symbiont = createSymbiontClient({
    databases: [{
        publishDateRule: (page) => {
            // Copy-paste this logic...
        }
    }]
});

// In project B (duplicate code)
export const symbiont = createSymbiontClient({
    databases: [{
        publishDateRule: (page) => {
            // ...into every project
        }
    }]
});
```

### Proposed (Shareable Packages)

```typescript
// Install shared hooks
// npm install @symbiont/hooks-common

import { createSymbiontClient } from 'symbiont-cms';
import { commonDateHooks, commonSlugHooks } from '@symbiont/hooks-common';

export const symbiont = createSymbiontClient({
    databases: [{
        alias: 'blog',
        dataSourceId: NOTION_DATABASE_ID,
        
        hooks: [
            ...commonDateHooks.flexibleDateExtraction(),
            ...commonSlugHooks.customPropertyWithFallback('Slug'),
            // Your custom hooks
            myCustomHook
        ]
    }]
});
```

**Benefits:**
- DRY: Don't repeat yourself
- Community can share hooks
- Versioned, tested, documented
- Easy to update across projects

---

## Summary: Key Differences

| Aspect | Current (Rules) | Proposed (Hooks) |
|--------|----------------|------------------|
| **Verbosity** | Minimal for simple cases | Slightly more verbose |
| **Composability** | One function per rule | Multiple hooks per event |
| **Testability** | Inline functions hard to test | Extracted hooks easy to test |
| **Reusability** | Copy-paste between projects | Package and share |
| **Extensibility** | Limited (can't add new events) | Clear extension points |
| **Debugging** | Manual logging | Built-in debug hooks |
| **Priority Control** | No control | Fine-grained priority system |
| **Documentation** | Function signature only | Named hooks self-document |
| **Migration Path** | N/A | Gradual (both work simultaneously) |

---

## When to Use Each Approach

### Use Current (Rules) When:
- Simple, one-line transformations
- Single database with basic needs
- Prototyping quickly
- Learning Symbiont

### Use Proposed (Hooks) When:
- Complex multi-step transformations
- Need to compose behavior from multiple sources
- Building reusable logic
- Multiple databases with shared logic
- Need fine control over execution order
- Want better debugging/observability
- Building plugins or extensions

---

## Migration Difficulty

**Easy Migrations:**
- Simple property extractors → Single hooks
- Basic date/slug rules → Direct translation

**Medium Migrations:**
- Complex conditional logic → Multiple hooks with priorities
- Metadata extraction → Composable hooks

**Complex Migrations:**
- Deep integration with existing code → May need refactoring
- Performance-critical paths → Need careful testing

**Estimated Time:**
- Small project (like guutz-blog): 1-2 hours
- Medium project (like california-tech): 3-5 hours
- Large project with many databases: 1-2 days

---

**Last Updated:** February 13, 2026
