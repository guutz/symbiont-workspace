# Hook Composition Quick Reference

**Last Updated:** February 13, 2026

## The Core Insight

> "The pattern depends on the return type of the hook -- if it's a single valued type, maybe, though that might not always be the deciding factor."

**✅ You're correct!** The return type is the **primary** deciding factor, but not the only one. Here's the complete picture:

---

## Pattern Decision Matrix

| Return Type | Default Behavior | Override Behavior | Use Case |
|-------------|-----------------|-------------------|----------|
| **Single value** (Date, string, number) | Last hook wins (overwrites) | Check `ctx.data` to preserve | Date rules, slug generation |
| **Object** (metadata, custom data) | Last hook wins (replaces entire object) | Merge with `...ctx.data` | Custom metadata, SEO fields |
| **Boolean** (rules) | Last hook decides | Conditional logic with `ctx.data` | Publishing rules, validation |
| **Array** | Last hook wins (replaces array) | Merge/concat with `ctx.data` | Tags, authors, categories |
| **null/undefined** + `skip()` | Falls through to next hook | N/A | Conditional processing |

---

## Quick Examples

### ❌ Wrong: Assuming hooks check ctx.data automatically

```typescript
// Hook 1
fn: async (ctx) => {
    return parseCustomDate(ctx.page);  // Returns Date
}

// Hook 2
fn: async (ctx) => {
    return new Date(ctx.page.last_edited_time);  // ❌ Overwrites Hook 1!
}
```

**Problem:** Hook 2 runs and overwrites the value from Hook 1, regardless of whether it was set.

### ✅ Right: Explicit check or skip pattern

```typescript
// Hook 1 (custom, priority 40)
fn: async (ctx) => {
    const custom = parseCustomDate(ctx.page);
    if (!custom) {
        return ctx.skip();  // ✅ Falls through to default
    }
    return custom;
}

// Hook 2 (default, priority 50)
fn: async (ctx) => {
    // Only runs if Hook 1 skipped OR overwrites if not checking
    return new Date(ctx.page.last_edited_time);
}
```

**OR with explicit check:**

```typescript
// Hook 2 (default, priority 50)
fn: async (ctx) => {
    if (ctx.data) {
        return ctx.data;  // ✅ Preserve previous value
    }
    return new Date(ctx.page.last_edited_time);
}
```

---

## The Three Composition Strategies

### 1. **Overwrite (Default for Single Values)**

**When:** You want the last hook to have final say.

```typescript
// Publishing rule enforcement
hooks: [
    { name: 'allow-if-published', priority: 40, fn: checkPublished },
    { name: 'block-if-draft', priority: 50, fn: checkDraft }  // ← Can override
]
```

### 2. **Skip/Fallback (Conditional for Single Values)**

**When:** You want earlier hooks to take precedence.

```typescript
hooks: [
    { 
        name: 'custom-slug', 
        priority: 40, 
        fn: (ctx) => {
            const slug = extractCustomSlug(ctx.page);
            return slug ? slug : ctx.skip();  // ← Falls through if no custom
        }
    },
    { name: 'default-slug', priority: 50, fn: generateSlug }
]
```

### 3. **Merge (Explicit for Objects)**

**When:** You want to accumulate data from multiple hooks.

```typescript
hooks: [
    { 
        name: 'layout', 
        priority: 30, 
        fn: () => ({ layout: 'blog', featured: true })
    },
    { 
        name: 'seo', 
        priority: 40, 
        fn: (ctx) => ({ ...ctx.data, ogImage: '...', keywords: [...] })  // ← Merge
    },
    { 
        name: 'computed', 
        priority: 50, 
        fn: (ctx) => ({ ...ctx.data, wordCount: 1234 })  // ← Merge
    }
]
```

---

## Common Questions

### Q: "Does each subsequent hook check if it's already been set and skip if so?"

**A:** **No, not automatically.** Hooks always execute unless:
1. You call `ctx.skip()` in the hook
2. You call `ctx.abort()` to stop all processing
3. The hook explicitly checks `ctx.data` and returns it unchanged

### Q: "Does it overwrite, meaning if you want your hook to have the final say it should run last?"

**A:** **Yes, by default.** Without explicit checks or merge patterns, the last hook's return value becomes the final result.

### Q: "The pattern depends on the return type?"

**A:** **Yes, primarily.** 
- **Single values:** Last wins (unless you check `ctx.data`)
- **Objects:** Last wins (unless you merge with `...ctx.data`)
- The return type determines what merge pattern makes sense

### Q: "If it's a single valued type, maybe?"

**A:** **Yes, for single values:**
- Default behavior: Last hook wins (overwrite)
- Override: Use `skip()` or check `ctx.data`
- Pattern choice depends on your **intent** (precedence vs enforcement)

---

## Priority Order Matters

```typescript
// Custom takes precedence
{ name: 'custom', priority: 40 }  // Runs first
{ name: 'default', priority: 50 } // Runs second

// If custom succeeds:
//   - With skip(): default runs
//   - With return value + default checks ctx.data: custom value preserved
//   - With return value + default doesn't check: default overwrites
```

**Rule of thumb:**
- **Lower priority (30-40):** Specific/custom logic
- **Default priority (50):** Fallback/default behavior  
- **Higher priority (60-70):** Validation/enforcement (runs last, can override)

---

## Summary Table

| Scenario | Implementation | Result |
|----------|---------------|--------|
| **Multiple hooks, single value, no special logic** | Both return values | Last hook wins |
| **Multiple hooks, single value, first checks ctx.data** | Hook 1 checks `if (ctx.data)` | First hook can preserve value |
| **Multiple hooks, single value, first uses skip()** | Hook 1 calls `ctx.skip()` | Falls through to next |
| **Multiple hooks, object, no merge** | Both return objects | Last object wins (data loss!) |
| **Multiple hooks, object, explicit merge** | Use `{ ...ctx.data, newFields }` | All data accumulated |

---

**For full details:** See `.docs/2026-02-13-HOOK_COMPOSITION_GUIDE.md`
