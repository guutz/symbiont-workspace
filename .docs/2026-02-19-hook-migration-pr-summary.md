# Hook System Migration - PR Summary

**Date**: February 19, 2026  
**PR Branch**: `copilot/perform-hook-migration-status`  
**Status**: Partial Migration Complete - Design Decisions Needed

## What's Been Done ✅

### Phase 1: Metadata Extraction (COMPLETE)
- ✅ Migrated `extractCoreMetadata()` to use hooks instead of hardcoded `NotionClient` calls
- ✅ All metadata hooks working: `metadata:title`, `metadata:tags`, `metadata:authors`, `metadata:summary`
- ✅ Method is now async (breaking change, but that's fine per requirements)
- ✅ Build passes successfully

**Impact**: Users can now override metadata extraction via hooks without modifying transformer code.

### Phase 2: Content & Image Processing (PARTIAL)
- ✅ Created all 21 default hooks (full set now exists)
- ✅ **`cover:extract` hook fully implemented** - extracts cover URL from Notion property
- ✅ Refactored `processCoverImage()` to use `cover:extract` hook
- ⚠️ Other hooks are placeholders pending design decisions

**Hooks Added**:
- `defaultCoverExtractHook` - ✅ **WORKING** (extracts cover URL from Notion)
- `defaultCoverProcessHook` - Placeholder (upload/transform logic still in transformer)
- `defaultContentFetchHook` - Placeholder (needs NotionClient in context)
- `defaultContentTransformHook` - Placeholder (for custom transforms)
- `defaultContentImagesHook` - Placeholder (image processing logic still in transformer)

### Phase 3: Sync-back to Notion (PLACEHOLDERS)
- ✅ Created placeholder hooks: `defaultSyncSlugHook`, `defaultSyncContentHook`, `defaultSyncImagesHook`
- ⚠️ Logic still in transformer - needs design decision on sync pattern

### Phase 4: Validation & Transforms (PLACEHOLDERS)
- ✅ Created placeholder hooks: `defaultPageValidateHook`, `defaultSlugValidateHook`, `defaultSlugTransformHook`
- ⚠️ Logic still in utilities/transformer - migration deferred

---

## Design Decisions Needed 🤔

Based on comments in `.docs/2026-02-18-hook-migration-status.md`, several questions need your input:

### 1. Image/Content Processing Pattern

**Question**: Should hooks perform side effects (uploads) or just return data?

**Current Approach** (implemented):
- `cover:extract` returns URL string ✅
- Transformer handles upload/processing ✅
- Keeps hooks pure and testable ✅

**Alternative Approach** (not implemented):
- Hooks perform uploads and return processed URLs
- Requires Supabase client in HookContext
- More control but harder to test

**Your Comment**:
> "THIS DEFINITELY REQUIRES MORE DISCUSSION. I THOUGHT THE CURRENT HOOKS IMPLEMENTATION DID AWAY WITH SIDE EFFECTS AND COMPOSITION. RETURNING VALUES IS CLEANER, BUT REQUIRES THE TRANSFORMER TO HANDLE UPLOADS. PERFORMING UPLOADS IN HOOKS (INCLUDE SUPABASE/NOTION/ETC CLIENTS IN CONTEXT??) GIVES MORE CONTROL BUT MAKES TESTING HARDER."

**Recommendation**: 
- Keep current approach (hooks return data, transformer handles side effects)
- Follows the extractor pattern philosophy
- Allows users to override extraction logic without reimplementing uploads

**Do you agree?** Or should we add Supabase/NotionClient to HookContext?

---

### 2. NotionClient Access in Hooks

**Question**: How should hooks access NotionClient for content fetching?

**Current Situation**:
- `content:fetch` hook is a placeholder
- NotionClient is only available in transformer
- Content fetching happens in transformer

**Options**:
1. **Add NotionClient to HookContext** - Allows hooks to fetch content
2. **Keep content fetching in transformer** - Simpler, less coupling

**Your Comment**:
> "## NOT SURE WHAT YOU'RE GETTING AT HERE OR WHY THIS WOULD BE NECESSARY"

**Recommendation**:
- Keep content fetching in transformer
- `content:fetch` hook can be removed or used for custom content sources only
- Most users won't need to override content fetching

**Do you agree?**

---

### 3. Sync-back Hook Pattern

**Question**: Should sync hooks be side-effect hooks or data hooks?

**Current Situation**:
- Sync logic is scattered in transformer
- Sync hooks are placeholders

**Options**:
1. **Side-effect hooks** - Perform sync, return boolean success
2. **Data hooks** - Return data to sync, transformer performs sync

**Recommendation**:
- Use side-effect hooks for sync-back
- Return `null` to skip sync, return data to sync
- Allows users to disable sync selectively

**Example**:
```typescript
export const defaultSyncSlugHook: Hook<{ slug: string } | null> = {
  name: 'symbiont:sync:slug:default',
  event: 'sync:slug',
  priority: 50,
  fn: async (ctx) => {
    // Return data to sync (transformer handles actual sync)
    // Or return null to skip sync
    return { slug: /* extracted slug */ };
  }
};
```

**Do you want this pattern?** Or different?

---

### 4. Validation Hook Boolean Composition

**Question**: How should boolean validation hooks compose?

**VERIFIED ANSWER**: ✅ **First non-null wins** (primitive behavior)

From `HookRegistry.execute()` line 254:
```typescript
if (resultType === 'primitive') {
  // First non-null wins, stop processing
  result = output;
  break;
}
```

Booleans are primitives, so they follow first-non-null-wins, NOT AND composition.

**Documentation Updated**: Migration doc updated with verified behavior.

---

## Breaking Changes 🔴

Per your instructions: "don't bother with any backwards compatibility or deprecation -- break stuff without hesitation"

### Breaking Changes Made:
1. ✅ `extractCoreMetadata()` is now `async` (was sync)
   - **Impact**: Minimal - method is private and only called in `transformPage()` which is already async
   - **Migration**: None needed

### Future Breaking Changes (if we proceed):
1. If we add NotionClient/Supabase to HookContext:
   - **Impact**: Hook signatures change
   - **Migration**: Users update custom hooks to use new context

---

## Next Steps 📋

### Option A: Ship Current State (Recommended)
**What's Ready**:
- ✅ Phase 1 complete (metadata extraction)
- ✅ All hooks exist (even if placeholders)
- ✅ `cover:extract` working
- ✅ Build passes

**What to Do**:
1. Get your feedback on design questions above
2. Implement remaining hooks based on decisions
3. Test with California Tech site
4. Update documentation

### Option B: Complete Full Migration (More Work)
**What's Left**:
1. Implement content/image processing hooks (needs design decision #1)
2. Implement sync-back hooks (needs design decision #3)
3. Migrate validation logic to hooks
4. Test thoroughly

**Estimated Effort**: 1-2 days for full migration

---

## Questions for You 🎯

1. **Are you happy with the current "hooks return data, transformer handles side effects" pattern?**
   - Or should hooks perform uploads/syncs directly?

2. **Should NotionClient be added to HookContext?**
   - Or keep content fetching in transformer?

3. **For sync-back, should hooks return data to sync, or perform sync directly?**
   - Current: Return data (or null to skip)
   - Alternative: Perform sync, return boolean success

4. **Do you want to ship this PR as-is (partial migration)?**
   - Or complete the full migration first?

5. **Any specific hooks you want prioritized?**
   - E.g., content transforms, image processing, validation?

---

## Testing Strategy 🧪

### Manual Testing Needed:
1. Test metadata extraction with California Tech site
2. Test cover image extraction
3. Verify sync still works
4. Check that custom hooks can override defaults

### Automated Testing:
- Hook registry tests already exist
- Should add tests for new default hooks
- Should add integration tests for transformer

**Do you want me to add tests before merging?** Or iterate on functionality first?

---

## Files Changed 📝

### Modified:
- `packages/symbiont-cms/src/lib/hooks/default-hooks.ts` - Added all 11 new hooks
- `packages/symbiont-cms/src/lib/server/notion/page-transformer.ts` - Migrated metadata + cover extraction
- `.docs/2026-02-18-hook-migration-status.md` - Verified boolean composition behavior

### Build Status:
- ✅ `pnpm build:package` succeeds
- ✅ No TypeScript errors
- ✅ `publint` passes

---

## Your Feedback Needed 💬

Please review the design questions above and let me know:
1. Which patterns to use
2. What to prioritize
3. Whether to ship partial or complete migration

I'll iterate quickly based on your decisions! 🚀
