# Notion ↔ Markdown Absorption Memo

**Date**: March 9, 2026  
**Status**: Design  
**Addresses**: Inline equation round-trip bug, stale-build instability, external dependency fragility  
**Depends on**: hook system (shipped), block sync/diff (PR #11)

---

## Problem Statement

Symbiont's Notion ↔ Markdown pipeline depends on two external packages:

| Package | Direction | Owned? | Issue |
|---------|-----------|--------|-------|
| `notion-to-md@3.1.9` | Notion blocks → Markdown string | No (npm dep) | Emits inline equations as `$expr$`; no option to change |
| `@tryfabric/martian` (fork) | Markdown string → Notion blocks | Yes (workspace fork) | Uses `remark-math@4` which parses single `$` as `inlineMath`; no opt-out. Requires separate compile step that goes stale. |

This creates an **unsolvable round-trip conflict**: `notion-to-md` emits `$expr$` for inline equations, `remark-math` also interprets stray `$5.00` as `inlineMath`. Any fix for one direction breaks the other. The options explored so far (emit as plain text, re-parse inner content) are workarounds, not solutions.

Additionally:
- The martian fork requires a separate `npm run compile` step; forgetting it produces stale builds and silent bugs.
- `notion-to-md` v3 is unmaintained; v4 is alpha with architectural mismatches (see `2026-01-15-notion-to-md-v4-evaluation.md`).
- Between both packages, Symbiont uses ~40% of their features and works around several of their design decisions.

---

## Goal

**Absorb the _used_ functionality of both packages into symbiont-cms** (or a local companion module), eliminating external variables and owning the equation semantics end-to-end.

Non-goals:
- Rewriting the block-diff algorithm (already in symbiont, keep as-is)
- Changing the HTML rendering pipeline (`markdown-it` + `@mdit` plugins — unrelated, keep as-is)
- Supporting `notion-to-md` v4's file-based export paradigm

---

## Current Architecture

```
NOTION → DB (read direction)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Notion API
  → notion-to-md  (n2m.pageToMarkdown → MdBlock[])
  → n2m.toMarkdownString → raw markdown
  → hook pipeline (content:text → content:media → content:postprocess)
  → Supabase pages.content

DB → NOTION (write-back direction)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pages.content (markdown string)
  → @tryfabric/martian  (markdownToBlocks → BlockObjectRequest[])
  → diffBlocks (symbiont's own)
  → Notion API patchPageBlocks / updatePageBlocks

DB → BROWSER (render direction)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
pages.content (markdown string)
  → markdown-it + @mdit plugins (including @mdit/plugin-katex)
  → HTML + TOC
  → SSR to browser
```

---

## What We Actually Use

### From notion-to-md (~640 lines shipped JS)

| Feature | Used? | Notes |
|---------|-------|-------|
| `pageToMarkdown()` | ✅ | Paginated block fetching + recursive children |
| `blocksToMarkdown()` | ✅ | Block-to-MdBlock conversion |
| `toMarkdownString()` | ✅ | MdBlock[] → string (in page-transformer bridge step) |
| `blockToMarkdown()` | ✅ | Individual block → markdown string |
| `setCustomTransformer()` | ✅ | Used for image alt text fix |
| `annotatePlainText()` | ✅ | Bold/italic/strikethrough/code/underline on rich text |
| Inline equation emission | ✅ | **Broken** — uses `$expr$`, ambiguous with currency |
| Block equation emission | ✅ | Uses `$$\nexpr\n$$`, correct |
| Toggle → `<details>` HTML | ❌ | Works but not rendered by markdown-it anyway |
| Image base64 embedding | ❌ | We upload to Supabase storage instead |
| `separateChildPage` | ❌ | Not used |
| `modifyNumberedListObject()` | ✅ | Auto-numbering for ordered lists |

### From martian fork (~1400 lines TS source)

| Feature | Used? | Notes |
|---------|-------|-------|
| `markdownToBlocks()` | ✅ | Core MD→Notion conversion |
| `markdownToRichText()` | ❌ | Not imported anywhere in symbiont |
| Inline formatting (bold/italic/strike/code/link) | ✅ | |
| Headings (1-3) | ✅ | |
| Lists (bulleted/numbered/checkbox + nesting) | ✅ | |
| Code blocks with language | ✅ | |
| Blockquotes | ✅ | |
| GFM alert → callout | ✅ | Nice feature to keep |
| Emoji callout detection | ⚠️ | Optional, not configured in california-tech |
| Tables | ✅ | |
| Images | ✅ | |
| Block equations (`$$`) | ✅ | |
| Inline equations (`$`) | ✅ | **Broken** — remark-math can't distinguish math from currency |
| TOC detection (`[[*TOC*]]`) | ❌ | Legacy, not used |
| Image URL validation | ⚠️ | Disabled via `strictImageUrls: false` |
| 2000-char chunking | ✅ | Required by Notion API |
| Language alias map | ✅ | Maps e.g. `js` → `javascript` |
| Notion limits enforcement | ✅ | 1000 blocks, 100 rich_text arrays |

---

## Proposed Architecture

### New Module: `symbiont-cms/src/lib/server/notion-md/`

A single, focused module inside symbiont-cms that handles both conversion directions. No external package, no separate compile step.

```
src/lib/server/notion-md/
├── blocks-to-markdown.ts    # Notion blocks → markdown string (replaces notion-to-md)
├── markdown-to-blocks.ts    # Markdown string → Notion blocks (replaces martian)
├── rich-text.ts             # Shared: Notion RichText ↔ inline markdown
├── types.ts                 # Notion block types, MdBlock, limits
└── languages.ts             # Code language map + validation
```

### Key Design Decisions

#### 1. Equation Delimiter Convention

**The root cause**: `$` is ambiguous. We need to pick an unambiguous convention for the markdown that sits in `pages.content`.

**Decision**: Use `$$expr$$` for both block and inline equations in the stored markdown. The distinction between the two is **structural**, not lexical:

- **Inline equation**: `$$expr$$` appears alongside other text within a paragraph
- **Block equation**: `$$expr$$` is the sole content of a paragraph (surrounded by blank lines)

Examples:
```
The formula $$E = mc^2$$ is well known.          ← inline (paragraph has other text)

$$                                                ← block (paragraph contains only this)
\begin{align}
  F &= ma \\
  E &= mc^2
\end{align}
$$
```

Note: Notion's native representation is already unambiguous — `equation` is its own block type, and inline equations are a `rich_text` item with `type: 'equation'`. The `$$`/`$` ambiguity only exists in the intermediate markdown stored in `pages.content`. We own both ends, so we define the convention.

Why not `\[...\]` / `\(...\)` (standard LaTeX delimiters)? They're unambiguous in prose, but `@mdit/plugin-katex` tokenizes on `$$`/`$` and won't pass `\[...\]` through to KaTeX without custom delimiter configuration. Using `$$` means the stored markdown is directly renderable by the existing HTML pipeline with no preprocessing step.

This works because:
- `@mdit/plugin-katex` handles `$$expr$$` as display math when it stands alone, and inline math when it's mid-paragraph — matching our convention exactly
- No ambiguity with prose `$` (single dollar signs are never math)
- Inline expressions can contain newlines freely (multi-line LaTeX inside a paragraph is valid)
- No need for `remark-math` at all in the MD→Notion direction — we write our own `$$` tokenizer (~30 lines)

#### 2. Notion→MD Direction (replaces notion-to-md)

The new `blocks-to-markdown.ts` needs to:

1. **Fetch blocks** from Notion API with pagination (reuse `NotionClient.getBlocks()` which is already paginated)
2. **Convert each block** to a markdown string — straightforward pattern-match on block type
3. **Handle rich text annotations** — bold, italic, strikethrough, code, underline, links
4. **Handle inline equations** — emit `$$expr$$` (not `$expr$`)
5. **Handle block equations** — emit `$$\nexpr\n$$` 
6. **Support custom transformers** — preserve the `setCustomTransformer()` API that california-tech's image hook relies on
7. **Recursive children** — toggle blocks, quotes, callouts, lists can have children

**What we don't need**:
- `MdBlock[]` intermediate type — we go straight to string. The `toMarkdownString()` bridge step in page-transformer becomes unnecessary
- Base64 image conversion
- Separate child page handling
- `modifyNumberedListObject` preprocessing — we handle numbering inline

#### 3. MD→Notion Direction (replaces martian)

The new `markdown-to-blocks.ts` needs to:

1. **Parse markdown** with `unified` + `remark-parse` + `remark-gfm` (these are already indirect deps, stay on unified@9/CJS for now)
2. **Not use remark-math** — instead, implement a small custom tokenizer that only matches `$$...$$` (both block and inline)
3. **Convert AST to Notion blocks** — same cases as current martian fork
4. **Enforce Notion limits** — 2000 char chunking, 1000 block cap, 100 rich_text cap

#### 4. Shared Rich Text Module

Both directions need to work with Notion's `RichText` objects. The `rich-text.ts` module provides:

- `richTextToMarkdown(rt: RichText[]): string` — annotations → markdown inline formatting
- `markdownInlineToRichText(node: PhrasingContent): RichText[]` — AST nodes → Notion rich text
- `richText(content, options)` helper — create RichText objects (from current martian/common.ts)

---

## Implementation Plan

### Phase 1: `blocks-to-markdown.ts` (replaces notion-to-md)

**Approach**: Write fresh. The notion-to-md code is ~490 lines of compiled JS with fetch-polyfill, markdown-table dep, and patterns we don't need. Cleaner to rewrite against Notion API types we already have.

**Scope**:
- Block type converter (~200 lines — each case is 2-5 lines of template string)
- Rich text annotation serializer (~50 lines — reuse `annotatePlainText` logic)
- Recursive block walker with indentation tracking (~60 lines)
- Custom transformer registry (~20 lines)
- Pagination: **removed** — `NotionClient.getBlocks()` already handles this

**Total estimate**: ~350 lines

**Handled block types** (13 types currently used):
`paragraph`, `heading_1/2/3`, `bulleted_list_item`, `numbered_list_item`, `to_do`, `code`, `quote`, `callout`, `divider`, `image`, `equation`, `table` + `table_row`, `toggle`

Unhandled types fall through to processing their `rich_text` property (current notion-to-md behavior).

#### Equation output:
```typescript
// Notion equation block → standalone paragraph in stored markdown
case 'equation':
  return `$$${block.equation.expression}$$`;
  // (serialized with surrounding blank lines by the paragraph walker)

// Notion inline equation (rich_text item with type === 'equation')
// When rt.type === 'equation':
`$$${rt.equation.expression}$$`
// (block vs inline distinguished at parse time by paragraph context, not by delimiters)
```

### Phase 2: `markdown-to-blocks.ts` (replaces martian fork)

**Approach**: Lift and adapt from the fork. The parser logic in `internal.ts` is well-structured and handles edge cases (GFM alerts, emoji callouts, image extraction from paragraphs, table parsing). Rewriting from scratch would re-introduce bugs.

**What to bring over** (~400 lines, trimmed from 480):
- `parseInline()` — inline formatting → RichText
- `parseParagraph()` — paragraph with image extraction
- `parseBlockquote()` — quotes, GFM alerts, emoji callouts
- `parseHeading()`, `parseCode()`, `parseList()`, `parseTable()`, `parseMath()`
- `parseNode()` — top-level dispatcher
- `parseBlocks()` — root parser with limit enforcement

**What to remove**:
- `remark-math` dependency — replace with custom `$$` tokenizer
- `markdownToRichText()` — unused
- `parseInlineString()` — workaround that goes away
- Image URL validation — already disabled

**What to add**:
- Custom `remarkDoubleDollarMath` plugin (~30 lines) that:
  - Tokenizes `$$...$$` spans regardless of internal newlines
  - Block vs inline is determined by AST context: a paragraph whose only child is a `$$...$$` span → Notion `equation` block; a `$$...$$` span alongside other content → Notion `rich_text` equation item
  - Ignores single `$` entirely — never treated as math

**Total estimate**: ~450 lines

### Phase 3: Wire into symbiont-cms

1. **Update `NotionClient`**: Remove `n2m` property, add `blocksToMarkdown(pageId)` method that uses new module
2. **Update `page-transformer.ts`**: Remove `mdBlocksToString()` bridge — new module returns string directly
3. **Update `defaultContentPreprocessHook`**: Call `notionClient.blocksToMarkdown()` instead of `n2m.pageToMarkdown()`
4. **Update `defaultContentSyncHook`**: Call new `convertMarkdownToNotionBlocks()` (same name, different import)
5. **Update `coordinator.ts`**: Remove `NotionToMarkdown` import and custom transformer setup; configure block-to-markdown transformers on `NotionClient` instead
6. **Remove deps**: `notion-to-md`, `@tryfabric/martian` from package.json
7. **Remove package**: `packages/markdown-to-notion/` directory
8. **Remove prebuild**: Drop `prebuild` script from symbiont-cms package.json

### Phase 4: Verify

- Run existing test suite
- Manual sync test with california-tech staging database
- Verify: equations round-trip correctly (Notion → DB → Notion)
- Verify: prose with `$` signs stays as plain text
- Verify: GFM alerts convert to callouts and back
- Verify: images, tables, code blocks, lists all round-trip

---

## Future Extension: Custom Markdown Processing Steps

This absorption creates a clean foundation for a configurable **content transform pipeline** — processing steps that run on the markdown string between `content:text` and `content:postprocess` during Notion→DB sync.

This is a separate concern from the equation tokenizer (which is fixed parser infrastructure) and from the HTML renderer (which is a separate DB→browser direction). The transform layer operates purely on the stored markdown string.

Two known future use cases:

### `htmlCodeToEmbed`

Notion ` ```html ` code blocks contain raw HTML (e.g. interactive embeds, custom widgets) that should be inlined directly into the page rather than rendered as a fenced code block.

In the **DB→browser direction**, this is a `markdown-it` fence renderer override — purely a renderer-level change in `to-html-renderer.ts`, ~10 lines, conditioned on `lang === 'html'`. No AST work needed.

In the **Notion→DB direction**, no transform is needed — the code block is stored as-is. The renderer is what decides what to do with it.

### `resolveNotionPageLinks`

Notion pages can contain links to other Notion pages (`link_to_page` blocks, or inline `rich_text` items whose `href` points to a `notion.so` URL). In the stored markdown these currently come through as raw `https://www.notion.so/{page-id}` links, which are useless on the public website.

The desired behavior: if the linked Notion page is also in the same database *and* is published (`publish_at IS NOT NULL`), rewrite the link to the page's slug on the website (e.g. `/posts/my-article`).

**Where it lives**: Sync-time content transform (Notion→DB direction), after the markdown string is produced. It needs Supabase access to look up `page_id → slug` mappings, which means it can't be a pure string transform — it needs to run in a step that has access to `ctx.services.supabase`. This makes it a candidate for a built-in default hook (`content:postprocess`) rather than a stateless `blockTransform`.

**The harder parts**:
- `blocks-to-markdown.ts` needs to preserve raw Notion page IDs in link hrefs rather than losing them (notion-to-md currently emits a full `notion.so` URL; we need to make sure the page ID survives)
- Links to unpublished pages or pages in a different database must be handled gracefully (strip to plain text, or keep the notion.so URL as a fallback)
- The resolution needs to be efficient — batch-load all `page_id → slug` mappings for the datasource once per sync, not one query per link (same pattern as the slug conflict map in `defaultSlugConflictHook`)

**Rough approach**: In `blocks-to-markdown.ts`, when serializing a `link_to_page` block or a rich_text item with a Notion internal href, emit a sentinel URL like `notion://page/{page-id}`. Then a `resolveNotionPageLinks` transform (run in `content:postprocess` with supabase access) replaces `notion://page/{id}` with the resolved slug, or strips to plain text if unresolvable.

For structured configuration, these would sit in `DatabaseBlueprint.markdown`:

```typescript
markdown?: {
  // Existing renderer config
  toc?: { enabled?: boolean; minHeadingLevel?: number; maxHeadingLevel?: number };
  images?: { lazy?: boolean };

  // Sync-time content transforms (Notion → DB direction)
  blockTransforms?: {
    htmlCodeToEmbed?: boolean;       // treat ```html blocks as raw HTML passthrough in the renderer
    resolveNotionPageLinks?: boolean; // rewrite notion:// page links to public slugs (default: true if slugs are configured)
    // additional transforms...
  };
}
```

Note: The `blockTransforms` layer is distinct from the hook system. Hooks handle page-level orchestration (slugs, metadata, publish state). Block transforms handle inline content mutations on the markdown string itself. Users who need something not covered by a built-in transform can still use `content:postprocess`.

---

## Dependencies After Absorption

**Removed**:
- `notion-to-md` (npm)
- `@tryfabric/martian` / `packages/markdown-to-notion/` (workspace)
- `remark-math` (transitive via martian)
- `markdown-table` (transitive via notion-to-md)

**Kept** (already in symbiont-cms or available):
- `unified` + `remark-parse` + `remark-gfm` — need to add as direct deps of symbiont-cms (~30KB total, mature, stable)
- `@notionhq/client` — already a direct dep

**Unchanged** (HTML rendering, separate concern):
- `markdown-it` + all `@mdit/plugin-*` — SSR rendering pipeline, untouched
- `@mdit/plugin-katex` — handles `$$expr$$` inline rendering correctly already

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Regressions in block conversion | Write conversion tests for each block type before removing old packages |
| Missing edge cases in notion-to-md | Current version is 490 lines of compiled JS; every code path is auditable |
| `unified@9` (CJS) is old | It works, and we stop pulling in remark-math so the version constraint relaxes. Can upgrade to ESM later independently. |
| Numbered list auto-sequencing | Simple counter reset logic, easily inlined |
| Custom transformer API change | Keep the same `setCustomTransformer(type, fn)` signature |
| `markdown-table` for table rendering | Use a 15-line inline implementation or keep as dep (it's tiny) |

---

## Size Estimate

| Component | Lines | Complexity |
|-----------|-------|-----------|
| `blocks-to-markdown.ts` | ~350 | Medium (pattern-match on block types) |
| `markdown-to-blocks.ts` | ~450 | Medium (adapted from martian fork) |
| `rich-text.ts` | ~80 | Low (formatting helpers) |
| `types.ts` | ~60 | Low (type definitions + limits) |
| `languages.ts` | ~80 | Low (static map) |
| Custom `$$` tokenizer | ~30 | Low (remark plugin) |
| Wiring changes (5 files) | ~50 net | Low (swap imports) |
| **Total new code** | **~1100** | |
| **Code removed** | **~2100** | (martian src + notion-to-md) |

Net reduction of ~1000 lines. More importantly: one compile step, zero external markdown conversion deps, owned equation semantics.
