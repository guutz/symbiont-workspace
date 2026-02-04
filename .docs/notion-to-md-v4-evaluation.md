# Notion-to-MD v4 Evaluation

**Date**: February 4, 2026  
**Current Version**: v3.1.9  
**Latest Stable**: v3.1.9  
**V4 Status**: Alpha (v4.0.0-alpha.7)

## Executive Summary

**Recommendation**: **Stay on v3.1.9** for now. V4 is still in alpha and brings significant architectural changes that would require substantial refactoring. The custom transformer approach in v3 solves our immediate image alt text issue effectively.

---

## Current v3.1.9 Status

### What We Use
- **Package**: `notion-to-md@3.1.9`
- **Purpose**: Convert Notion page blocks to Markdown
- **Location**: `packages/symbiont-cms/src/lib/server/notion/client.ts`
- **Integration Point**: `NotionClient.pageToMarkdown()`

### v3 Features We Rely On
1. **Basic block conversion** - Headings, paragraphs, lists, code blocks
2. **Image handling** - External URLs and file URLs
3. **Custom transformers** - Override default behavior (we use this for images)
4. **Nested blocks** - Handles parent-child block relationships

### Current Issues (Resolved)
- ✅ **Image alt text problem** - FIXED via custom transformer
  - **Problem**: Images without captions showed filename as alt text (`![image.png](url)`)
  - **Solution**: Custom transformer outputs empty alt text when no caption (`![](url)`)
  - **Implementation**: `coordinator.ts` lines 38-64

---

## V4 Alpha Analysis

### V4 Major Features (from npm description)
> "Convert notion pages, block and list of blocks to markdown, html, jsx, latex, pdf and literally anything and export anywhere"

### Key Changes in V4

#### 1. **Multi-Format Output**
- Not just Markdown - supports HTML, JSX, LaTeX, PDF
- **Impact**: Potentially useful but we only need Markdown
- **Migration Effort**: Low (we'd just use MD output)

#### 2. **Enhanced Media Handling**
From v4 blog post titles (README):
- "Mastering Media Handling in notion-to-md v4 - Download, Upload, and Direct Strategies"
- **Impact**: HIGH - This could overlap with our image upload strategy
- **Question**: Does v4 handle image uploads to external storage (like Supabase)?
- **Current State**: We manage image uploads ourselves in `NotionPageToDatabasePageTransformer`

#### 3. **Properties to Frontmatter**
- "How to Convert Notion Properties to Frontmatter with notion-to-md v4"
- **Impact**: MEDIUM - We extract properties separately but this could simplify
- **Current State**: We handle properties via `NotionClient.getPropertyValues()`

#### 4. **Document Handling**
- "How to Handle Documents in Notion Using notion-to-md v4"
- **Impact**: Unknown - depends on what "documents" means

#### 5. **Comments as Footnotes**
- "How to Convert Notion Comments to Markdown Footnotes with notion-to-md v4"
- **Impact**: LOW - We don't currently use Notion comments

#### 6. **Page Reference Handler**
- URL mentioned: `https://notionconvert.com/docs/v4/concepts/page-reference-handler/`
- **Impact**: Unknown (site was blocked when checking)
- **Potential**: Could relate to how we handle child pages or page links

### V4 Risks

1. **Alpha Stability** - v4 is still alpha (v4.0.0-alpha.7), not production-ready
2. **Breaking Changes** - Likely significant API changes from v3
3. **Documentation** - V4 docs are on notionconvert.com (blocked for us to access)
4. **Migration Cost** - Would need to refactor our NotionClient integration
5. **Dependency Updates** - May require newer @notionhq/client version

---

## Feature Comparison

| Feature | v3.1.9 (Current) | v4.0.0-alpha.7 | Symbiont Need |
|---------|------------------|----------------|---------------|
| **Markdown Output** | ✅ | ✅ | ✅ Required |
| **HTML Output** | ❌ | ✅ | ❌ Not needed (we use markdown-it) |
| **Custom Transformers** | ✅ | Unknown | ✅ Critical (images) |
| **Image URLs** | ✅ | ✅ | ✅ Required |
| **Image Upload** | ❌ | ✅ (maybe?) | ✅ We handle ourselves |
| **Property Extraction** | ❌ | ✅ (frontmatter) | ⚠️ We do this separately |
| **Nested Blocks** | ✅ | ✅ (assumed) | ✅ Required |
| **Stability** | ✅ Stable | ⚠️ Alpha | ✅ Required |

---

## Migration Path (If/When v4 Stabilizes)

### Prerequisites
1. Wait for stable v4.0.0 release (not alpha)
2. Access v4 documentation (notionconvert.com)
3. Review full changelog and breaking changes
4. Test in dev environment first

### Steps
1. **Phase 1: Research**
   - Access v4 docs and examples
   - Identify breaking changes
   - Map v3 features to v4 equivalents
   - Evaluate if v4's image handling can replace ours

2. **Phase 2: Testing**
   - Install v4 in test branch
   - Update NotionClient integration
   - Recreate custom image transformer (if still needed)
   - Test with real Notion pages

3. **Phase 3: Refactor (if beneficial)**
   - Consider using v4's property-to-frontmatter
   - Consider using v4's media handling (if compatible with Supabase)
   - Update tests
   - Update documentation

### Estimated Effort
- **Research**: 2-4 hours
- **Testing**: 4-8 hours
- **Refactor**: 8-16 hours (if we adopt new features)
- **Total**: 14-28 hours

---

## Potential Benefits of V4

### If v4's Media Handling is Good...
Could potentially replace our custom logic in:
- `NotionPageToDatabasePageTransformer.processImages()`
- Image uploading to Supabase Storage
- Image URL rewriting

**BUT**: We'd need to verify v4 can:
- Upload to our Supabase bucket
- Generate proper public URLs
- Preserve image captions
- Handle image metadata

### If v4's Property Handling is Good...
Could simplify:
- `NotionClient.getPropertyValues()`
- Front matter generation in transformation layer

---

## Recommendations

### Short Term (Now)
✅ **Stay on v3.1.9**
- Stable and proven
- Custom transformer solves image alt text issue
- No urgent need for v4 features

### Medium Term (Next 3-6 months)
⏸️ **Monitor v4 Progress**
- Watch for stable v4.0.0 release
- Read release notes when available
- Assess if v4 features align with our roadmap

### Long Term (6+ months)
🔄 **Consider Migration If:**
1. V4 reaches stable release
2. V4's media handling can simplify our image pipeline
3. No significant breaking changes or workarounds needed
4. Community adoption is strong

---

## Related Documentation

- **Current Implementation**: `.docs/IMPLEMENTATION_STATUS.md`
- **Image Strategy**: `.docs/image-optimization-strategy.md`
- **Notion Integration**: `.docs/symbiont-cms.md` (Notion Client section)

---

## Questions to Answer (When v4 is Stable)

1. Does v4 support custom transformers?
2. Can v4 upload images to external storage (Supabase)?
3. Does v4 handle image captions correctly by default?
4. What's the performance difference between v3 and v4?
5. Does v4 require a newer @notionhq/client version?
6. Are there any security improvements in v4?

---

## Conclusion

V3.1.9 meets our needs effectively, especially with the custom transformer solution for image alt text. V4 is promising but premature for production use. We should revisit this evaluation once v4 reaches stable release and we can access comprehensive documentation.

**Decision**: Stay on v3.1.9 ✅
