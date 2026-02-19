# Symbiont Hook System: Dual-Pattern Architecture

**Status**: Implemented ✅  
**Date**: February 19, 2026

## Overview

Symbiont's hook system supports **two complementary patterns**:

1. **Extractor Hooks** - Pure functions for data extraction
2. **Effect Hooks** - Side-effect operations (uploads, syncs, mutations)

Both patterns coexist in the same registry and are distinguished by their event type.

---

## Pattern 1: Extractor Hooks

### Philosophy
- **Pure functions** that read from `ctx.page` and return data
- No side effects (no uploads, no API calls, no database writes)
- Compose intelligently based on return type
- Can short-circuit for efficiency (first-non-null-wins for primitives)

### Composition Behavior
| Return Type | Composition | Early Stop? |
|-------------|-------------|-------------|
| Primitives (string, number, Date, boolean) | First non-null wins | ✅ Yes |
| Objects | Deep merge all results | ❌ No |
| Arrays | Concatenate all results | ❌ No |

### Context Provided
```typescript
{
  page: PageObjectResponse;      // Notion page data
  config: DatabaseBlueprint;     // Configuration
  logger: Logger;                // Structured logging
}
```

### Events (Extractor Pattern)
- `page:exclude` - Should page be excluded?
- `page:validate` - Is page data valid?
- `metadata:title` - Extract title
- `metadata:tags` - Extract tags  
- `metadata:authors` - Extract authors
- `metadata:summary` - Extract summary
- `metadata:custom` - Extract custom metadata (merged)
- `publish:check` - Should page be published?
- `publish:date` - Determine publish date
- `slug:extract` - Extract custom slug from Notion
- `slug:generate` - Generate slug from title
- `slug:validate` - Validate slug
- `slug:transform` - Transform slug
- `content:fetch` - Fetch page content
- `content:transform` - Transform content
- `cover:extract` - Extract cover image URL

### Example: Custom Slug Extraction
```typescript
{
  name: 'caltech:issue-slug',
  event: 'slug:extract',
  priority: 40, // Before default (50)
  fn: async (ctx) => {
    const issueNum = ctx.page.properties.IssueNumber?.number;
    const volume = ctx.page.properties.Volume?.number;
    
    if (issueNum && volume) {
      return `vol-${volume}-issue-${issueNum}`;
    }
    
    return null; // Fall through to next hook
  }
}
```

### Example: Merged Custom Metadata
```typescript
// Hook 1: Layout metadata
{
  name: 'app:layout-meta',
  event: 'metadata:custom',
  priority: 30,
  fn: async (ctx) => ({
    layout: ctx.page.properties.Layout?.select?.name || 'default',
    featured: ctx.page.properties.Featured?.checkbox || false
  })
}

// Hook 2: SEO metadata (auto-merged!)
{
  name: 'app:seo-meta',
  event: 'metadata:custom',
  priority: 40,
  fn: async (ctx) => ({
    ogImage: ctx.page.properties.OGImage?.url,
    ogDescription: ctx.page.properties.Description?.rich_text?.[0]?.plain_text
  })
}

// Result: { layout, featured, ogImage, ogDescription } - all merged!
```

---

## Pattern 2: Effect Hooks

### Philosophy
- **Side effects allowed** (uploads, syncs, mutations)
- All hooks execute (no early stopping)
- Access to services (NotionClient, Supabase) via context
- Return void or success indicator
- Results collected but not composed

### Composition Behavior
- ✅ **All hooks execute** (no short-circuiting)
- Results collected in array
- Each hook can perform independent actions

### Context Provided
```typescript
{
  page: PageObjectResponse;      // Notion page data
  config: DatabaseBlueprint;     // Configuration
  logger: Logger;                // Structured logging
  services: {                    // Services for side effects
    notionClient: NotionClient;  // For syncing to Notion
    supabaseUrl: string;         // For image uploads
    serviceRoleKey: string;      // For authenticated uploads
  }
}
```

### Events (Effect Pattern)
- `content:images` - Process inline images (upload, transform URLs)
- `cover:process` - Upload/process cover image
- `sync:slug` - Sync slug back to Notion
- `sync:content` - Sync content back to Notion
- `sync:images` - Sync image URLs back to Notion

### Example: Custom Image Optimizer
```typescript
{
  name: 'app:webp-converter',
  event: 'cover:process',
  priority: 40,
  fn: async (ctx) => {
    const { notionClient, supabaseUrl, serviceRoleKey } = ctx.services || {};
    
    if (!notionClient || !ctx.config.coverProperty) {
      return; // No-op if services not available
    }
    
    // Extract cover URL
    const coverProp = ctx.page.properties[ctx.config.coverProperty];
    const coverUrl = coverProp?.files?.[0]?.file?.url;
    
    if (!coverUrl) return;
    
    // Custom logic: Convert to WebP, upload to Supabase
    const webpUrl = await convertToWebP(coverUrl);
    const uploaded = await uploadToSupabase(webpUrl, supabaseUrl, serviceRoleKey);
    
    // Sync back to Notion
    await notionClient.updateFileProperty(
      ctx.page.id,
      ctx.config.coverProperty,
      uploaded.url
    );
    
    ctx.logger.info({
      event: 'cover_converted_to_webp',
      originalUrl: coverUrl,
      webpUrl: uploaded.url
    });
  }
}
```

### Example: Custom Content Sync
```typescript
{
  name: 'app:sync-to-markdown-repo',
  event: 'sync:content',
  priority: 40,
  fn: async (ctx) => {
    // Sync content to a separate markdown repository
    const content = await ctx.services?.notionClient?.pageToMarkdown(ctx.page.id);
    
    if (content) {
      await pushToGitHub(content, ctx.page.id);
      ctx.logger.info({
        event: 'content_synced_to_github',
        pageId: ctx.page.id
      });
    }
  }
}
```

### Example: Multiple Image Processors
```typescript
// Hook 1: Optimize images
{
  name: 'app:image-optimizer',
  event: 'content:images',
  priority: 30,
  fn: async (ctx) => {
    // Optimize all images in content
    // This hook runs first
  }
}

// Hook 2: Generate thumbnails (runs independently!)
{
  name: 'app:thumbnail-generator',
  event: 'content:images',
  priority: 40,
  fn: async (ctx) => {
    // Generate thumbnails for all images
    // This hook runs after optimizer
    // Both execute regardless of results
  }
}
```

---

## When to Use Which Pattern

### Use Extractor Hooks When:
- ✅ Extracting data from Notion properties
- ✅ Transforming/computing values (slugs, titles, metadata)
- ✅ Making decisions (should publish? exclude?)
- ✅ You want composition (merge objects, concat arrays)
- ✅ You want early stopping for efficiency (first valid result)

### Use Effect Hooks When:
- ✅ Uploading files (images, documents)
- ✅ Syncing data back to Notion
- ✅ Making external API calls
- ✅ Writing to databases
- ✅ You need multiple independent operations to run
- ✅ You need access to services (NotionClient, Supabase)

---

## Architecture Details

### Hook Registry Logic

```typescript
// Effect hook events (hard-coded list)
const EFFECT_HOOK_EVENTS = [
  'content:images',
  'cover:process',
  'sync:slug',
  'sync:content',
  'sync:images'
];

// In execute() method:
if (isEffectHook(event)) {
  // Effect pattern: execute all, collect results
  const results = [];
  for (const hook of hooks) {
    results.push(await hook.fn(context));
  }
  return results;
} else {
  // Extractor pattern: compose based on type
  let result = null;
  for (const hook of hooks) {
    const output = await hook.fn(context);
    if (output === null) continue;
    
    // First non-null for primitives (stop early)
    if (isPrimitive(output)) {
      return output;
    }
    
    // Merge objects, concat arrays
    result = compose(result, output);
  }
  return result;
}
```

### Context Creation

```typescript
// Transformer provides different context for each pattern

// Extractor hooks: minimal context
const extractorContext = {
  page,
  config,
  logger
};

// Effect hooks: full context with services
const effectContext = {
  page,
  config,
  logger,
  services: {
    notionClient: this.notionClient,
    supabaseUrl: this.supabaseUrl,
    serviceRoleKey: this.serviceRoleKey
  }
};
```

---

## Migration Notes

### From Hardcoded Logic to Hooks

**Before** (hardcoded):
```typescript
// In transformer
const title = this.notionClient.getTitleProperty(page);
const tags = this.config.tagsProperty 
  ? this.notionClient.getPropertyValues(page, this.config.tagsProperty) 
  : [];
```

**After** (extractor hooks):
```typescript
// In transformer
const title = await this.hookRegistry.execute('metadata:title', context);
const tags = await this.hookRegistry.execute('metadata:tags', context);

// Default hooks handle the extraction
// Users can override with custom logic
```

**Before** (hardcoded sync):
```typescript
// In transformer
if (this.config.slugSyncProperty) {
  await this.notionClient.updateProperty(
    page.id,
    this.config.slugSyncProperty,
    slug
  );
}
```

**After** (effect hooks):
```typescript
// In transformer
await this.hookRegistry.execute('sync:slug', effectContext);

// Users can add custom hooks for additional sync operations
// All sync hooks execute independently
```

---

## Default Hooks Provided

### Extractor Hooks (10)
- ✅ `defaultPageExcludeHook` - No exclusions
- ✅ `defaultPublishCheckHook` - All pages publishable
- ✅ `defaultPublishDateHook` - Uses last_edited_time
- ✅ `defaultSlugExtractHook` - Returns null (generate from title)
- ✅ `defaultSlugGenerateHook` - Creates slug from title
- ✅ `defaultTitleExtractHook` - Extracts Title/Name property
- ✅ `defaultTagsExtractHook` - Extracts from config.tagsProperty
- ✅ `defaultAuthorsExtractHook` - Extracts from config.authorsProperty
- ✅ `defaultSummaryExtractHook` - Extracts from config.summaryProperty
- ✅ `defaultCustomMetadataHook` - Returns empty object

### Effect Hooks (5)
- ✅ `defaultCoverProcessHook` - No-op (users can override)
- ✅ `defaultContentImagesHook` - No-op (users can override)
- ✅ `defaultSyncSlugHook` - No-op (users can override)
- ✅ `defaultSyncContentHook` - No-op (users can override)
- ✅ `defaultSyncImagesHook` - No-op (users can override)

### Validation/Transform Hooks (3) - Placeholders
- ⚠️ `defaultPageValidateHook` - Returns true
- ⚠️ `defaultSlugValidateHook` - Returns true
- ⚠️ `defaultSlugTransformHook` - Returns null

---

## Best Practices

### 1. Use Appropriate Priority
```typescript
// 1-20: Pre-processing (logging, debugging)
// 30-40: Custom logic (before defaults)
// 50: Default hooks (Symbiont's behavior)
// 60-70: Post-processing (augmentation)
// 80-99: Final validation
```

### 2. Return null to Fall Through
```typescript
fn: async (ctx) => {
  const customValue = ctx.page.properties.Custom?.value;
  return customValue || null; // Falls to next hook if null
}
```

### 3. Use continueOnError for Optional Operations
```typescript
{
  name: 'app:optional-sync',
  event: 'sync:slug',
  continueOnError: true, // Don't fail if this errors
  fn: async (ctx) => {
    await riskyOperation();
  }
}
```

### 4. Log Important Operations
```typescript
fn: async (ctx) => {
  ctx.logger.info({
    event: 'custom_operation_started',
    pageId: ctx.page.id
  });
  
  const result = await operation();
  
  ctx.logger.info({
    event: 'custom_operation_completed',
    result
  });
  
  return result;
}
```

### 5. Check for Services in Effect Hooks
```typescript
fn: async (ctx) => {
  const { notionClient, supabaseUrl } = ctx.services || {};
  
  if (!notionClient || !supabaseUrl) {
    ctx.logger.warn({ event: 'services_not_available' });
    return;
  }
  
  // Safe to use services
}
```

---

## Future Enhancements

### Potential Additions
1. **Async validation hooks** - Run validations in parallel
2. **Conditional hook execution** - Run hooks based on page properties
3. **Hook dependencies** - Declare dependencies between hooks
4. **Hook middleware** - Wrap hooks with common logic
5. **Hook telemetry** - Track hook performance

### Considered but Deferred
- **ctx.data pipeline** - Rejected in favor of extractor pattern
- **ctx.skip()** - Not needed with early stopping for primitives
- **Hook chaining** - Composition handles this automatically

---

## Questions & Answers

### Q: Can I mix extractors and effects in one event?
A: No, each event is either extractor OR effect, not both. The event type determines the pattern.

### Q: Can effect hooks return data?
A: Yes, but it's not composed. The transformer receives an array of all results.

### Q: Do I need to register default hooks?
A: No, they're automatically registered by the transformer.

### Q: Can I override default hooks?
A: Yes! Register a hook with `priority < 50` and return a value. The default won't run (for primitives).

### Q: What if my hook throws an error?
A: By default, execution stops and the error propagates. Set `continueOnError: true` to ignore errors.

### Q: Can I call other hooks from within a hook?
A: No, hooks should be independent. If you need composition, use the registry's automatic composition.

---

## Summary

**Dual-pattern hook system = Best of both worlds**

- ✅ **Extractor hooks** for pure data operations (compose intelligently)
- ✅ **Effect hooks** for side effects (all execute, services provided)
- ✅ Same registry, same API, different behaviors
- ✅ Clear separation of concerns
- ✅ Flexible and extensible
- ✅ Type-safe with TypeScript

**Use cases unlocked**:
- Custom metadata extraction
- Custom slug generation
- Image optimization pipelines
- Multi-destination sync (Notion + GitHub + S3)
- Validation with external APIs
- Content transformations
- And more!
