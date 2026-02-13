# Hook System Architecture Diagram

## Current Architecture (Property-Based)

```
┌─────────────────────────────────────────────────────────────┐
│                    SymbiontConfig                           │
├─────────────────────────────────────────────────────────────┤
│  databases: [                                               │
│    {                                                        │
│      alias: 'blog'                                          │
│      dataSourceId: 'xxx'                                    │
│                                                             │
│      ┌───────────────────────────────────────────────┐    │
│      │  publishDateRule: (page) => { ... }          │    │
│      │  ❌ Cannot compose                            │    │
│      │  ❌ Hard to test                              │    │
│      │  ❌ Cannot reuse                              │    │
│      └───────────────────────────────────────────────┘    │
│                                                             │
│      ┌───────────────────────────────────────────────┐    │
│      │  slugRule: (page) => { ... }                 │    │
│      │  ❌ 30 lines of complex logic                │    │
│      │  ❌ Lives in config file                     │    │
│      └───────────────────────────────────────────────┘    │
│                                                             │
│      ┌───────────────────────────────────────────────┐    │
│      │  metadataExtractor: (page) => { ... }        │    │
│      │  ❌ One function does everything              │    │
│      └───────────────────────────────────────────────┘    │
│    }                                                        │
│  ]                                                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Single function call
                          ▼
            ┌─────────────────────────┐
            │   Page Transformer      │
            │   Applies rules         │
            └─────────────────────────┘
```

## Proposed Architecture (Hook-Based)

```
┌─────────────────────────────────────────────────────────────┐
│                    SymbiontConfig                           │
├─────────────────────────────────────────────────────────────┤
│  databases: [                                               │
│    {                                                        │
│      alias: 'blog'                                          │
│      dataSourceId: 'xxx'                                    │
│                                                             │
│      hooks: [                                               │
│        ┌────────────────────────────────────────────┐     │
│        │ { name: 'custom:date', event: 'publish:   │     │
│        │   date', priority: 40, fn: ... }          │     │
│        │ ✅ Named and documented                    │     │
│        │ ✅ Clear priority                          │     │
│        └────────────────────────────────────────────┘     │
│                                                             │
│        ┌────────────────────────────────────────────┐     │
│        │ { name: 'custom:slug', event: 'slug:      │     │
│        │   extract', priority: 40, fn: ... }       │     │
│        │ ✅ Extracted to separate file              │     │
│        │ ✅ Testable                                │     │
│        └────────────────────────────────────────────┘     │
│                                                             │
│        ┌────────────────────────────────────────────┐     │
│        │ { name: 'meta:layout', event: 'metadata:  │     │
│        │   custom', priority: 30, fn: ... }        │     │
│        │ ✅ Composable with other hooks             │     │
│        └────────────────────────────────────────────┘     │
│                                                             │
│        ┌────────────────────────────────────────────┐     │
│        │ { name: 'meta:seo', event: 'metadata:     │     │
│        │   custom', priority: 40, fn: ... }        │     │
│        │ ✅ Chains with previous hook               │     │
│        └────────────────────────────────────────────┘     │
│      ]                                                      │
│    }                                                        │
│  ]                                                          │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
            ┌─────────────────────────────┐
            │     Hook Registry           │
            │  (Manages all hooks)        │
            └─────────────────────────────┘
                          │
           ┌──────────────┼──────────────┐
           │              │              │
           ▼              ▼              ▼
    [Priority 30]  [Priority 40]  [Priority 50]
    Custom Hook    Custom Hook    Default Hook
           │              │              │
           └──────────────┼──────────────┘
                     Data flows through hooks
                          │
                          ▼
            ┌─────────────────────────┐
            │   Page Transformer      │
            │   Uses hook results     │
            └─────────────────────────┘
```

## Hook Execution Flow

```
Notion Page
     │
     ▼
┌─────────────────────────────────────────────────────┐
│  Event: 'publish:date'                              │
├─────────────────────────────────────────────────────┤
│                                                     │
│  Priority 30: symbiont:debug:log-properties         │
│      │ (Log all properties for debugging)          │
│      ├──> Logs: { Issue: "Oct 21, 2024", ... }     │
│      └──> Returns: null (unchanged)                 │
│                                                     │
│  Priority 40: caltech:publish:date:issue-based      │
│      │ (Extract from Issue property)               │
│      ├──> Parses: "October 21, 2024"                │
│      └──> Returns: "2024-10-21T00:00:00.000Z"       │
│                                                     │
│  Priority 50: symbiont:publish:date:default         │
│      │ (Fallback to last_edited_time)              │
│      ├──> Already have date from previous hook     │
│      └──> Skipped (not needed)                      │
│                                                     │
│  Priority 99: symbiont:debug:validate-dates         │
│      │ (Validate date format)                      │
│      ├──> Checks: Valid ISO 8601 ✓                 │
│      └──> Returns: "2024-10-21T00:00:00.000Z"       │
│                                                     │
└─────────────────────────────────────────────────────┘
     │
     ▼
Final Result: "2024-10-21T00:00:00.000Z"
```

## Hook Composition Example

```
Event: 'metadata:custom'

Initial Data: {}

     │
     ▼
[Priority 30: meta:layout]
     Input:  {}
     Output: { layout: 'feature', featured: true }
     │
     ▼
[Priority 40: meta:seo]
     Input:  { layout: 'feature', featured: true }
     Output: { layout: 'feature', featured: true, ogImage: '...', keywords: [...] }
     │
     ▼
[Priority 50: meta:computed]
     Input:  { layout: 'feature', featured: true, ogImage: '...', keywords: [...] }
     Output: { layout: 'feature', featured: true, ogImage: '...', keywords: [...], 
               wordCount: 1234, readingTime: 7 }
     │
     ▼
Final Result: {
  layout: 'feature',
  featured: true,
  ogImage: 'https://...',
  keywords: ['tech', 'news'],
  wordCount: 1234,
  readingTime: 7
}
```

## Plugin System (Future)

```
┌────────────────────────────────────────────────┐
│            User Configuration                  │
├────────────────────────────────────────────────┤
│  plugins: [                                    │
│    authorEnrichmentPlugin({ apiKey }),         │
│    seoPlugin({ generateOgImages: true }),      │
│    analyticsPlugin()                           │
│  ]                                             │
└────────────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────┐
│        Plugin Registration                     │
│  Each plugin registers its own hooks           │
├────────────────────────────────────────────────┤
│  authorEnrichmentPlugin →                      │
│    Hook: 'plugin:author-enrichment'            │
│    Event: 'metadata:authors'                   │
│    Priority: 60                                │
│                                                │
│  seoPlugin →                                   │
│    Hook: 'plugin:seo:og-image'                 │
│    Event: 'metadata:custom'                    │
│    Priority: 70                                │
│                                                │
│    Hook: 'plugin:seo:meta-tags'                │
│    Event: 'metadata:custom'                    │
│    Priority: 80                                │
└────────────────────────────────────────────────┘
           │
           ▼
┌────────────────────────────────────────────────┐
│         Global Hook Registry                   │
│  Manages all hooks from all sources            │
│  (defaults + user hooks + plugin hooks)        │
└────────────────────────────────────────────────┘
```

## Benefits Visualization

```
Current Approach                      Hook-Based Approach
══════════════                        ═══════════════════

Inline Functions                      Named Hooks
├─ Hard to test                       ├─ ✅ Easy to test
├─ Can't reuse                        ├─ ✅ Packagable/shareable
├─ No composition                     ├─ ✅ Composable
└─ No extension points                └─ ✅ Clear extension points

Single Function                       Multiple Hooks
├─ Does everything                    ├─ Single responsibility
├─ Complex logic                      ├─ Simple, focused
└─ Hard to debug                      └─ ✅ Easy to debug

No Priority Control                   Priority System
├─ Fixed order                        ├─ ✅ Configurable order
└─ Can't insert                       └─ ✅ Can insert anywhere

Config File                           Separate Files
├─ 30+ line functions                 ├─ ✅ Extracted utilities
├─ Hard to maintain                   ├─ ✅ Maintainable
└─ Copy-paste reuse                   └─ ✅ Import from packages
```

## WordPress Comparison

```
WordPress Hooks                       Symbiont Hooks (Proposed)
═══════════════                       ══════════════════════════

add_filter('the_content', fn, 10)    { name: 'custom', event: 'content:
                                        transform', priority: 10, fn }
✅ Named hooks                         ✅ Named hooks
✅ Priority system                     ✅ Priority system
✅ Multiple hooks                      ✅ Multiple hooks
✅ Plugin ecosystem                    🔮 Future: Plugin ecosystem
⚠️  Global scope                       ✅ Scoped to database config
⚠️  PHP only                           ✅ TypeScript with full typing
⚠️  Only highest priority runs         ✅ All hooks run (composable)
   (in some cases)
```

## Code Comparison

### Current: Inline Everything

```typescript
┌────────────────────────────────────────┐
│  // In src/lib/symbiont.ts            │
│  export const symbiont = create...({  │
│    databases: [{                      │
│      publishDateRule: (page) => {     │
│        // 30 lines of complex logic   │
│        const issue = ...;              │
│        const match = ...;              │
│        const date = ...;               │
│        return date;                    │
│      }                                 │
│    }]                                  │
│  });                                   │
└────────────────────────────────────────┘
```

### Proposed: Clean Separation

```typescript
┌────────────────────────────────────────┐
│  // In src/lib/symbiont.ts            │
│  import { myHooks } from './hooks';   │
│                                        │
│  export const symbiont = create...({  │
│    databases: [{                      │
│      hooks: myHooks                   │
│    }]                                  │
│  });                                   │
└────────────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────┐
│  // In src/lib/hooks/index.ts         │
│  import { parseDate } from './utils'; │
│                                        │
│  export const myHooks = [{            │
│    name: 'custom:date',                │
│    event: 'publish:date',              │
│    priority: 40,                       │
│    fn: async (ctx) => {                │
│      return parseDate(ctx.page);      │
│    }                                   │
│  }];                                   │
└────────────────────────────────────────┘
                │
                ▼
┌────────────────────────────────────────┐
│  // In src/lib/hooks/utils.ts         │
│  // ✅ Unit testable!                 │
│  export function parseDate(page) {    │
│    // Complex logic here              │
│    return date;                        │
│  }                                     │
└────────────────────────────────────────┘
```

---

**Summary:**
- **Current:** Inline functions, hard to test/reuse/compose
- **Proposed:** Named hooks with priorities, composable, testable
- **Migration:** Non-breaking addition, gradual adoption
- **Inspiration:** WordPress hooks + TypeScript typing
