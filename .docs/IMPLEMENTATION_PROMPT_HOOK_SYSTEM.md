# Implementation Prompt: Hook System for Symbiont CMS

**Target Agent:** Cloud Copilot / AI Code Agent  
**Date:** February 14, 2026  
**Implementation Timeline:** 8 weeks  
**References:** 
- Design: `.docs/2026-02-14-HOOK_SYSTEM_GUIDE.md`
- POC: `.docs/examples/hook-system-poc.ts`

---

## Mission

Refactor Symbiont CMS from inline function config (publishDateRule, slugRule, etc.) to a composable hook-based architecture. This is a **breaking change** affecting only two packages in this workspace: california-tech and guutz-blog.

---

## Context: Current State

### Current Config Pattern (What You'll Replace)

```typescript
// packages/california-tech/src/lib/symbiont.ts (CURRENT - 80+ lines)
export const symbiont = createSymbiontClient({
    supabase: { url, publishableKey },
    databases: [{
        alias: 'tech-article-staging',
        dataSourceId: NOTION_DATABASE_ID,
        
        // ❌ Inline function properties (30+ lines of complex logic)
        publishDateRule: (page: PageObjectResponse) => {
            const issueProperty = page.properties.Issue?.select?.name;
            if (!issueProperty) {
                const websiteDate = page.properties['Website Publish Date']?.date?.start;
                if (websiteDate) return new Date(websiteDate).toISOString();
                return page.last_edited_time;
            }
            
            // Parse "October 21, 2024" format
            const match = issueProperty.match(/(\w+)\s+(\d+),\s+(\d{4})/);
            if (match) {
                const [_, month, day, year] = match;
                const monthMap = { January: 0, February: 1, /* ... */ };
                const monthIndex = monthMap[month];
                if (monthIndex !== undefined) {
                    const date = new Date(parseInt(year), monthIndex, parseInt(day));
                    return date.toISOString();
                }
            }
            return page.last_edited_time;
        },
        
        slugRule: (page: PageObjectResponse) => {
            const slug = page.properties['Website Slug']?.rich_text?.[0]?.plain_text;
            return slug?.trim() || null;
        },
        
        customMetadata: (page: PageObjectResponse) => ({
            layout: page.properties.Layout?.select?.name || 'standard',
            featured: page.properties.Featured?.checkbox || false,
            issueNumber: page.properties.Issue?.select?.name
        })
    }]
});
```

### Current Type Definitions (What You'll Modify)

```typescript
// packages/symbiont-cms/src/lib/types/config.ts (CURRENT)
export interface DatabaseBlueprint {
    alias: string;
    dataSourceId: string;
    
    // ❌ These will be replaced with hooks
    publishDateRule?: (page: PageObjectResponse) => string | Date;
    publishRule?: (page: PageObjectResponse) => boolean;
    slugRule?: (page: PageObjectResponse) => string | null;
    customMetadata?: (page: PageObjectResponse) => Record<string, any>;
    // ... more inline function properties
}
```

---

## Goal: New Hook-Based Pattern

### New Config Pattern (What You'll Build)

```typescript
// packages/california-tech/src/lib/symbiont.ts (NEW - 10 lines)
import { calTechHooks } from './hooks/caltech.js';

export const symbiont = createSymbiontClient({
    supabase: { url, publishableKey },
    databases: [{
        alias: 'tech-article-staging',
        dataSourceId: NOTION_DATABASE_ID,
        hooks: calTechHooks  // ✅ Clean!
    }]
});
```

```typescript
// packages/california-tech/src/lib/hooks/caltech.ts (NEW)
import type { Hook } from 'symbiont-cms';
import { parseCalTechIssueDate } from './utils/date-parser.js';

export const calTechHooks: Hook[] = [
    {
        name: 'caltech:publish-date:issue-based',
        event: 'publish:date',
        priority: 40,
        fn: async (ctx) => {
            const issue = ctx.page.properties.Issue?.select?.name;
            if (issue) {
                const parsed = parseCalTechIssueDate(issue);
                if (parsed) return parsed;
            }
            
            const websiteDate = ctx.page.properties['Website Publish Date']?.date?.start;
            if (websiteDate) return new Date(websiteDate).toISOString();
            
            return null;  // Falls through to default hook
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

### New Type Definitions (What You'll Create)

```typescript
// packages/symbiont-cms/src/lib/types/hooks.ts (NEW FILE)
import type { PageObjectResponse } from '@notionhq/client';

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
    | 'cover:process';

export interface HookContext {
    page: PageObjectResponse;
    logger: Logger;
    aborted: boolean;
    abort: (reason: string) => void;
}

export type HookFunction<TOutput = any> = (
    context: HookContext
) => Promise<TOutput | null> | TOutput | null;

export interface Hook<TOutput = any> {
    name: string;
    event: HookEvent;
    priority: number;
    continueOnError?: boolean;
    fn: HookFunction<TOutput>;
}

export interface Logger {
    debug(data: any): void;
    info(data: any): void;
    warn(data: any): void;
    error(data: any): void;
}
```

```typescript
// packages/symbiont-cms/src/lib/core/hook-registry.ts (NEW FILE)
export class HookRegistry {
    private hooks: Map<HookEvent, Hook[]> = new Map();
    private logger: Logger;
    
    constructor(logger: Logger) {
        this.logger = logger;
    }
    
    register(hook: Hook): void {
        const existing = this.hooks.get(hook.event) || [];
        existing.push(hook);
        existing.sort((a, b) => a.priority - b.priority);
        this.hooks.set(hook.event, existing);
    }
    
    registerAll(hooks: Hook[]): void {
        for (const hook of hooks) {
            this.register(hook);
        }
    }
    
    async execute<TOutput = any>(
        event: HookEvent,
        page: PageObjectResponse
    ): Promise<TOutput | null> {
        const hooks = this.hooks.get(event) || [];
        
        if (hooks.length === 0) return null;
        
        const context: HookContext = {
            page,
            logger: this.logger,
            aborted: false,
            abort: (reason: string) => {
                context.aborted = true;
                context.abortReason = reason;
            }
        };
        
        let result: any = null;
        let resultType: 'primitive' | 'object' | 'array' | null = null;
        
        for (const hook of hooks) {
            if (context.aborted) {
                throw new Error(`Hook execution aborted: ${context.abortReason}`);
            }
            
            try {
                const output = await hook.fn(context);
                
                if (output === null || output === undefined) continue;
                
                // Determine result type on first non-null
                if (resultType === null) {
                    if (Array.isArray(output)) {
                        resultType = 'array';
                    } else if (typeof output === 'object') {
                        resultType = 'object';
                    } else {
                        resultType = 'primitive';
                    }
                }
                
                // Compose based on type
                if (resultType === 'primitive') {
                    // First non-null wins, stop processing
                    result = output;
                    break;
                } else if (resultType === 'object') {
                    // Merge objects
                    result = { ...result, ...output };
                } else if (resultType === 'array') {
                    // Concatenate arrays
                    result = result === null ? output : [...result, ...output];
                }
                
            } catch (error: any) {
                this.logger.error({
                    event: 'hook_execution_failed',
                    hookName: hook.name,
                    error: error?.message
                });
                
                if (!hook.continueOnError) {
                    throw error;
                }
            }
        }
        
        return result;
    }
}
```

---

## Implementation Steps

### Week 1-2: Core Types & Hook Registry

**Tasks:**
1. Create `packages/symbiont-cms/src/lib/types/hooks.ts`
   - Define `HookEvent`, `HookContext`, `HookFunction`, `Hook`
   - Export all types
   
2. Create `packages/symbiont-cms/src/lib/core/hook-registry.ts`
   - Implement `HookRegistry` class
   - Methods: `register()`, `registerAll()`, `execute()`
   - Auto-composition logic (primitives: first wins, objects: merge, arrays: concat)
   
3. Create default hooks in `packages/symbiont-cms/src/lib/hooks/defaults.ts`
   ```typescript
   export const defaultHooks: Hook[] = [
       {
           name: 'symbiont:publish:check:default',
           event: 'publish:check',
           priority: 50,
           fn: async () => true
       },
       {
           name: 'symbiont:publish:date:default',
           event: 'publish:date',
           priority: 50,
           fn: async (ctx) => ctx.page.last_edited_time
       },
       // ... more defaults
   ];
   ```

4. Write unit tests for `HookRegistry`
   - Test priority ordering
   - Test auto-composition rules
   - Test null filtering
   - Test abort behavior

**Validation:**
- [ ] `HookRegistry` compiles without errors
- [ ] Unit tests pass (100% coverage on registry)
- [ ] Default hooks are defined and exported

---

### Week 3-4: Update DatabaseBlueprint & Page Transformer

**Tasks:**
1. Update `packages/symbiont-cms/src/lib/types/config.ts`
   ```typescript
   import type { Hook } from './hooks.js';
   
   export interface DatabaseBlueprint {
       alias: string;
       dataSourceId: string;
       
       // ✅ New hook-based config
       hooks?: Hook[];
       
       // ❌ Remove these (breaking change):
       // publishDateRule?: ...
       // publishRule?: ...
       // slugRule?: ...
       // customMetadata?: ...
   }
   ```

2. Update `NotionPageToDatabasePageTransformer` to use hooks
   - Replace all inline rule calls with `hookRegistry.execute()`
   - Example:
     ```typescript
     // OLD:
     const publishDate = config.publishDateRule?.(page) || page.last_edited_time;
     
     // NEW:
     const publishDate = await hookRegistry.execute<string>(
         'publish:date',
         page
     ) || page.last_edited_time;
     ```

3. Integrate default hooks into transformer
   - Auto-register default hooks on transformer init
   - Register user hooks from `config.hooks`

4. Update `createSymbiontClient()` to accept hooks in config

**Validation:**
- [ ] Transformer compiles without errors
- [ ] Hook execution integrated into sync pipeline
- [ ] Default hooks run if no user hooks provided

---

### Week 5: Type Cleanup & Breaking Changes

**Tasks:**
1. Remove old function properties from `DatabaseBlueprint`
   - Delete: `publishDateRule`, `publishRule`, `slugRule`, `customMetadata`
   - Bump package version to `2.0.0` (breaking change)

2. Update exports in `packages/symbiont-cms/src/lib/index.ts`
   ```typescript
   // Export hook types
   export type { Hook, HookEvent, HookContext, HookFunction } from './types/hooks.js';
   export { HookRegistry } from './core/hook-registry.js';
   export { defaultHooks } from './hooks/defaults.js';
   ```

3. Update package.json
   ```json
   {
     "version": "2.0.0",
     "exports": {
       ".": "./dist/index.js",
       "./hooks": "./dist/lib/types/hooks.js"
     }
   }
   ```

**Validation:**
- [ ] Package builds successfully
- [ ] No references to old function properties
- [ ] Version bumped to 2.0.0

---

### Week 6-7: Migrate California Tech & Guutz Blog

**Tasks for California Tech:**
1. Create `packages/california-tech/src/lib/hooks/caltech.ts`
   - Extract all inline logic to hooks
   - Use naming convention: `caltech:event:variant`

2. Create `packages/california-tech/src/lib/hooks/utils/date-parser.ts`
   - Extract `parseCalTechIssueDate()` utility
   - Make it testable

3. Create `packages/california-tech/src/lib/hooks/utils/date-parser.test.ts`
   - Unit tests for date parsing logic

4. Update `packages/california-tech/src/lib/symbiont.ts`
   ```typescript
   import { calTechHooks } from './hooks/caltech.js';
   
   export const symbiont = createSymbiontClient({
       supabase: { url, publishableKey },
       databases: [{
           alias: 'tech-article-staging',
           dataSourceId: NOTION_DATABASE_ID,
           hooks: calTechHooks
       }]
   });
   ```

**Tasks for Guutz Blog:**
1. Create `packages/guutz-blog/src/lib/hooks/guutz.ts`
   - Extract any custom logic to hooks
   - May be minimal if blog uses mostly defaults

2. Update `packages/guutz-blog/src/lib/symbiont.ts`
   ```typescript
   import { guutzHooks } from './hooks/guutz.js';
   
   export const symbiont = createSymbiontClient({
       databases: [{
           hooks: guutzHooks
       }]
   });
   ```

**Validation:**
- [ ] Both packages compile without errors
- [ ] Sync works correctly (test with `curl` to `/api/sync/poll-blog`)
- [ ] Pages appear correctly on website
- [ ] Custom date logic works (California Tech)
- [ ] Custom slugs work

---

### Week 8: Documentation & Final Testing

**Tasks:**
1. Update symbiont-cms README
   - Document hook-based config
   - Show before/after examples
   - Link to `.docs/2026-02-14-HOOK_SYSTEM_GUIDE.md`

2. Add JSDoc to all hook-related types
   ```typescript
   /**
    * Lifecycle events in the page transformation pipeline.
    * 
    * Events run during sync (Notion → Database), not during queries.
    * 
    * @example
    * ```typescript
    * const hook: Hook = {
    *   name: 'my-custom-hook',
    *   event: 'publish:date',  // When to run
    *   priority: 40,           // Lower = earlier
    *   fn: async (ctx) => {
    *     return extractDate(ctx.page);
    *   }
    * };
    * ```
    */
   export type HookEvent = ...
   ```

3. Integration testing
   - Test California Tech sync with production Notion data
   - Test Guutz Blog sync with production Notion data
   - Verify no regressions

4. Performance testing
   - Measure hook execution time
   - Ensure no significant slowdown vs. inline functions

**Validation:**
- [ ] Documentation complete
- [ ] All tests passing
- [ ] No performance regressions
- [ ] Both packages work in production

---

## Key Design Principles

### 1. Hooks Are Extractors, Not Transformers

```typescript
// ✅ CORRECT: Extract from source
fn: async (ctx) => {
    return parseDate(ctx.page.properties.Date);
}

// ❌ WRONG: Don't try to transform previous results
fn: async (ctx) => {
    return modifyPreviousValue(ctx.data);  // ctx.data doesn't exist!
}
```

### 2. Return Value or Null

```typescript
// ✅ CORRECT: Return your value, or null
fn: async (ctx) => {
    const slug = extractSlug(ctx.page);
    return slug || null;  // Falls through to next hook
}

// ❌ WRONG: Don't use ctx.skip() or ctx.data
fn: async (ctx) => {
    if (!canHandle) {
        ctx.skip();  // Doesn't exist!
    }
    return ctx.data;  // Doesn't exist!
}
```

### 3. Registry Auto-Composes

**You don't need to manually merge!**

```typescript
// ✅ CORRECT: Just return your object
{
    name: 'meta:seo',
    event: 'metadata:custom',
    fn: async (ctx) => ({
        ogImage: '...',
        keywords: [...]
    })
}

// ❌ WRONG: Don't manually merge (registry does it)
fn: async (ctx) => ({
    ...ctx.data,  // Doesn't exist! Registry merges for you
    ogImage: '...'
})
```

### 4. Priority Controls Order

- **Priority 1-20:** Debug/logging hooks
- **Priority 30-40:** Custom logic (runs before defaults)
- **Priority 50:** Default hooks
- **Priority 60-70:** Post-processing
- **Priority 80-99:** Validation

---

## Testing Strategy

### Unit Tests (Week 1-2)

```typescript
// packages/symbiont-cms/src/lib/core/hook-registry.test.ts
describe('HookRegistry', () => {
    it('executes hooks in priority order', async () => {
        // Test that lower priority runs first
    });
    
    it('stops at first non-null for primitives', async () => {
        // Test that second hook doesn't run if first returns value
    });
    
    it('merges all objects', async () => {
        // Test that objects are merged together
    });
    
    it('filters out null results', async () => {
        // Test that null returns are ignored
    });
    
    it('aborts on context.abort()', async () => {
        // Test that abort stops all processing
    });
});
```

### Integration Tests (Week 6-7)

```typescript
// packages/california-tech/src/lib/hooks/caltech.test.ts
describe('California Tech Hooks', () => {
    it('parses issue date correctly', () => {
        const result = parseCalTechIssueDate('October 21, 2024');
        expect(result).toBe('2024-10-21T07:00:00.000Z');
    });
    
    it('falls back to website date', async () => {
        const mockPage = { /* ... */ };
        const result = await executeHook('publish:date', mockPage);
        // Assert fallback behavior
    });
});
```

### E2E Tests (Week 8)

```bash
# Test actual sync
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:5173/api/sync/poll-blog

# Verify pages in database
psql $DATABASE_URL -c "SELECT slug, publish_date, metadata FROM pages LIMIT 5;"

# Verify pages render
curl http://localhost:5173/blog/some-article-slug
```

---

## Migration Checklist

### Pre-Implementation
- [ ] Read `.docs/2026-02-14-HOOK_SYSTEM_GUIDE.md`
- [ ] Review `.docs/examples/hook-system-poc.ts`
- [ ] Understand current config in california-tech and guutz-blog

### Week 1-2
- [ ] Create `lib/types/hooks.ts`
- [ ] Create `lib/core/hook-registry.ts`
- [ ] Create `lib/hooks/defaults.ts`
- [ ] Write unit tests for HookRegistry
- [ ] All tests pass

### Week 3-4
- [ ] Update `DatabaseBlueprint` to include `hooks?: Hook[]`
- [ ] Integrate HookRegistry into NotionPageToDatabasePageTransformer
- [ ] Replace all inline rule calls with hook execution
- [ ] Auto-register default hooks
- [ ] Package builds successfully

### Week 5
- [ ] Remove old function properties from types
- [ ] Bump version to 2.0.0
- [ ] Update package exports
- [ ] Documentation updated

### Week 6
- [ ] Migrate California Tech to hooks
- [ ] Extract date parsing logic to utils
- [ ] Write tests for date parser
- [ ] Verify sync works

### Week 7
- [ ] Migrate Guutz Blog to hooks
- [ ] Verify sync works
- [ ] No regressions in either package

### Week 8
- [ ] Complete API documentation
- [ ] Integration tests pass
- [ ] Performance is acceptable
- [ ] Ready for production

---

## Success Criteria

### Functional Requirements
✅ California Tech sync works with hook-based config  
✅ Guutz Blog sync works with hook-based config  
✅ Custom date parsing logic works (California Tech)  
✅ Custom slug extraction works  
✅ Custom metadata works  
✅ Default hooks provide sensible fallbacks  

### Code Quality
✅ 100% test coverage on HookRegistry  
✅ Unit tests for custom hooks (date parser, etc.)  
✅ No TypeScript errors  
✅ JSDoc documentation complete  

### Performance
✅ No significant slowdown vs. inline functions (<10ms overhead per page)  
✅ Hook execution logging for debugging  

### Documentation
✅ API reference complete  
✅ Migration guide for future users  
✅ Examples in README  

---

## Common Pitfalls to Avoid

### ❌ Don't Use ctx.data
```typescript
// WRONG
fn: async (ctx) => {
    return { ...ctx.data, newField: 'value' };
}

// RIGHT
fn: async (ctx) => {
    return { newField: 'value' };  // Registry merges for you!
}
```

### ❌ Don't Use ctx.skip()
```typescript
// WRONG
fn: async (ctx) => {
    if (!canHandle) ctx.skip();
    return result;
}

// RIGHT
fn: async (ctx) => {
    if (!canHandle) return null;  // Just return null!
    return result;
}
```

### ❌ Don't Try to Access Previous Hook Results
```typescript
// WRONG (hooks are independent)
fn: async (ctx) => {
    const prevResult = getPreviousHookResult();  // Can't do this!
}

// RIGHT (extract from source)
fn: async (ctx) => {
    return extractFromPage(ctx.page);  // Always read from page
}
```

---

## Reference Files

**Design Documents:**
- `.docs/2026-02-14-HOOK_SYSTEM_GUIDE.md` - Complete design spec
- `.docs/examples/hook-system-poc.ts` - Working proof of concept

**Current Code to Modify:**
- `packages/symbiont-cms/src/lib/types/config.ts` - Add hooks, remove old props
- `packages/symbiont-cms/src/lib/core/notion-page-to-database-page-transformer.ts` - Integrate hooks
- `packages/california-tech/src/lib/symbiont.ts` - Migrate to hooks
- `packages/guutz-blog/src/lib/symbiont.ts` - Migrate to hooks

**Files to Create:**
- `packages/symbiont-cms/src/lib/types/hooks.ts`
- `packages/symbiont-cms/src/lib/core/hook-registry.ts`
- `packages/symbiont-cms/src/lib/hooks/defaults.ts`
- `packages/california-tech/src/lib/hooks/caltech.ts`
- `packages/california-tech/src/lib/hooks/utils/date-parser.ts`
- `packages/california-tech/src/lib/hooks/utils/date-parser.test.ts`
- `packages/guutz-blog/src/lib/hooks/guutz.ts`

---

## Questions? Check the Design Doc

If anything is unclear, refer to `.docs/2026-02-14-HOOK_SYSTEM_GUIDE.md` for:
- Philosophy (extractors vs transformers)
- Automatic composition rules
- Real-world examples
- Q&A section

**Good luck! This refactor will make Symbiont much more maintainable and extensible.**
