# Symbiont CMS Hook System Guide

**Date:** February 14, 2026  
**Status:** Proposal / Design  
**Implementation:** See `.docs/examples/hook-system-poc.ts`

---

## TL;DR

**Replace inline function config with a composable hook system:**

```typescript
// ❌ Before: Complex logic in config file
export const symbiont = createSymbiontClient({
    databases: [{
        publishDateRule: (page) => {
            // 30+ lines of date parsing logic...
            return complexDateLogic(page);
        }
    }]
});

// ✅ After: Clean config + extracted hooks
export const symbiont = createSymbiontClient({
    databases: [{
        hooks: calTechHooks  // Imported from separate file
    }]
});
```

**Key improvements:**
- Config files stay clean (10 lines vs 80+)
- Logic is extracted, testable, and reusable
- Multiple hooks can compose automatically
- No boilerplate - hooks return values or `null`

---

## Philosophy: Extractors, Not Transformers

Symbiont hooks are **extractors** that read from Notion pages and compute values. They're NOT transformers that modify data flowing through them (like WordPress query hooks).

**Why?** Hooks only run during **sync** (Notion → Database), not during **query** (Database → App). All hooks read from the same source (`ctx.page`), so they don't need to see each other's results.

```typescript
// ✅ Extractor pattern (Symbiont)
fn: async (ctx) => {
    return parseDate(ctx.page);  // Extract from source
}

// ❌ Transformer pattern (WordPress - not needed)
fn: async (ctx) => {
    return modifyQuery(ctx.data);  // Transform previous result
}
```

---

## Core Concepts

### 1. Hook Events

Events are **built-in lifecycle points** during page sync:

```typescript
type HookEvent = 
    // Early validation
    | 'page:exclude'          // Should page be excluded?
    | 'page:validate'         // Is page valid?
    
    // Metadata extraction
    | 'metadata:title'        // Extract title
    | 'metadata:tags'         // Extract tags
    | 'metadata:authors'      // Extract authors
    | 'metadata:summary'      // Extract summary
    | 'metadata:custom'       // Extract custom fields
    
    // Publishing logic
    | 'publish:check'         // Should page be published?
    | 'publish:date'          // Extract publish date
    
    // Slug handling
    | 'slug:extract'          // Extract custom slug
    | 'slug:generate'         // Generate slug from title
    | 'slug:validate'         // Validate slug uniqueness
    | 'slug:transform'        // Transform slug
    
    // Content processing
    | 'content:fetch'         // Fetch page content
    | 'content:transform'     // Transform markdown
    | 'content:images'        // Process images
    
    // Cover image
    | 'cover:extract'         // Extract cover image
    | 'cover:process';        // Process cover image
```

### 2. Hook Structure

```typescript
interface Hook<TOutput = any> {
    name: string;              // Your descriptive name
    event: HookEvent;          // Which lifecycle point
    priority: number;          // Lower = earlier (default: 50)
    continueOnError?: boolean; // Continue if this hook fails
    fn: HookFunction<TOutput>; // Your logic
}

type HookFunction<TOutput> = (
    ctx: HookContext
) => Promise<TOutput | null> | TOutput | null;
```

**Key**: Hooks return their value, or `null` if they have nothing to contribute.

### 3. Hook Context (Simplified)

```typescript
interface HookContext {
    page: PageObjectResponse;  // Notion page object
    logger: Logger;            // For debugging
    
    // Control flow
    aborted: boolean;
    abort: (reason: string) => void;  // Stop all processing
}
```

**No `ctx.data`!** Hooks are independent extractors, not sequential transformers.

**No `ctx.skip()`!** Just return `null` to indicate you have nothing.

---

## Automatic Composition Rules

The registry **automatically composes** hook results based on return type:

| Return Type | Behavior | Example |
|-------------|----------|---------|
| **Primitives** (string, number, Date, boolean) | **First non-null wins** - stop early | `publish:date` - try custom, fallback to default |
| **Objects** | **Merge all non-null** - continue through all hooks | `metadata:custom` - accumulate fields from all hooks |
| **Arrays** | **Concatenate all non-null** - continue through all hooks | `metadata:tags` - merge tags from multiple hooks |

### Pattern 1: Primitives (First Non-Null Wins)

```typescript
hooks: [
    {
        name: 'custom-date',
        event: 'publish:date',
        priority: 40,  // Lower = earlier
        fn: async (ctx) => {
            const date = parseIssueDate(ctx.page);
            return date;  // Date or null
        }
    },
    {
        name: 'default-date',
        event: 'publish:date',
        priority: 50,
        fn: async (ctx) => {
            // Only runs if custom-date returned null
            return new Date(ctx.page.last_edited_time);
        }
    }
]
```

**Result:** Custom date if available, otherwise default. Second hook **never runs** if first returns a value.

### Pattern 2: Objects (Auto-Merge)

```typescript
hooks: [
    {
        name: 'meta:layout',
        event: 'metadata:custom',
        priority: 30,
        fn: async (ctx) => ({
            layout: extractLayout(ctx.page),
            featured: extractFeatured(ctx.page)
        })
    },
    {
        name: 'meta:seo',
        event: 'metadata:custom',
        priority: 40,
        fn: async (ctx) => ({
            // No spreading needed! Registry merges automatically
            ogImage: extractOgImage(ctx.page),
            keywords: extractKeywords(ctx.page)
        })
    }
]
```

**Result:** `{ layout, featured, ogImage, keywords }` - all fields merged!

### Pattern 3: Arrays (Auto-Concatenate)

```typescript
hooks: [
    {
        name: 'tags:notion',
        event: 'metadata:tags',
        priority: 40,
        fn: async (ctx) => extractNotionTags(ctx.page)  // ['tech', 'blog']
    },
    {
        name: 'tags:computed',
        event: 'metadata:tags',
        priority: 50,
        fn: async (ctx) => computeTags(ctx.page)  // ['featured']
    }
]
```

**Result:** `['tech', 'blog', 'featured']` - arrays concatenated!

---

## Real-World Example: California Tech

### Problem: 30 Lines of Date Logic

**Before:**
```typescript
// src/lib/symbiont.ts - 80+ lines
export const symbiont = createSymbiontClient({
    databases: [{
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
                const monthMap = { /* ... */ };
                const monthIndex = monthMap[month];
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

**After:**
```typescript
// src/lib/symbiont.ts - 10 lines
import { calTechHooks } from './hooks/caltech.js';

export const symbiont = createSymbiontClient({
    databases: [{
        alias: 'tech-article-staging',
        dataSourceId: NOTION_DATABASE_ID,
        hooks: calTechHooks
    }]
});
```

```typescript
// src/lib/hooks/caltech.ts - Clean, testable
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
            
            // Return null - falls through to default hook
            return null;
        }
    },
    
    {
        name: 'caltech:slug:extract',
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
        fn: async (ctx) => ({
            layout: ctx.page.properties.Layout?.select?.name || 'standard',
            featured: ctx.page.properties.Featured?.checkbox || false,
            issueNumber: ctx.page.properties.Issue?.select?.name
        })
    }
];
```

```typescript
// src/lib/hooks/utils/date-parser.ts - Testable utility
export function parseCalTechIssueDate(issueText: string): string | null {
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
    return isNaN(date.getTime()) ? null : date.toISOString();
}
```

```typescript
// src/lib/hooks/utils/date-parser.test.ts - Unit tests!
describe('parseCalTechIssueDate', () => {
    it('parses "October 21, 2024"', () => {
        expect(parseCalTechIssueDate('October 21, 2024'))
            .toBe('2024-10-21T07:00:00.000Z');
    });
    
    it('returns null for invalid format', () => {
        expect(parseCalTechIssueDate('Bad Format')).toBeNull();
    });
});
```

**Benefits:**
- ✅ Config file: 10 lines (was 80+)
- ✅ Logic is extracted and testable
- ✅ Can reuse `parseCalTechIssueDate` anywhere
- ✅ Can add debug hooks in development
- ✅ Clear separation of concerns

---

## Default Hooks (Built-In)

Symbiont ships with sensible defaults. You only define hooks when you need custom behavior.

**Default hooks (automatically registered):**

```typescript
// Published by default
{ name: 'symbiont:publish:check:default', event: 'publish:check', 
  priority: 50, fn: async () => true }

// Use last_edited_time as publish date
{ name: 'symbiont:publish:date:default', event: 'publish:date',
  priority: 50, fn: async (ctx) => ctx.page.last_edited_time }

// Generate slug from title
{ name: 'symbiont:slug:generate:default', event: 'slug:generate',
  priority: 50, fn: async (ctx) => createSlug(extractTitle(ctx.page)) }

// No custom metadata by default
{ name: 'symbiont:metadata:custom:default', event: 'metadata:custom',
  priority: 50, fn: async () => ({}) }
```

**Your hooks run alongside defaults:**
- **Priority < 50:** Your custom logic runs first
- **Priority 50:** Same as defaults (replaces default for that event)
- **Priority > 50:** Runs after defaults (validation, debugging)

---

## Priority Levels

```typescript
Priority 1-20:  Pre-processing (debug logging, property inspection)
Priority 30-40: Custom logic (runs before defaults)
Priority 50:    Default hooks (Symbiont's built-in behavior)
Priority 60-70: Post-processing (validation, computed fields)
Priority 80-99: Final validation (error checking, warnings)
```

**Tip:** Use lower priority for custom logic that should take precedence over defaults.

---

## Debugging Hooks

```typescript
import { devHooks } from 'symbiont-cms/dev';

hooks: [
    ...myHooks,
    ...(process.env.NODE_ENV === 'development' ? [
        devHooks.logAllProperties(),     // Log all Notion properties
        devHooks.validateImageUrls(),    // Check image URLs
        devHooks.measureHookTiming()     // Performance timing
    ] : [])
]
```

---

## Migration Strategy

### Single-Phase Breaking Change (8 Weeks)

Since only california-tech and guutz-blog use Symbiont (both in this workspace), we can do a clean breaking change without backward compatibility.

**Timeline:**

| Week | Task | Deliverable |
|------|------|-------------|
| 1-2  | Core hook registry + types | Working HookRegistry class |
| 3-4  | Update page transformer | Hooks integrated into sync pipeline |
| 5    | Update type definitions | Remove old `publishDateRule` etc. |
| 6-7  | Migrate both packages | california-tech + guutz-blog using hooks |
| 8    | Documentation + tests | Production ready |

**No backward compatibility layer needed** - simpler implementation, no legacy maintenance.

---

## Comparison: Before vs After

### Config File Size

| Metric | Before | After |
|--------|--------|-------|
| **California Tech config** | 80 lines | 10 lines |
| **Logic location** | Inline in config | Extracted to `hooks/` |
| **Testability** | None (inline functions) | Full unit tests |
| **Reusability** | Copy/paste | Import hooks |

### Developer Experience

**Before:**
```typescript
// ❌ Everything in one huge config file
export const symbiont = createSymbiontClient({
    databases: [{
        publishDateRule: (page) => { /* 30 lines */ },
        slugRule: (page) => { /* 10 lines */ },
        customMetadata: (page) => { /* 20 lines */ }
        // Total: 80+ lines
    }]
});
```

**After:**
```typescript
// ✅ Clean config
import { calTechHooks } from './hooks/caltech.js';
export const symbiont = createSymbiontClient({
    databases: [{ hooks: calTechHooks }]
});

// ✅ Logic in separate files
// src/lib/hooks/caltech.ts
// src/lib/hooks/utils/date-parser.ts
// src/lib/hooks/utils/date-parser.test.ts
```

---

## Q&A

### Q: Do hooks see previous hooks' results?

**A:** No. Hooks are **extractors** that read from `ctx.page`, not transformers that modify `ctx.data`. The registry handles composition automatically based on return type.

### Q: What if I return null?

**A:** Registry skips your result and continues to the next hook. For primitives, it stops at the first non-null. For objects/arrays, it merges all non-null results.

### Q: Can I stop all processing?

**A:** Yes, call `ctx.abort('reason')` for critical errors (e.g., invalid data).

### Q: How do I override default hooks?

**A:** Register your hook at the same priority (50) or lower (40). For primitives, your hook runs first and stops processing (default never runs). For objects, your fields are merged with defaults.

### Q: Can I use hooks for queries?

**A:** No. Hooks only run during **sync** (Notion → Database). For query-time logic, use load functions in SvelteKit:

```typescript
// src/routes/+page.server.ts
export async function load({ fetch }) {
    const pages = await symbiont.getAllPages({ fetch });
    // Do any query-time transformations here
    return { pages };
}
```

### Q: What about the Markdown config?

**A:** Markdown options remain as config properties (simpler for common settings). If you need custom Markdown transformations, use `content:transform` hooks.

---

## Next Steps

1. **Review this proposal** - does the simplified model make sense?
2. **Validate with real examples** - check california-tech and guutz-blog use cases
3. **Start implementation** - begin 8-week timeline
4. **Write tests** - ensure hook composition works correctly

---

**For Implementation Details:** See `.docs/examples/hook-system-poc.ts`

**Related Documents:**
- `.docs/2026-02-13-hook-based-config-refactor.md` (original detailed memo - superseded)
- `.docs/2026-02-13-HOOK_COMPOSITION_GUIDE.md` (composition patterns - superseded)
- `.docs/examples/hook-composition-quick-ref.md` (quick reference - superseded)
