# Markdown Compatibility Guide

> **Critical**: This document defines the markdown syntax contract between content sources (Notion, Tiptap) and the Symbiont CMS markdown processor

## Overview

Symbiont CMS content comes from two sources:
1. **Notion** - via `notion-to-md` library (v3.1.9)
2. **Tiptap** - via custom markdown export (future implementation)

Both must output markdown that **markdown-it** (with our plugins) can correctly parse and render.

---

## Notion Markdown Output (`notion-to-md`)

### Standard CommonMark Support

Notion-to-md outputs standard CommonMark syntax:

```markdown
# Heading 1
## Heading 2
### Heading 3

**bold text**
*italic text*
~~strikethrough~~

- bullet list
- item 2
  - nested item

1. numbered list
2. item 2

- [ ] unchecked checkbox
- [x] checked checkbox

> blockquote

`inline code`

\```javascript
code block
\```

![image alt](https://image-url.com)

[link text](https://url.com)
```

✅ **All supported** by `markdown-it` with default configuration

---

### Notion-Specific Syntax

#### 1. **Tables**
Notion outputs GitHub Flavored Markdown (GFM) tables:

```markdown
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
```

✅ **Supported** by `markdown-it` with `linkify: true`

#### 2. **Task Lists (Checkboxes)**
```markdown
- [ ] Unchecked
- [x] Checked
```

✅ **Supported** by `@mdit/plugin-tasklist` (if we add it, currently NOT in our config)

⚠️ **Action needed**: Add `@mdit/plugin-tasklist` if we want checkbox rendering

#### 3. **Embeds**
Notion exports embeds as links or iframes:

```markdown
[Embed Title](https://embed-url.com)
```

✅ **Supported** by `@mdit/plugin-embed` - automatically converts URLs to embeds

#### 4. **Callouts/Admonitions**
Notion doesn't export callouts as special markdown - they become blockquotes:

```markdown
> ⚠️ This is a callout
```

⚠️ **Limitation**: Loses semantic meaning (no info/warning/danger distinction)

**Solution**: Consider custom transformer in `notion-to-md` or post-processing

#### 5. **Text Colors & Highlights** ⚠️ **CRITICAL LIMITATION**

**Notion API provides color data** in `annotations.color` property:
- Text colors: `"red"`, `"blue"`, `"yellow"`, etc.
- Backgrounds/Highlights: `"red_background"`, `"blue_background"`, etc.

**notion-to-md v3.1.9 IGNORES this data** - colors are stripped in the `annotatePlainText()` method.

**Status**: 
- ❌ Not supported in v3.1.9
- 🚧 Planned for v4 ([Issue #100](https://github.com/souvikinator/notion-to-md/issues/100), [Issue #145](https://github.com/souvikinator/notion-to-md/issues/145))
- ✅ We already support `==highlight==` syntax via `@mdit/plugin-mark`

**Workarounds**:

**Option 1: Wait for notion-to-md v4** (recommended for simplicity)
- v4 will likely export highlights as `==text==` (Issue #145 proposal)
- We already support this syntax!

**Option 2: Custom Transformer** (immediate but requires maintenance)

Create a custom text annotation transformer in your Notion sync code:

```typescript
import { NotionToMarkdown } from "notion-to-md";

const n2m = new NotionToMarkdown({ notionClient: notion });

// Override the annotatePlainText method (monkey patch)
const originalAnnotate = n2m.annotatePlainText.bind(n2m);
n2m.annotatePlainText = function(text: string, annotations: any): string {
  let result = originalAnnotate(text, annotations);
  
  // Handle highlights (background colors)
  if (annotations.color && annotations.color.endsWith('_background')) {
    result = `==${result}==`;
  }
  
  // Handle text colors (export as HTML for now)
  if (annotations.color && !annotations.color.endsWith('_background') && annotations.color !== 'default') {
    result = `<span style="color: ${annotations.color}">${result}</span>`;
  }
  
  return result;
};
```

**Option 3: Post-process Notion API responses** (complex but most control)

Access raw Notion API blocks and transform color annotations before markdown conversion.

**Recommendation**: Document limitation and wait for v4 unless color fidelity is critical.

#### 6. **Images**
```markdown
![Alt text](https://notion-aws-s3-url.com/image.png)
```

✅ **Supported** by `@mdit/plugin-figure` - wraps in `<figure>` + caption
✅ **Supported** by `@mdit/plugin-img-lazyload` - adds loading="lazy"
✅ **Optimized** by our custom image renderer (Nhost Storage URLs)

#### 6. **Code Blocks with Language**
```markdown
\```typescript
const x = 1;
\```
```

✅ **Supported** - syntax highlighting via Prism.js

#### 7. **Equations (Math)**
Notion exports math as:

```markdown
$$
E = mc^2
$$

Or inline: $E = mc^2$
```

✅ **Supported** by `@mdit/plugin-katex` with `mhchem` extension

#### 8. **Dividers**
```markdown
---
```

✅ **Supported** - standard horizontal rule

---

## Tiptap Markdown Output (Future)

### Recommended Tiptap Extensions

To ensure compatibility with our markdown-it setup:

1. **[@tiptap/extension-markdown](https://tiptap.dev/api/extensions/markdown)** - Core markdown support
2. **Prosemirror-markdown** - Markdown serializer

### Tiptap Syntax Mapping

| Tiptap Feature | Markdown Output | Symbiont Support |
|----------------|----------------|------------------|
| **Bold** | `**text**` | ✅ Built-in |
| **Italic** | `*text*` | ✅ Built-in |
| **Strike** | `~~text~~` | ✅ Built-in |
| **Code** | `` `code` `` | ✅ Built-in |
| **Heading** | `# Heading` | ✅ Built-in + TOC |
| **Bullet List** | `- item` | ✅ Built-in |
| **Ordered List** | `1. item` | ✅ Built-in |
| **Blockquote** | `> quote` | ✅ Built-in |
| **Code Block** | ` ```js\ncode\n``` ` | ✅ Prism.js |
| **Link** | `[text](url)` | ✅ Built-in + mangle |
| **Image** | `![alt](url)` | ✅ Figure + lazy load |
| **Horizontal Rule** | `---` | ✅ Built-in |
| **Table** | GFM table | ✅ Built-in (linkify) |
| **Task List** | `- [ ] task` | ⚠️ Need `@mdit/plugin-tasklist` |

### Tiptap-Specific Considerations

#### 1. **Highlight (Mark)**
Tiptap uses `<mark>` HTML, we need markdown:

```markdown
==highlighted text==
```

✅ **Supported** by `@mdit/plugin-mark`

**Action**: Ensure Tiptap markdown serializer outputs `==text==` instead of `<mark>`

#### 2. **Subscript/Superscript**
Tiptap supports `<sub>`/`<sup>`, markdown-it has plugins:

```markdown
H~2~O  (subscript)
x^2^   (superscript)
```

⚠️ **Not currently installed**: `@mdit/plugin-sub` and `@mdit/plugin-sup`

**Action**: Add these plugins if needed

#### 3. **Text Color/Background**
Tiptap supports text colors, but CommonMark doesn't:

**Option A**: Use HTML (markdown-it allows HTML with `html: true`)
```markdown
<span style="color: red">text</span>
```

**Option B**: Custom syntax (would need custom plugin)
```markdown
{red}(colored text)
```

⚠️ **Decision needed**: How to handle colored text from Tiptap

#### 4. **Footnotes**
```markdown
Text with footnote[^1]

[^1]: Footnote content
```

✅ **Supported** by `@mdit/plugin-footnote`

---

## Our markdown-it Plugin Setup

### Currently Active Plugins

1. ✅ **@mdit/plugin-katex** - Math rendering ($$...$$ and $...$)
2. ✅ **@mdit/plugin-footnote** - Footnotes ([^1])
3. ✅ **@mdit/plugin-mark** - Highlights (==text==)
4. ✅ **@mdit/plugin-spoiler** - Spoilers (||text||)
5. ✅ **@mdit/plugin-abbr** - Abbreviations
6. ✅ **@mdit/plugin-attrs** - Attributes ({#id .class})
7. ✅ **@mdit/plugin-embed** - Auto-embed URLs
8. ✅ **@mdit/plugin-figure** - Image figures with captions
9. ✅ **@mdit/plugin-img-lazyload** - Lazy loading for images

### Custom Renderers

1. ✅ **Heading** - TOC generation + slugification
2. ✅ **Code blocks** - Prism.js syntax highlighting
3. ✅ **Images** - Nhost Storage optimization hints
4. ✅ **Links** - Email mangling for security
5. ✅ **Text** - Email mailto link mangling

---

## Compatibility Checklist

### ✅ Fully Compatible (Works Out of Box)

- [x] Headings (# ## ###)
- [x] Bold (**text**)
- [x] Italic (*text*)
- [x] Strikethrough (~~text~~)
- [x] Code (`inline`)
- [x] Code blocks (```lang)
- [x] Lists (bullets & numbered)
- [x] Blockquotes (>)
- [x] Links ([text](url))
- [x] Images (![alt](url))
- [x] Horizontal rules (---)
- [x] Tables (GFM style)
- [x] Math ($$...$$ and $...$)
- [x] Footnotes ([^1])
- [x] Highlights (==text==) - **Note**: Notion doesn't export these yet (v3.1.9)

### ⚠️ Needs Plugin Addition

- [ ] **Task Lists** - Requires `@mdit/plugin-tasklist`
- [ ] **Subscript/Superscript** - Requires `@mdit/plugin-sub` and `@mdit/plugin-sup`
- [ ] **Spoilers** (||text||) - Have `@mdit/plugin-spoiler` installed but need to verify Notion support

### ⚠️ Notion-to-MD Limitations (v3.1.9)

- [ ] **Text Colors** - Notion API provides color data, but `notion-to-md` v3.1.9 strips it
  - Status: Planned for v4 ([Issue #100](https://github.com/souvikinator/notion-to-md/issues/100))
  - Workaround: Custom transformer (see "Text Colors & Highlights" section above)
- [ ] **Highlights (backgrounds)** - Same as text colors
  - Status: Planned for v4, likely as `==text==` ([Issue #145](https://github.com/souvikinator/notion-to-md/issues/145))
  - Workaround: Custom transformer (see "Text Colors & Highlights" section above)
  - We already support `==text==` rendering via `@mdit/plugin-mark`!
- [ ] **Callouts** - Exported as blockquotes, loses semantic meaning
  - No standard markdown syntax
  - Consider custom transformer or post-processing

### ⚠️ Needs Custom Handling (Future)

- [ ] **Tiptap Marks** - Ensure markdown serialization, not HTML

---

## Testing Strategy

### 1. Notion Content Test Cases

Create a Notion test page with:
- All heading levels
- Text formatting (bold, italic, strike)
- Lists (nested bullets, numbered, checkboxes)
- Code blocks (various languages)
- Math equations (inline & block)
- Images (with and without captions)
- Tables
- Blockquotes
- Links and embeds
- Footnotes

Sync to database and verify rendering matches expectations.

### 2. Tiptap Content Test Cases (Future)

Create Tiptap editor test with:
- All supported marks and nodes
- Export to markdown
- Verify markdown-it renders correctly
- Check for HTML fallback when markdown is insufficient

### 3. Edge Cases

- **Nested lists** (3+ levels deep)
- **Mixed content** (code blocks inside lists)
- **Escaped characters** (\*, \`, etc.)
- **HTML in markdown** (should pass through with `html: true`)
- **Special characters** (emojis, unicode)

---

## Recommendations

### Immediate Actions

1. ✅ **Add image zoom** - Already implemented with medium-zoom
2. ⚠️ **Add task list plugin** - For Notion checkbox support
   ```bash
   pnpm add @mdit/plugin-tasklist
   ```

3. ⚠️ **Document callout strategy** - How to handle Notion callouts/admonitions
4. ⚠️ **Test Notion sync** - Verify all markdown features work end-to-end

### Future: Tiptap Implementation

1. **Use prosemirror-markdown** for serialization
2. **Ensure ==mark== syntax** instead of `<mark>` HTML
3. **Decide on color handling** (HTML vs custom syntax)
4. **Test round-trip** (Tiptap → Markdown → markdown-it → HTML)

### Plugin Additions to Consider

```typescript
// Add to markdown-processor.ts
import { tasklist } from '@mdit/plugin-tasklist';
import { sub } from '@mdit/plugin-sub';
import { sup } from '@mdit/plugin-sup';

md.use(tasklist);
md.use(sub);
md.use(sup);
```

---

## Related Documentation

- **[Symbiont CMS Complete Guide](symbiont-cms.md)** - Full system documentation
- **[Image Optimization Strategy](image-optimization-strategy.md)** - Image handling & zoom
- **[notion-to-md GitHub](https://github.com/souvikinator/notion-to-md)** - Notion markdown converter
- **[markdown-it Plugins](https://mdit-plugins.github.io/)** - Available plugins

---

**Status:** 📋 Active Reference Document  
**Last Updated:** October 7, 2025
