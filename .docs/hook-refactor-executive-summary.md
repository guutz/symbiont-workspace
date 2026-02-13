# Hook-Based Config Refactor: Executive Summary

**Date:** February 13, 2026  
**Status:** Proposal / RFC  
**Related Documents:**
- Main Memo: `.docs/2026-02-13-hook-based-config-refactor.md`
- Proof of Concept: `.docs/examples/hook-system-poc.ts`
- Comparisons: `.docs/examples/hook-config-comparison.md`
- Diagrams: `.docs/examples/hook-architecture-diagrams.md`

---

## TL;DR

**Problem:** Config system is opinionated but inflexible. Complex logic (30+ lines) must live inline in config files. Cannot test, reuse, or compose transformations.

**Solution:** WordPress-style hook system with named hooks, priority ordering, and composability. Default hooks ship with Symbiont (no boilerplate). User hooks can augment or override defaults.

**Migration:** 4-phase strategy maintains backward compatibility until v2.0.0.

**Timeline:** 8+ weeks for Phase 1 (non-breaking addition).

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

### 3. Default Hooks (No Boilerplate)

Symbiont ships with default hooks for common cases:

```typescript
// Built into symbiont-cms package
const defaultHooks = [
    { name: 'symbiont:publish:check:default', event: 'publish:check', 
      priority: 50, fn: async (ctx) => true },
    { name: 'symbiont:publish:date:default', event: 'publish:date',
      priority: 50, fn: async (ctx) => ctx.page.last_edited_time },
    { name: 'symbiont:slug:generate:default', event: 'slug:generate',
      priority: 50, fn: async (ctx) => createSlug(ctx.data.title) }
];
```

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

20+ events covering the entire transformation pipeline:

```typescript
// Early validation
'page:exclude'          // Should page be excluded from sync?
'page:validate'         // Is page data valid?

// Metadata extraction
'metadata:title'        // Extract/transform title
'metadata:tags'         // Extract/transform tags
'metadata:authors'      // Extract/transform authors
'metadata:summary'      // Extract/transform summary
'metadata:custom'       // Extract custom metadata

// Publishing logic
'publish:check'         // Should page be published?
'publish:date'          // Determine publish date

// Slug handling
'slug:extract'          // Extract custom slug from Notion
'slug:generate'         // Generate slug from title
'slug:validate'         // Validate slug uniqueness
'slug:transform'        // Transform slug (sanitization)

// Content processing
'content:fetch'         // Fetch page content
'content:transform'     // Transform markdown content
'content:images'        // Process inline images

// Cover image
'cover:extract'         // Extract cover image
'cover:process'         // Upload/process cover image

// Sync back to Notion
'sync:slug'             // Sync slug back to Notion
'sync:content'          // Sync content back to Notion
'sync:images'           // Sync image URLs back to Notion
```

---

## Migration Strategy

### Phase 1: Non-Breaking Addition (8+ weeks)

- Add `HookRegistry` class
- Implement default hooks
- Update `NotionPageToDatabasePageTransformer` to use hooks internally
- Add `hooks: Hook[]` property to `DatabaseBlueprint` (optional)
- **Result:** Both old and new systems work simultaneously

### Phase 2: Documentation & Examples (2-3 weeks)

- Add hook examples to documentation
- Create migration guide
- Update California Tech and Guutz Blog (as examples)
- **Result:** Developers can start using hooks

### Phase 3: Deprecation Warnings (3-4 weeks)

- Add deprecation warnings for old-style rules
- Auto-convert old rules to hooks internally
- Update all tests to use hooks
- **Result:** Old code works but warns

### Phase 4: Breaking Change (v2.0.0)

- Remove old rule properties
- Remove auto-conversion layer
- **Result:** Hooks are the only way

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

1. **More Boilerplate (for complex cases):** Hook objects are more verbose than inline functions
2. **Learning Curve:** Developers need to understand hook lifecycle and priorities
3. **Execution Model Complexity:** Priority system adds mental overhead
4. **Breaking Change:** Eventually requires migration
5. **Debugging Difficulty:** Stack traces might be harder to follow
6. **Performance:** Hook registry adds indirection (likely negligible)

---

## When to Use Hooks vs. Current Approach

### Use Current (Rules) When:
- ✅ Simple, one-line transformations
- ✅ Single database with basic needs
- ✅ Prototyping quickly
- ✅ Learning Symbiont

### Use Proposed (Hooks) When:
- ✅ Complex multi-step transformations
- ✅ Need to compose behavior from multiple sources
- ✅ Building reusable logic
- ✅ Multiple databases with shared logic
- ✅ Need fine control over execution order
- ✅ Want better debugging/observability
- ✅ Building plugins or extensions

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

## Decision: Proceed?

**Recommendation:** ✅ Proceed with Phase 1 implementation

**Rationale:**
- Solves real pain points (California Tech example)
- Non-breaking addition (low risk)
- Enables future extensibility (plugins, sharing)
- Aligns with industry patterns (WordPress, SvelteKit)
- Strong TypeScript typing throughout

**Next Step:** Review memo and POC, discuss decision points, then start Phase 1 implementation.

---

## Questions for Discussion

1. **Hook registration style:** Array in config vs. imperative registration?
2. **Default hook behavior:** Always run vs. optional vs. explicit disable?
3. **Error handling:** Fail fast vs. continue on error?
4. **Markdown config:** Convert to hooks or keep separate?
5. **Plugin API:** Include in Phase 1 or defer to later?

---

**For Full Details:** See `.docs/2026-02-13-hook-based-config-refactor.md` (33KB)

**For Code Examples:** See `.docs/examples/hook-system-poc.ts` (19KB)

**For Comparisons:** See `.docs/examples/hook-config-comparison.md` (17KB)

**For Diagrams:** See `.docs/examples/hook-architecture-diagrams.md` (13KB)
