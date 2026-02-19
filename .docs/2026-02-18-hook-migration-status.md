# Hook System Migration Status

**Date**: February 18, 2026  
**Status**: Partially Migrated (40% complete)

## Overview

The Symbiont CMS hook system defines 21 hook events, but only 6 are currently being used in the page transformer. The rest of the logic is still hardcoded.

---

## Current State

### ✅ Fully Migrated (6 events)

These hooks have default implementations and are actively used:

| Event | Default Hook | Used In | Status |
|-------|-------------|---------|--------|
| `page:exclude` | ✅ | `shouldExclude()` | ✅ Working |
| `publish:check` | ✅ | `shouldPublish()` | ✅ Working |
| `publish:date` | ✅ | `getPublishDate()` | ✅ Working |
| `slug:extract` | ✅ | `resolveSlug()` | ✅ Working |
| `slug:generate` | ✅ | `resolveSlug()` | ✅ Working |
| `metadata:custom` | ✅ | `buildMetadata()` | ✅ Working |

---

### ⚠️ Hooks Exist But Not Used (4 events)

These hooks have default implementations but the transformer still uses hardcoded logic:

| Event | Default Hook | Hardcoded In | Issue |
|-------|-------------|--------------|-------|
| `metadata:title` | ✅ | `extractCoreMetadata()` | Uses `NotionClient.getTitleProperty()` directly |
| `metadata:tags` | ✅ | `extractCoreMetadata()` | Uses `NotionClient.getPropertyValues()` directly |
| `metadata:authors` | ✅ | `extractCoreMetadata()` | Uses `NotionClient.getPropertyValues()` directly |
| `metadata:summary` | ✅ | `extractCoreMetadata()` | Uses `NotionClient.getPropertyValues()` directly |

**Priority**: High - Easy migration, hooks already exist

---

### ❌ Not Implemented (11 events)

These events are defined in types but have no default hooks and aren't used:

#### Content & Image Processing (5 events)
| Event | Purpose | Hardcoded In |
|-------|---------|--------------|
| `content:fetch` | Fetch page content from Notion | `processContentAndUploadImages()` |
| `content:transform` | Transform markdown content | `processContentAndUploadImages()` |
| `content:images` | Process inline images | `processContentAndUploadImages()` |
| `cover:extract` | Extract cover image | `processCoverImage()` |
| `cover:process` | Upload/process cover image | `processCoverImage()` |

**Current Implementation**: All hardcoded in NotionPageToDatabasePageTransformer

#### Sync-back to Notion (3 events)
| Event | Purpose | Hardcoded In |
|-------|---------|--------------|
| `sync:slug` | Sync slug back to Notion | `resolveSlug()` |
| `sync:content` | Sync content back to Notion | `processContentAndUploadImages()` |
| `sync:images` | Sync image URLs back to Notion | `processCoverImage()`, `processContentAndUploadImages()` |

**Current Implementation**: Conditional logic scattered throughout transformer

#### Validation & Transforms (3 events)
| Event | Purpose | Status |
|-------|---------|--------|
| `page:validate` | Validate page data | Defined but never used anywhere |
| `slug:validate` | Validate slug uniqueness | Logic embedded in `ensureUniqueSlug()` |
| `slug:transform` | Transform/sanitize slug | Logic embedded in `createSlug()` utility |

**Current Implementation**: Validation is ad-hoc, transforms are in utilities

---

## Remaining Migration Work

### Phase 1: Metadata Extraction (High Priority)
**Effort**: Low (2-3 hours)  
**Impact**: High (enables custom metadata extraction)

- [ ] Migrate `extractCoreMetadata()` to use hooks
- [ ] Test with existing California Tech setup
- [ ] Update documentation

**Files to modify**:
- `packages/symbiont-cms/src/lib/server/notion/page-transformer.ts`

**Changes needed**:
```typescript
// Old (hardcoded)
private extractCoreMetadata(page: PageObjectResponse) {
  const title = this.notionClient.getTitleProperty(page);
  const tags = this.config.tagsProperty 
    ? this.notionClient.getPropertyValues(page, this.config.tagsProperty) 
    : [];
  // ...
}

// New (hook-based)
private async extractCoreMetadata(page: PageObjectResponse) {
  const title = await this.hookRegistry.execute<string>('metadata:title', { page, config: this.config, logger: this.logger });
  const tags = await this.hookRegistry.execute<string[]>('metadata:tags', { page, config: this.config, logger: this.logger });
  // ...
}
```

### Phase 2: Content & Image Processing (Medium Priority)
**Effort**: Medium (1-2 days)  
**Impact**: High (enables custom content fetching, image uploading strategies)

- [ ] Create `defaultContentFetchHook`
- [ ] Create `defaultContentTransformHook`
- [ ] Create `defaultContentImagesHook`
- [ ] Create `defaultCoverExtractHook`
- [ ] Create `defaultCoverProcessHook`
- [ ] Refactor `processCoverImage()` to use hooks
- [ ] Refactor `processContentAndUploadImages()` to use hooks
- [ ] Test image uploads with Supabase

**Benefits**:
- Users can override image upload destination (S3, Cloudflare R2, etc.) ## I'M NOT SURE THIS IS A PRIORITY USE CASE, THIS IS GOING TO INVOLVE A DISCUSSION OF TO WHAT EXTENT SYMBIONT IS MARRIED TO SUPABASE. I'M NOT OPPOSED TO IT, BUT IT'S A MUCH BIGGER CHANGE THAN JUST ADDING HOOKS, SO I'D SUGGEST DEFERRING THIS TO A LATER PHASE
- Users can customize content fetching (maybe use a custom Notion client) ## NOT SURE WHAT YOU'RE GETTING AT HERE OR WHY THIS WOULD BE NECESSARY
- Users can add custom markdown transformations

### Phase 3: Sync-back to Notion (Medium Priority)
**Effort**: Medium (1 day)  
**Impact**: Medium (enables conditional sync-back)

- [ ] Create `defaultSyncSlugHook`
- [ ] Create `defaultSyncContentHook`
- [ ] Create `defaultSyncImagesHook`
- [ ] Refactor sync-back logic to use hooks
- [ ] Make sync-back optional via hook return values

**Benefits**:
- Users can disable sync-back entirely
- Users can customize sync-back behavior (e.g., only sync slugs, not content)
- Better observability (hooks log their actions)

### Phase 4: Validation & Transforms (Low Priority)
**Effort**: Low (4-6 hours)  
**Impact**: Low (mostly cleanup)

- [ ] Create `defaultPageValidateHook` (no-op by default)
- [ ] Create `defaultSlugValidateHook`
- [ ] Create `defaultSlugTransformHook`
- [ ] Use hooks in appropriate places
- [ ] Consider deprecating unused events

**Benefits**:
- Cleaner architecture
- Users can add custom validation
- Better separation of concerns

---

## Architecture Notes

### Hook Composition Strategy

The hook registry composes results based on return type:

1. **Primitives** (string, number, Date, **boolean**): First non-null wins, stops processing
2. **Objects**: Deep merge all non-null results
3. **Arrays**: Concatenate all non-null results

**VERIFIED**: Booleans follow the first-non-null-wins pattern (line 254 in registry.ts), NOT AND composition.

This is already implemented in `HookRegistry.execute()`.

### Migration Challenges

1. **Metadata extraction is synchronous in current code**
   - Need to make `extractCoreMetadata()` async
   - Callers already await `transformPage()`, so no breaking changes

2. **Image processing is complex**
   - Multiple steps: extract URL → upload → sync back
   - Need to break into multiple hooks for proper composition
   - Consider: Should `cover:process` and `content:images` return URLs, or side-effect upload? ## THIS DEFINITELY REQUIRES MORE DISCUSSION. I THOUGHT THE CURRENT HOOKS IMPLEMENTATION DID AWAY WITH SIDE EFFECTS AND COMPOSITION. RETURNING VALUES IS CLEANER, BUT REQUIRES THE TRANSFORMER TO HANDLE UPLOADS. PERFORMING UPLOADS IN HOOKS (INCLUDE SUPABASE/NOTION/ETC CLIENTS IN CONTEXT??) GIVES MORE CONTROL BUT MAKES TESTING HARDER.

3. **Sync-back is conditional**
   - Currently checks `if (this.config.slugSyncProperty)`
   - Hook version: return `null` to skip sync, return value to sync

### Recommended Approach

1. Start with Phase 1 (metadata) - low risk, high value
2. Move to Phase 2 (content/images) - most complex, test thoroughly
3. Phase 3 (sync-back) - straightforward once Phase 2 is done
4. Phase 4 (validation) - polish and cleanup

---

## Questions to Resolve

1. **Should content/image hooks return URLs or perform side effects?**
   - Option A: Return URLs (cleaner, testable)
   - Option B: Perform uploads (more control, harder to test)

2. **Should `page:validate` throw errors or return boolean?**
   - Option A: Return boolean (consistent with `page:exclude`)
   - Option B: Throw errors (more expressive, can include validation messages)

3. **Should we deprecate unused events?**
   - `slug:validate` - maybe not needed if we have `page:validate`
   - `slug:transform` - utility function is fine

---

## Success Metrics

- [ ] All 21 hook events have default implementations
- [ ] All hardcoded logic moved to hooks
- [ ] Documentation updated with examples
- [ ] Test coverage > 80% for hook system (lower priority for content/image hooks due to complexity)
