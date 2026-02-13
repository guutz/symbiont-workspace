# Hook Composition Guide: Understanding Multi-Hook Behavior

**Date:** February 13, 2026  
**Status:** Reference Documentation  
**Related Documents:**
- Hook Refactor Memo: `.docs/2026-02-13-hook-based-config-refactor.md`
- Hook POC: `.docs/examples/hook-system-poc.ts`
- Config Examples: `.docs/examples/hook-config-comparison.md`

---

## TL;DR

**The behavior depends on the return type:**

- **Single-value types** (Date, string, number): **Last hook wins** (overwrite)
- **Object types** (metadata, custom data): **Can merge** (using `...ctx.data`)
- **Control flow** (`ctx.skip()`): Skips current hook, moves to next

---

## The Core Question

> "What happens when multiple hooks modify the same property? Does each subsequent hook check if it's already been set and skip? Or does it overwrite?"

**Answer:** Hooks **always execute** in priority order (unless `skip()` or `abort()` is called). Each hook receives the **output of the previous hook** as `ctx.data`. What happens next depends on **what the hook returns**.

---

## How Hook Execution Works

### The Pipeline

```typescript
// Simplified execution model
let result = initialData;

for (const hook of sortedHooks) {
    const output = await hook.fn({ ...ctx, data: result });
    
    if (ctx.skipped) {
        continue; // Skip this hook, keep current result
    }
    
    result = output; // Update result for next hook
}

return result;
```

**Key insight:** Each hook's return value becomes `ctx.data` for the next hook.

---

## Pattern 1: Single-Value Types (Overwrite Behavior)

For hooks returning single values (Date, string, number, boolean), **the last non-skipped hook wins**.

### Example: Publish Date

```typescript
hooks: [
    {
        name: 'caltech:publish:date:issue-based',
        event: 'publish:date',
        priority: 40,
        fn: async (ctx) => {
            const issue = ctx.page.properties.Issue?.select?.name;
            if (!issue) {
                return ctx.skip(); // ← Falls through to next hook
            }
            return parseIssueDate(issue); // ← Returns Date
        }
    },
    {
        name: 'symbiont:publish:date:default',
        event: 'publish:date',
        priority: 50,
        fn: async (ctx) => {
            // ctx.data here is either:
            // - parseIssueDate(issue) if previous hook succeeded
            // - initialData if previous hook skipped
            return new Date(ctx.page.last_edited_time);
        }
    }
]
```

**Behavior:**
- If issue exists: First hook returns date → Second hook **overwrites** it
- If issue doesn't exist: First hook skips → Second hook gets `initialData`

**To make last hook conditional:**
```typescript
fn: async (ctx) => {
    // Check if previous hook already set a value
    if (ctx.data) {
        return ctx.data; // ← Keep previous value
    }
    return new Date(ctx.page.last_edited_time);
}
```

---

## Pattern 2: Object Types (Merge Behavior)

For hooks returning objects (metadata, custom properties), **explicitly merge** using spread operator.

### Example: Custom Metadata

```typescript
hooks: [
    {
        name: 'meta:layout',
        event: 'metadata:custom',
        priority: 30,
        fn: async (ctx) => ({
            layout: ctx.page.properties.Layout?.select?.name || 'standard',
            featured: ctx.page.properties.Featured?.checkbox || false
        })
    },
    {
        name: 'meta:seo',
        event: 'metadata:custom',
        priority: 40,
        fn: async (ctx) => ({
            ...ctx.data, // ← Preserve previous hooks' data
            ogImage: ctx.page.properties.OGImage?.url,
            keywords: ctx.page.properties.Keywords?.multi_select?.map(s => s.name)
        })
    },
    {
        name: 'meta:computed',
        event: 'metadata:custom',
        priority: 50,
        fn: async (ctx) => {
            const content = await fetchContent(ctx.page.id);
            return {
                ...ctx.data, // ← Preserve previous hooks' data
                wordCount: content.split(/\s+/).length,
                readingTime: Math.ceil(content.split(/\s+/).length / 200)
            };
        }
    }
]
```

**Result after all hooks:**
```typescript
{
    layout: 'standard',      // From meta:layout
    featured: false,         // From meta:layout
    ogImage: 'https://...',  // From meta:seo
    keywords: ['tag1'],      // From meta:seo
    wordCount: 1234,         // From meta:computed
    readingTime: 7           // From meta:computed
}
```

**What if you don't merge?**
```typescript
fn: async (ctx) => ({
    // ❌ WITHOUT ...ctx.data
    wordCount: 1234,
    readingTime: 7
})
// Result: { wordCount: 1234, readingTime: 7 }
// ❌ Lost all previous metadata!
```

---

## Pattern 3: Conditional Overwrite

Sometimes you want to **conditionally overwrite** based on previous hook's result.

### Example: Slug Generation

```typescript
hooks: [
    {
        name: 'slug:custom',
        event: 'slug:generate',
        priority: 40,
        fn: async (ctx) => {
            const customSlug = ctx.page.properties.CustomSlug?.rich_text?.[0]?.plain_text;
            if (!customSlug) {
                return ctx.skip(); // ← No custom slug, use default
            }
            return sanitizeSlug(customSlug);
        }
    },
    {
        name: 'slug:from-title',
        event: 'slug:generate',
        priority: 50,
        fn: async (ctx) => {
            // Only generate if no custom slug was set
            if (ctx.data && ctx.data !== initialSlug) {
                return ctx.data; // ← Keep custom slug
            }
            return generateSlug(ctx.page.properties.Title);
        }
    }
]
```

---

## Pattern 4: Intentional Last-Hook-Wins

For validation or enforcement hooks, you **want** the last hook to have final say.

### Example: Publishing Rules

```typescript
hooks: [
    {
        name: 'publish:allow-if-status-published',
        event: 'publish:check',
        priority: 40,
        fn: async (ctx) => {
            return ctx.page.properties.Status?.select?.name === 'Published';
        }
    },
    {
        name: 'publish:block-if-draft',
        event: 'publish:check',
        priority: 50,
        fn: async (ctx) => {
            // This hook runs AFTER the previous one
            // It can override the previous decision
            if (ctx.page.properties.Draft?.checkbox === true) {
                return false; // ← Block publishing even if status is "Published"
            }
            return ctx.data; // ← Keep previous decision
        }
    }
]
```

**Behavior:**
- Status = "Published", Draft = false → Both return `true` → Publishes
- Status = "Published", Draft = true → First returns `true`, second returns `false` → Blocked
- Status = "Draft", Draft = false → First returns `false`, second keeps `false` → Blocked

---

## Decision Tree: Which Pattern to Use?

```
Is your return type a single value (Date, string, number)?
│
├─ YES → Use Pattern 1 (Overwrite or Skip)
│   │
│   └─ Do you want earlier hooks to have priority?
│      ├─ YES → Check ctx.data, return if set
│      └─ NO → Just return your value (last hook wins)
│
└─ NO (returning an object) → Use Pattern 2 (Merge)
    │
    └─ Always spread ctx.data unless you want to discard previous data
```

---

## Control Flow: skip() vs abort()

### `ctx.skip()`

**Use when:** This hook can't determine a value, let the next hook try.

```typescript
fn: async (ctx) => {
    if (!canHandle(ctx.page)) {
        return ctx.skip(); // ← Skip to next hook
    }
    return computeValue(ctx.page);
}
```

**Effect:**
- Current hook's return value is **ignored**
- Next hook receives the **same ctx.data** as current hook
- Execution continues

### `ctx.abort()`

**Use when:** Stop all processing immediately (error condition).

```typescript
fn: async (ctx) => {
    if (ctx.page.properties.Forbidden) {
        ctx.abort('Page contains forbidden content');
        return;
    }
    return processPage(ctx.page);
}
```

**Effect:**
- Stops all hook execution immediately
- Throws error with abort reason
- Page is not processed

---

## Best Practices

### 1. **Be Explicit About Merging**

❌ **Bad** (implicit, easy to miss):
```typescript
fn: async (ctx) => ({
    newField: 'value'
})
```

✅ **Good** (explicit about intent):
```typescript
fn: async (ctx) => ({
    ...ctx.data, // ← Explicitly preserve previous data
    newField: 'value'
})
```

### 2. **Document Expected Return Type**

```typescript
{
    name: 'publish:date:custom',
    event: 'publish:date',
    priority: 40,
    // 📝 Returns: Date | null
    // If null, falls through to default hook
    fn: async (ctx) => { /* ... */ }
}
```

### 3. **Use Priority to Control Flow**

- **Lower priority (30-40)**: Specific/custom logic
- **Default priority (50)**: Default/fallback behavior
- **Higher priority (60-70)**: Validation/enforcement

### 4. **Name Hooks Clearly**

Use format: `category:action:variant`

```typescript
'caltech:publish:date:issue-based'
'symbiont:publish:date:default'
'meta:seo:og-image'
```

### 5. **Test Hook Composition**

```typescript
// Test: Custom date hook + default hook
const hooks = [customDateHook, defaultDateHook];
const result = await registry.execute('publish:date', {
    page: mockPageWithoutIssue,
    data: null
});
// Expect: Falls through to default date
```

---

## Common Pitfalls

### ❌ Pitfall 1: Forgetting to Merge Objects

```typescript
// Hook 1 returns: { layout: 'blog', featured: true }
// Hook 2 (WRONG):
fn: async (ctx) => ({
    ogImage: 'https://...'  // ❌ Lost layout and featured!
})
```

**Fix:** Always spread `ctx.data`:
```typescript
fn: async (ctx) => ({
    ...ctx.data,
    ogImage: 'https://...'
})
```

### ❌ Pitfall 2: Expecting skip() to Preserve Values

```typescript
// Hook 1
fn: async (ctx) => {
    if (!custom) return ctx.skip();
    return customValue;
}

// Hook 2
fn: async (ctx) => {
    // ❌ WRONG: Expecting ctx.data to have customValue if Hook 1 didn't skip
    // ✅ CORRECT: ctx.data only has customValue if Hook 1 returned it
}
```

### ❌ Pitfall 3: Wrong Priority Order

```typescript
// ❌ WRONG: Default runs before custom
{
    name: 'default',
    priority: 40  // Runs first
},
{
    name: 'custom',
    priority: 50  // Runs second, overwrites default
}

// ✅ CORRECT: Custom runs before default
{
    name: 'custom',
    priority: 40  // Runs first
},
{
    name: 'default',
    priority: 50  // Runs second, only if custom skipped
}
```

---

## Summary

| Return Type | Behavior | Pattern |
|-------------|----------|---------|
| **Single value** (Date, string) | Last hook wins | Overwrite or `skip()` |
| **Object** (metadata) | Explicit merge | `{ ...ctx.data, newFields }` |
| **Boolean** (rules) | Last hook decides | Conditional overwrite |
| **Skip** | Falls through | `ctx.skip()` + lower priority |
| **Abort** | Stop all processing | `ctx.abort(reason)` |

**Key Principle:** Hooks form a **pipeline**. Each hook receives the output of the previous hook and can:
1. Transform it
2. Merge with it
3. Replace it
4. Skip (pass through unchanged)
5. Abort (stop processing)

The pattern you use depends on your **return type** and **composition intent**.

---

## Visual Flow Diagrams

### Single-Value Pattern (Overwrite)

```
┌────────────────────────────────────────────────────────────┐
│ Event: 'publish:date'                                      │
│ Initial ctx.data: null                                     │
└────────────────────────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Hook 1 (priority 40)  │
        │ 'custom-date'         │
        │                       │
        │ Returns: '2026-01-01' │
        └───────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ ctx.data = '2026-01-01'│  ← Hook 1's output becomes ctx.data
        └───────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Hook 2 (priority 50)  │
        │ 'default-date'        │
        │                       │
        │ Returns: '2026-02-13' │  ← Overwrites without checking ctx.data
        └───────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Final: '2026-02-13'   │  ← Last hook wins
        └───────────────────────┘
```

### Skip Pattern (Fallback)

```
┌────────────────────────────────────────────────────────────┐
│ Event: 'publish:date'                                      │
│ Initial ctx.data: null                                     │
└────────────────────────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Hook 1 (priority 40)  │
        │ 'custom-date'         │
        │                       │
        │ No custom date found  │
        │ Calls ctx.skip()      │  ← Skip this hook
        └───────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ ctx.data = null       │  ← Unchanged (skip doesn't update)
        └───────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Hook 2 (priority 50)  │
        │ 'default-date'        │
        │                       │
        │ Returns: '2026-02-13' │  ← Runs because Hook 1 skipped
        └───────────────────────┘
                    │
                    ▼
        ┌───────────────────────┐
        │ Final: '2026-02-13'   │
        └───────────────────────┘
```

### Object Merge Pattern

```
┌────────────────────────────────────────────────────────────┐
│ Event: 'metadata:custom'                                   │
│ Initial ctx.data: {}                                       │
└────────────────────────────────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────────────────┐
        │ Hook 1 (priority 30)              │
        │ 'meta:layout'                     │
        │                                   │
        │ Returns:                          │
        │ { layout: 'blog', featured: true }│
        └───────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────────────────┐
        │ ctx.data = {                      │
        │   layout: 'blog',                 │
        │   featured: true                  │
        │ }                                 │
        └───────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────────────────┐
        │ Hook 2 (priority 40)              │
        │ 'meta:seo'                        │
        │                                   │
        │ Returns:                          │
        │ {                                 │
        │   ...ctx.data,  ← Merge          │
        │   ogImage: 'https://...'          │
        │ }                                 │
        └───────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────────────────┐
        │ ctx.data = {                      │
        │   layout: 'blog',     ← Preserved │
        │   featured: true,     ← Preserved │
        │   ogImage: 'https://...' ← New    │
        │ }                                 │
        └───────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────────────────┐
        │ Hook 3 (priority 50)              │
        │ 'meta:computed'                   │
        │                                   │
        │ Returns:                          │
        │ {                                 │
        │   ...ctx.data,  ← Merge          │
        │   wordCount: 1234                 │
        │ }                                 │
        └───────────────────────────────────┘
                    │
                    ▼
        ┌───────────────────────────────────┐
        │ Final: {                          │
        │   layout: 'blog',     ← From H1   │
        │   featured: true,     ← From H1   │
        │   ogImage: '...',     ← From H2   │
        │   wordCount: 1234     ← From H3   │
        │ }                                 │
        └───────────────────────────────────┘
```

---

**Last Updated:** February 13, 2026
