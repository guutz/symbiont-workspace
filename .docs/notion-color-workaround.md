# Notion Text Colors & Highlights Workaround

> **Status**: This is a workaround for notion-to-md v3.1.9 which doesn't support color/highlight annotations. This will likely not be needed when v4 is released.

## Problem

Notion's API provides text color and highlight information in the `annotations.color` property:

```javascript
// Text with yellow highlight
{
  "type": "text",
  "text": { "content": "highlighted text", "link": null },
  "annotations": {
    "bold": false,
    "italic": false,
    "strikethrough": false,
    "underline": false,
    "code": false,
    "color": "default"  // "default" means background color
  }
}

// Text with yellow color
{
  "type": "text",
  "text": { "content": "colored text", "link": null },
  "annotations": {
    "bold": false,
    "italic": false,
    "strikethrough": false,
    "underline": false,
    "code": false,
    "color": "yellow"  // "yellow" means text color
  }
}
```

**notion-to-md v3.1.9** ignores the `color` annotation in its `annotatePlainText()` method.

## Solution: Monkey Patch

Add this code to your Notion sync function (where you create the `NotionToMarkdown` instance):

```typescript
import { NotionToMarkdown } from "notion-to-md";

// Create the n2m instance
const n2m = new NotionToMarkdown({ notionClient: notion });

// Store the original method
const originalAnnotate = n2m.annotatePlainText.bind(n2m);

// Override with color support
n2m.annotatePlainText = function(text: string, annotations: any): string {
  // First apply all standard annotations (bold, italic, code, etc.)
  let result = originalAnnotate(text, annotations);
  
  // Then add color support
  if (annotations.color && annotations.color !== 'default') {
    if (annotations.color.endsWith('_background')) {
      // Background colors (highlights) → ==text== syntax
      // Strip the "_background" suffix for cleaner output
      result = `==${result}==`;
    } else {
      // Text colors → HTML span with inline style
      // This preserves the color in HTML output
      result = `<span style="color: ${annotations.color}">${result}</span>`;
    }
  }
  
  return result;
};

// Now use n2m as normal
const mdblocks = await n2m.pageToMarkdown(pageId);
const markdown = n2m.toMarkdownString(mdblocks);
```

## Output Examples

### Input (Notion)
- "This has a ==yellow highlight=="
- "This has <span style="color: blue">blue text</span>"

### Rendered Output
- "This has a ==yellow highlight==" → **Yellow highlight** (via `@mdit/plugin-mark`)
- "This has <span style="color: blue">blue text</span>" → **Blue text** (via markdown-it HTML passthrough)

## Limitations

### Text Colors
- **Markdown has no standard color syntax**
- We use HTML `<span>` tags with inline styles
- This works but is not "pure" markdown
- Consider whether you want to support this or wait for v4

### Notion Color Values
Notion color values include:
- `default` (no color)
- `gray`, `brown`, `orange`, `yellow`, `green`, `blue`, `purple`, `pink`, `red`
- `gray_background`, `brown_background`, ... (same colors with `_background` suffix)

### CSS Compatibility
The HTML output uses Notion's color names directly:
```html
<span style="color: yellow">text</span>
```

You may want to map Notion colors to your theme colors:

```typescript
const NOTION_COLOR_MAP: Record<string, string> = {
  'red': '#e03e3e',
  'blue': '#2383e2',
  'yellow': '#ffc60a',
  // ... etc
};

// In the monkey patch:
if (!annotations.color.endsWith('_background')) {
  const cssColor = NOTION_COLOR_MAP[annotations.color] || annotations.color;
  result = `<span style="color: ${cssColor}">${result}</span>`;
}
```

## Migration Path

When **notion-to-md v4** is released:

1. Remove the monkey patch
2. Update `notion-to-md` to v4
3. Highlights will likely be exported as `==text==` (already supported!)
4. Text colors may have a different format - check v4 release notes

## References

- [Issue #145 - Highlighting annotation support](https://github.com/souvikinator/notion-to-md/issues/145)
- [Issue #100 - Color info extraction](https://github.com/souvikinator/notion-to-md/issues/100)
- [Issue #28 - Text color feature (closed)](https://github.com/souvikinator/notion-to-md/issues/28)
- [Discussion #112 - v4 architecture](https://github.com/souvikinator/notion-to-md/discussions/112)

---

**Last Updated**: October 7, 2025  
**notion-to-md Version**: 3.1.9  
**Workaround Type**: Monkey patch (non-invasive, runtime override)
