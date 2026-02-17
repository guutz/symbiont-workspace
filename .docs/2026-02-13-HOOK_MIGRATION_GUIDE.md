# Hook-Based Configuration Migration Guide

**Date:** February 13, 2026  
**Status:** Completed  
**Version:** Symbiont CMS v0.0.2+

---

## Overview

Symbiont CMS has migrated from a property-based configuration to a **hook-based architecture** inspired by WordPress's extensibility model. This provides clear extension points while maintaining opinionated defaults.

### Key Benefits

1. **Composability** - Multiple hooks can run on the same event
2. **Priority Ordering** - Control execution order with priority values
3. **Testability** - Extract logic to testable functions
4. **Extensibility** - Add custom behavior without modifying core code
5. **Reduced Boilerplate** - Configs reduced from ~95 lines to ~40 lines

---

## Before & After

### Old Configuration (Deprecated)

```typescript
export const symbiont = createSymbiontClient({
  databases: [{
    alias: 'blog',
    dataSourceId: 'xxx',
    
    // Inline functions (hard to test, verbose)
    isPublicRule: (page) => {
      const status = page.properties.Status;
      return status?.status?.name === 'Published';
    },
    
    publishDateRule: (page) => {
      // 30 lines of date parsing logic...
    },
    
    slugRule: (page) => {
      const slug = page.properties.Slug?.rich_text;
      return slug?.[0]?.plain_text || null;
    }
  }]
});
```

### New Configuration (Recommended)

```typescript
import { createSymbiontClient } from 'symbiont-cms';
import { blogHooks } from './hooks/blog-hooks.js';

export const symbiont = createSymbiontClient({
  databases: [{
    alias: 'blog',
    dataSourceId: 'xxx',
    
    // Hook-based (testable, composable, reusable)
    hooks: blogHooks
  }]
});
```

**hooks/blog-hooks.ts:**
```typescript
import type { Hook } from 'symbiont-cms';

export const publishCheckHook: Hook = {
  name: 'blog:publish:check',
  event: 'publish:check',
  priority: 40,
  fn: async (ctx) => {
    const status = ctx.page.properties.Status;
    return status?.status?.name === 'Published';
  }
};

export const blogHooks: Hook[] = [publishCheckHook, /* ... */];
```

---

## Hook System Concepts

### Hook Events

Built-in lifecycle events in the page transformation pipeline:

```typescript
type HookEvent =
  | 'page:exclude'       // Should page be excluded from sync?
  | 'publish:check'      // Should page be published?
  | 'publish:date'       // Determine publish date
  | 'slug:extract'       // Extract custom slug from Notion
  | 'slug:generate'      // Generate slug from title
  | 'metadata:custom'    // Extract custom metadata
  | 'metadata:title'     // Extract/transform title
  | 'metadata:tags'      // Extract/transform tags
  | 'metadata:authors'   // Extract/transform authors
  | 'metadata:summary'   // Extract/transform summary
  // ... more events
```

### Priority System

Hooks execute in order of priority (lower = earlier):

- **10-30:** High priority (runs early)
- **40-60:** Normal priority (default: 50)
- **70-90:** Low priority (runs late)

**Example:**
```typescript
// Custom hook runs before default
{
  name: 'custom:publish-date',
  event: 'publish:date',
  priority: 40,  // Runs before default (50)
  fn: async (ctx) => { /* ... */ }
}
```

### Control Flow

Hooks can control execution flow:

```typescript
{
  name: 'custom:publish-date',
  event: 'publish:date',
  priority: 40,
  fn: async (ctx) => {
    const customDate = extractCustomDate(ctx.page);
    
    if (customDate) {
      return customDate;  // Use this date
    }
    
    // Skip to next hook (default will run)
    ctx.skip();
    return null;
  }
}
```

### Data Flow Through Hooks

**Key Concept:** Hooks execute sequentially in priority order, and each hook receives the OUTPUT of the previous hook as its INPUT via `ctx.data`.

**This means:**
- Changes made by earlier hooks are preserved and passed to later hooks
- Later hooks can build upon or modify what earlier hooks did
- Data flows through the chain: Hook A → Hook B → Hook C → Final Result

**Example:**

```typescript
// Hook 1: Extract base metadata (priority 30)
{
  name: 'meta:base',
  event: 'metadata:custom',
  priority: 30,
  fn: async (ctx) => {
    // ctx.data = {} (initial/empty)
    return {
      layout: ctx.page.properties.Layout?.select?.name
    };
    // Returns: { layout: 'article' }
  }
}

// Hook 2: Add SEO fields (priority 40)
{
  name: 'meta:seo',
  event: 'metadata:custom',
  priority: 40,
  fn: async (ctx) => {
    // ctx.data = { layout: 'article' } ← Output from Hook 1!
    return {
      ...ctx.data,  // Preserve Hook 1's data
      ogImage: ctx.page.properties.OGImage?.url,
      keywords: ctx.page.properties.Keywords?.multi_select?.map(k => k.name)
    };
    // Returns: { layout: 'article', ogImage: '...', keywords: [...] }
  }
}

// Hook 3: Add computed fields (priority 50)
{
  name: 'meta:computed',
  event: 'metadata:custom',
  priority: 50,
  fn: async (ctx) => {
    // ctx.data = { layout: 'article', ogImage: '...', keywords: [...] }
    return {
      ...ctx.data,  // Preserve all previous data
      wordCount: calculateWordCount(ctx.page)
    };
    // Final result: { layout: 'article', ogImage: '...', keywords: [...], wordCount: 1250 }
  }
}
```

**Important:** Each hook's return value becomes the `ctx.data` for the next hook. This is how hooks compose and build upon each other without overwriting previous changes.

---

## Migration Steps

### 1. Extract Complex Logic to Utilities

**Before:**
```typescript
publishDateRule: (page) => {
  // 30 lines of complex date parsing...
}
```

**After:**
```typescript
// utils/date-parser.ts
export function parseIssueDate(issueString: string): string | null {
  // Testable, reusable function
  // ...
}
```

### 2. Create Hooks File

```typescript
// hooks/blog-hooks.ts
import type { Hook } from 'symbiont-cms';
import { parseIssueDate } from './utils/date-parser.js';

export const publishDateHook: Hook = {
  name: 'blog:publish:date',
  event: 'publish:date',
  priority: 40,
  fn: async (ctx) => {
    const issue = ctx.page.properties.Issue?.select?.name;
    if (issue) {
      return parseIssueDate(issue);
    }
    ctx.skip(); // Fall back to default
    return null;
  }
};

export const blogHooks: Hook[] = [publishDateHook];
```

### 3. Update Config

```typescript
// symbiont.ts
import { blogHooks } from './hooks/blog-hooks.js';

export const symbiont = createSymbiontClient({
  databases: [{
    alias: 'blog',
    dataSourceId: 'xxx',
    hooks: blogHooks  // ✅ New hook-based config
  }]
});
```

---

## Default Hooks

Symbiont ships with sensible default hooks that you can override:

| Hook Name | Event | Priority | Behavior |
|-----------|-------|----------|----------|
| `symbiont:publish:check:default` | `publish:check` | 50 | Always publish |
| `symbiont:publish:date:default` | `publish:date` | 50 | Use `last_edited_time` |
| `symbiont:slug:extract:default` | `slug:extract` | 50 | Return `null` (no custom slug) |
| `symbiont:slug:generate:default` | `slug:generate` | 50 | Generate from title |
| `symbiont:metadata:custom:default` | `metadata:custom` | 50 | Return empty object |
| `symbiont:page:exclude:default` | `page:exclude` | 50 | Don't exclude any pages |

**Override example:**
```typescript
{
  name: 'custom:publish:check',
  event: 'publish:check',
  priority: 40,  // Before default (50)
  fn: async (ctx) => {
    return ctx.page.properties.Status?.status?.name === 'Published';
  }
}
```

---

## Real-World Examples

### California Tech

**Before:** 95 lines  
**After:** 40 lines

```typescript
// hooks/caltech-hooks.ts
export const calTechHooks: Hook[] = [
  {
    name: 'caltech:exclude:print-only',
    event: 'page:exclude',
    priority: 40,
    fn: async (ctx) => {
      const tags = ctx.page.properties.Tags?.multi_select;
      return tags?.some(t => t.name === 'Print Only') ?? false;
    }
  },
  {
    name: 'caltech:publish:date:issue-based',
    event: 'publish:date',
    priority: 40,
    fn: async (ctx) => {
      const issue = ctx.page.properties.Issue?.select?.name;
      if (issue) {
        return parseCalTechIssueDate(issue);
      }
      ctx.skip(); // Fall back to default
      return null;
    }
  }
  // ... more hooks
];
```

### guutz-blog

**Before:** 55 lines  
**After:** 40 lines

```typescript
// hooks/guutz-hooks.ts
export const guutzHooks: Hook[] = [
  {
    name: 'guutz:publish:check:live-tag',
    event: 'publish:check',
    priority: 40,
    fn: async (ctx) => {
      const tags = ctx.page.properties.Tags?.multi_select;
      return tags?.some(t => t.name === 'LIVE') ?? false;
    }
  }
  // ... more hooks
];
```

---

## Testing Hooks

Hooks are easy to test since they're pure functions:

```typescript
// hooks/blog-hooks.test.ts
import { describe, it, expect } from 'vitest';
import { publishDateHook } from './blog-hooks.js';

describe('publishDateHook', () => {
  it('should parse issue date', async () => {
    const ctx = {
      page: {
        properties: {
          Issue: { select: { name: 'January 20, 2023' } }
        }
      },
      // ... other context
    };
    
    const result = await publishDateHook.fn(ctx);
    expect(result).toBe('2023-01-20T14:00:00.000Z');
  });
});
```

---

## Advanced Patterns

### Composing Multiple Hooks

```typescript
// Multiple hooks on same event (run in priority order)
export const blogHooks: Hook[] = [
  // Extract from custom property
  {
    name: 'blog:meta:base',
    event: 'metadata:custom',
    priority: 30,
    fn: async (ctx) => ({
      layout: ctx.page.properties.Layout?.select?.name
    })
  },
  
  // Add SEO metadata
  {
    name: 'blog:meta:seo',
    event: 'metadata:custom',
    priority: 40,
    fn: async (ctx) => ({
      ...ctx.data,  // Preserve previous hooks
      ogImage: ctx.page.properties.OGImage?.url
    })
  }
];
```

### Conditional Execution

```typescript
{
  name: 'blog:publish:date:conditional',
  event: 'publish:date',
  priority: 40,
  fn: async (ctx) => {
    // Only apply for specific pages
    if (ctx.page.properties.Type?.select?.name === 'Article') {
      return extractArticleDate(ctx.page);
    }
    
    // For other types, use default
    ctx.skip();
    return null;
  }
}
```

---

## Deprecated APIs

The following properties are deprecated but still work (with legacy fallbacks):

- ❌ `excludeRule` → ✅ Use `page:exclude` hook
- ❌ `isPublicRule` → ✅ Use `publish:check` hook
- ❌ `publishDateRule` → ✅ Use `publish:date` hook
- ❌ `slugRule` → ✅ Use `slug:extract` hook
- ❌ `metadataExtractor` → ✅ Use `metadata:custom` hook

**Note:** These will be removed in a future major version.

---

## Troubleshooting

### Hook not executing?

1. Check hook is registered: `console.log(config.hooks)`
2. Check priority (lower runs first)
3. Check if previous hook aborted/skipped

### Legacy rule not working?

The hook system has priority. If a hook exists for the same event, it runs first. Legacy rules are fallbacks.

### Need to debug hook execution?

Enable debug logging:
```typescript
ctx.logger.debug({
  event: 'my_hook_executed',
  data: ctx.data
});
```

---

## Summary

The hook system provides:

✅ **Better code organization** - Extract logic to testable files  
✅ **Composability** - Multiple hooks per event  
✅ **Extensibility** - Clear extension points  
✅ **Type safety** - Full TypeScript support  
✅ **Maintainability** - Less boilerplate, easier to understand

**Recommended:** Migrate all new projects to hook-based configuration. Legacy rules will be removed in v1.0.

---

**Questions?** See `.docs/2026-02-13-hook-based-config-refactor.md` for full design details.
