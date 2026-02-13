# Hook-Based Config Refactor: Executive Summary

**Date:** February 13, 2026  
**Status:** Proposal / RFC  
**Related Documents:**
- Main Memo: `.docs/2026-02-13-hook-based-config-refactor.md`
- **Composition Guide:** `.docs/2026-02-13-HOOK_COMPOSITION_GUIDE.md` (Understanding multi-hook behavior)
- **Quick Reference:** `.docs/examples/hook-composition-quick-ref.md` (Decision matrix & patterns)
- Proof of Concept: `.docs/examples/hook-system-poc.ts`
- Comparisons: `.docs/examples/hook-config-comparison.md`
- Diagrams: `.docs/examples/hook-architecture-diagrams.md`

---

## TL;DR

**Problem:** Config system is opinionated but inflexible. Complex logic (30+ lines) must live inline in config files. Cannot test, reuse, or compose transformations.

**Solution:** Hook system with named hooks, priority ordering, and composability. Default hooks ship with Symbiont (clearly documented). User hooks can augment or override defaults.

**Migration:** Single-phase breaking change. Only california-tech and guutz-blog use this, both in workspace.

**Timeline:** 8 weeks total for implementation and migration.

---

## The Problem (With Example)

### California Tech: 30 Lines of Date Logic in Config

```typescript
// Current: src/lib/symbiont.ts
export const symbiont = createSymbiontClient({
    databases: [{
        alias: 'tech-article-staging',
        dataSourceId: NOTION_DATABASE_ID,
        
        // 😰 30+ lines of complex logic in config file
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
        }
    }]
});
```

**Issues:**
- ❌ Cannot unit test this logic
- ❌ Cannot reuse across projects
- ❌ Cannot compose multiple transformations
- ❌ Hard to debug (no logging hooks)
- ❌ Config file is 80+ lines

---

## The Solution

### Extract, Compose, Test

```typescript
// 1. Clean config file (src/lib/symbiont.ts)
import { calTechHooks } from './hooks/caltech.js';

export const symbiont = createSymbiontClient({
    databases: [{
        alias: 'tech-article-staging',
        dataSourceId: NOTION_DATABASE_ID,
        hooks: calTechHooks  // 🎉 Clean!
    }]
});
```

```typescript
// 2. Extracted hooks (src/lib/hooks/caltech.ts)
import { parseCalTechIssueDate } from './utils/date-parser.js';

export const calTechHooks: Hook[] = [
    {
        name: 'caltech:publish-date:issue-based',
        event: 'publish:date',
        priority: 40,
        fn: async (ctx) => {
            // Try Issue property
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
    }
];
```

```typescript
// 3. Testable utility (src/lib/hooks/utils/date-parser.ts)
export function parseCalTechIssueDate(issueText: string): string | null {
    // All the complex parsing logic
    // ✅ Unit testable!
    return date.toISOString();
}

// 4. Tests (src/lib/hooks/utils/date-parser.test.ts)
describe('parseCalTechIssueDate', () => {
    it('parses October 21, 2024', () => {
        expect(parseCalTechIssueDate('October 21, 2024'))
            .toBe('2024-10-21T00:00:00.000Z');
    });
});
```

**Benefits:**
- ✅ Config file is 10 lines (was 80+)
- ✅ Logic is extracted and testable
- ✅ Can reuse `parseCalTechIssueDate` anywhere
- ✅ Can add debug hooks
- ✅ Can compose multiple transformations
- ✅ Clear separation of concerns

---

## Key Features

### 1. Multiple Hooks Per Event

```typescript
hooks: [
    { name: 'meta:layout', event: 'metadata:custom', priority: 30, fn: ... },
    { name: 'meta:seo', event: 'metadata:custom', priority: 40, fn: ... },
    { name: 'meta:computed', event: 'metadata:custom', priority: 50, fn: ... }
]
```

Data flows through hooks in priority order. Each hook receives previous hook's output.

### 2. Priority Control

```typescript
Priority 30: Run early (preprocessing)
Priority 40: Custom logic (before defaults)
Priority 50: Default hooks (shipped with Symbiont)
Priority 60: Post-processing
Priority 99: Validation/debugging
```

### 3. Default Hooks (Well-Documented)

Symbiont ships with default hooks for common cases. **These are thoroughly documented** so users never need to dig into source code.

```typescript
// Built into symbiont-cms package and DOCUMENTED
const defaultHooks = [
    { name: 'symbiont:publish:check:default', event: 'publish:check', 
      priority: 50, fn: async (ctx) => true },
    { name: 'symbiont:publish:date:default', event: 'publish:date',
      priority: 50, fn: async (ctx) => ctx.page.last_edited_time },
    { name: 'symbiont:slug:generate:default', event: 'slug:generate',
      priority: 50, fn: async (ctx) => createSlug(ctx.data.title) }
];
```

Documentation includes:
- API reference with all default hooks listed
- TypeScript IntelliSense tooltips
- Example overrides for common customizations

Users only define hooks when they need custom behavior.

### 4. Control Flow

```typescript
// Skip to next hook
ctx.skip();  

// Abort entire page processing
ctx.abort('Invalid data');
```

### 5. Debugging

```typescript
import { devHooks } from 'symbiont-cms/dev';

hooks: [
    ...myHooks,
    ...(process.env.NODE_ENV === 'development' ? [
        devHooks.logAllProperties(),    // Log everything
        devHooks.validateImageUrls(),   // Check images
        devHooks.measureHookTiming()    // Performance
    ] : [])
]
```

---

## Hook Lifecycle Events

20+ events covering the entire transformation pipeline.

**Important:** Event names like `'publish:date'` are **built-in event types** defined by Symbiont. Your hook's `name` field (e.g., `'caltech:publish-date'`) is user-defined.

```typescript
// Early validation (built-in event types)
'page:exclude'          // Should page be excluded from sync?
'page:validate'         // Is page data valid?

// Metadata extraction (built-in event types)
'metadata:title'        // Extract/transform title
'metadata:tags'         // Extract/transform tags
'metadata:authors'      // Extract/transform authors
'metadata:summary'      // Extract/transform summary
'metadata:custom'       // Extract custom metadata (your data structure)

// Publishing logic (built-in event types)
'publish:check'         // Should page be published?
'publish:date'          // Determine publish date

// Slug handling (built-in event types)
'slug:extract'          // Extract custom slug from Notion
'slug:generate'         // Generate slug from title
'slug:validate'         // Validate slug uniqueness
'slug:transform'        // Transform slug (sanitization)

// Content processing (built-in event types)
'content:fetch'         // Fetch page content
'content:transform'     // Transform markdown content
'content:images'        // Process inline images

// Cover image (built-in event types)
'cover:extract'         // Extract cover image
'cover:process'         // Upload/process cover image

// Sync back to Notion (built-in event types)
'sync:slug'             // Sync slug back to Notion
'sync:content'          // Sync content back to Notion
'sync:images'           // Sync image URLs back to Notion
```

**Example:**
```typescript
{
    name: 'my-custom-date-hook',  // Your name (user-defined)
    event: 'publish:date',         // Built-in event type
    priority: 40,
    fn: async (ctx) => { ... }
}
```

---

## Migration Strategy

### Single-Phase Breaking Change (8 weeks)

Since only california-tech and guutz-blog use Symbiont (both in this workspace), we can do a clean breaking change without backward compatibility.

**Steps:**

1. **Week 1-2:** Core hook registry and types
2. **Week 3-4:** Update page transformer
3. **Week 5:** Update type definitions (remove old rules)
4. **Week 6-7:** Migrate both packages directly
5. **Week 8:** Documentation and testing

**No backward compatibility needed** - simpler implementation, no legacy code maintenance.

---

## Tradeoffs

### Pros ✅

1. **Extensibility:** Clear extension points without modifying core
2. **Composition:** Multiple transformations can be chained
3. **Reusability:** Hooks can be packaged and shared
4. **Debugging:** Named hooks make logging clearer
5. **Priority Control:** Fine-grained control over execution order
6. **Defaults Included:** Users don't copy boilerplate
7. **Progressive Enhancement:** Start simple, add hooks as needed

### Cons ❌

1. **More Verbose:** Hook objects require more structure than inline functions
2. **Learning Curve:** Need to understand hook lifecycle and priorities
3. **Execution Model:** Priority system requires thinking about order
4. **Breaking Change:** Requires migration (but only 2 packages)

---

## Future Possibilities

### Plugin System

```typescript
import { authorEnrichmentPlugin } from 'symbiont-plugin-author-enrichment';
import { seoPlugin } from 'symbiont-plugin-seo';

export const symbiont = createSymbiontClient({
    databases: [{
        plugins: [
            authorEnrichmentPlugin({ apiKey: CLEARBIT_KEY }),
            seoPlugin({ generateOgImages: true })
        ]
    }]
});
```

### Hook Packages

```typescript
import { commonDateHooks } from '@symbiont/hooks-dates';
import { imageOptimizationHooks } from '@symbiont/hooks-images';

hooks: [
    ...commonDateHooks,
    ...imageOptimizationHooks,
    myCustomHook
]
```

### Visual Hook Builder

A UI tool to build hook configurations without writing code.

---

## ✅ Recommendation

**Proceed with single-phase implementation**

**Rationale:**
- Solves real pain points (California Tech's 30-line date parser)
- Only 2 packages to migrate (both in workspace)
- Simpler implementation without backward compatibility
- Enables future extensibility (plugins, sharing)
- Strong TypeScript typing throughout

**Next Step:** Start implementation with 8-week timeline.

---

## Resolved Questions

Based on feedback, decisions have been made:

1. **Hook registration:** Array in config ✅
2. **Property config:** Syntactic sugar generates hooks ✅
3. **Default hooks:** Always run unless overridden ✅
4. **Error handling:** Fail fast ✅
5. **Markdown:** Uses hooks with optional sugar ✅
6. **Parallelization:** At page level, not hook level ✅
7. **Database access:** No direct Supabase client ✅
8. **Hooks calling hooks:** Not needed ✅
9. **Hook versioning:** Not needed yet ✅

---

**For Full Details:** See `.docs/2026-02-13-hook-based-config-refactor.md` (33KB)

**For Code Examples:** See `.docs/examples/hook-system-poc.ts` (19KB)

**For Comparisons:** See `.docs/examples/hook-config-comparison.md` (17KB)

**For Diagrams:** See `.docs/examples/hook-architecture-diagrams.md` (13KB)
