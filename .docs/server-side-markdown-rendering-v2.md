# Server-Side Markdown Rendering Strategy

> **📖 Part of the Zero-Rebuild CMS Vision** - See `.docs/zero-rebuild-cms-vision.md` for the complete architecture

## Overview

This document outlines the strategy for rendering Markdown content server-side in SvelteKit's SSR phase, combining QWER's rich markdown features with Symbiont's dynamic database-driven architecture. **All features are configuration-driven** - you can toggle syntax highlighting, math rendering, and caching strategies via `symbiont.config.js`.

### Key Innovations

1. **Zero-Boilerplate API** - One-line server load, use your existing layout components
2. **Smart Resource Detection** - CSS/JS only loaded for features actually used in each post
3. **Template Integration** - Works with QWER and other existing layouts via standard data format
4. **Configuration-Driven** - All features toggleable via `symbiont.config.js`
5. **Per-Page Optimization** - Post without code? No Prism (~100KB saved!)

### Quick Example

```typescript
// +page.server.ts - One line!
export { loadPost as load } from 'symbiont-cms/server';
```

```svelte
<!-- +page.svelte - Use your existing QWER layout -->
<script>
  import QWERLayout from '$lib/components/post.svelte';
  export let data;
</script>

<!-- Smart CSS loading based on content -->
<svelte:head>
  {#if data.post.features?.syntaxHighlighting}
    <link rel="stylesheet" href="/prism.css" />
  {/if}
</svelte:head>

<!-- QWER gets html + toc data, handles presentation -->
<QWERLayout post={data.post}>
  {@html data.post.html}
</QWERLayout>
```

---

## Problem Statement

### Current Approach (Client-Side Rendering)

```
Database → +page.server.ts → Raw Markdown → Client
                                              ↓
                                         Renderer.svelte
                                              ↓
                                         markdown-it
                                              ↓
                                         Basic HTML
```

**Issues:**
- ❌ **Basic features only**: No syntax highlighting, math, TOC
- ❌ **Bundle size**: Ships markdown-it (~50kb) to every browser
- ❌ **Performance**: Parsing happens on every page view in every browser
- ❌ **Slower render**: Client-side parsing adds delay
- ❌ **Different styling**: Not using QWER's beautiful post layout and prose styles

### New Approach (Server-Side Rendering)

```
Database → +page.server.ts → Configurable Markdown Parser → Rich HTML → Client
                              ↓ (via symbiont.config.js)              ↓
                    - Syntax highlighting                      - Pre-rendered HTML
                    - Math (KaTeX)                             - TOC data structure
                    - TOC generation                           - Feature metadata
                    - Image processing                         - Instant display
```

**Benefits:**
- ✅ **Rich features**: Syntax highlighting, math, TOC, etc.
- ✅ **Smaller bundles**: Parser runs on server, not in browser
- ✅ **Better performance**: HTML arrives pre-rendered
- ✅ **SEO-friendly**: Full HTML in initial response
- ✅ **QWER styling**: Uses QWER's post layout and prose styles
- ✅ **Configurable**: Toggle features via `symbiont.config.js`
- ✅ **Smart loading**: Only load CSS/JS for features actually used

---

## Configuration

### Complete symbiont.config.js Example

**File**: `packages/qwer-test/symbiont.config.js`

```javascript
// @ts-check
import { defineConfig } from 'symbiont-cms/config';

export default defineConfig({
  // ═══════════════════════════════════════════════════════════
  // Core Configuration
  // ═══════════════════════════════════════════════════════════
  
  /** GraphQL endpoint (public, non-secret) */
  graphqlEndpoint: 'https://your-project.nhost.run/v1/graphql',
  
  /** Primary database identifier */
  primaryShortDbId: 'blog',
  
  // ═══════════════════════════════════════════════════════════
  // Database Configuration
  // ═══════════════════════════════════════════════════════════
  
  databases: [
    {
      /** Unique identifier for this database */
      short_db_ID: 'blog',
      
      /** Notion database ID (public, non-secret) */
      notionDatabaseId: 'your-notion-database-id',
      
      /** Determines if a Notion page should be published */
      isPublicRule: (page) => {
        const status = page.properties.Status;
        return status.select?.name === 'Published';
      },
      
      /** Content source: 'NOTION' or 'DATABASE' */
      sourceOfTruthRule: () => 'NOTION',
      
      /** Property name containing the slug */
      slugPropertyName: "Website Slug",
      
      /** Custom slug extraction logic */
      slugRule: (page) => {
        const slugProperty = page.properties["Website Slug"]?.rich_text;
        return slugProperty?.[0]?.plain_text?.trim() || null;
      },
    },
  ],
  
  // ═══════════════════════════════════════════════════════════
  // Markdown Rendering Configuration
  // ═══════════════════════════════════════════════════════════
  
  /** Markdown rendering options */
  markdown: {
    /** Syntax highlighting for code blocks */
    syntaxHighlighting: {
      enabled: true,                              // Toggle on/off
      theme: 'vsc-dark-plus',                     // 'github-dark' | 'nord' | 'dracula' | etc
      showLineNumbers: true,                      // Line numbers
      languages: ['typescript', 'python', 'bash'], // Preload these (others on-demand)
    },
    
    /** Math rendering with KaTeX */
    math: {
      enabled: true,                              // Toggle on/off
      inlineDelimiters: ['$', '$'],               // Inline: $x^2$
      displayDelimiters: ['$$', '$$'],            // Block: $$x^2$$
    },
    
    /** Table of contents */
    toc: {
      enabled: true,
      minHeadingLevel: 2,                         // H2 and below
      maxHeadingLevel: 4,                         // Up to H4
    },
    
    /** Markdown extensions */
    extensions: {
      footnotes: true,                            // [^1] references
      spoilers: true,                             // ||spoiler text||
      highlights: true,                           // ==highlighted text==
      textColors: true,                           // {red}(colored text) - see below
      gfm: true,                                  // GitHub Flavored Markdown
    },
    
    /** Image handling */
    images: {
      lazy: true,                                 // loading="lazy"
      nhostStorage: true,                         // Detect/optimize Nhost URLs
    },
  },
  
  /** Caching strategy (Vercel ISR) */
  caching: {
    strategy: 'isr',                              // 'isr' | 'none'
    isr: {
      enabled: true,
      revalidate: 60,                             // Seconds
      // Note: Cache bypass tokens are secrets and should be 
      // stored in .env as VERCEL_BYPASS_TOKEN, then accessed
      // at runtime by server functions, not in this config
    },
  },
});
```

> **⚠️ Secrets Management**: API keys and bypass tokens should be stored in `.env` files (e.g., `NOTION_API_KEY`, `NHOST_ADMIN_SECRET`, `VERCEL_BYPASS_TOKEN`) and accessed at runtime by server functions using SvelteKit's `$env` modules, not hardcoded in config files.

### Text Color Support

Custom text colors can be added through several approaches:

**Option 1: Inline HTML** (already supported)
```markdown
This is <span style="color: red">red text</span> in markdown.
```

**Option 2: Custom Syntax** (requires custom extension)
```markdown
This is {red}(red text) and {blue}(blue text) using custom syntax.
```

Implementation would parse `{color}(text)` and convert to `<span class="text-{color}">text</span>`.

**Option 3: CriticMarkup-inspired** (standard-ish)
```markdown
This is {++addition in green++} and {--deletion in red--}.
```

**Recommendation**: Start with Option 1 (inline HTML) since it works out-of-the-box. Add Option 2 if custom syntax becomes a common need. Option 3 is good for document editing workflows.

---

## Architecture

### Data Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ 1. Content Source                                                │
├──────────────────────────────────────────────────────────────────┤
│  Notion → Sync Script → Postgres (raw markdown)                  │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ 2. Server-Side (SvelteKit SSR)                                   │
├──────────────────────────────────────────────────────────────────┤
│  +page.server.ts                                                 │
│    ↓ Load symbiont.config.js                                     │
│    ↓ Fetch from database                                         │
│    ↓ Parse markdown with CONFIGURABLE processor:                 │
│    ↓   • Syntax highlighting (if enabled)                        │
│    ↓   • Math (KaTeX) (if enabled)                               │
│    ↓   • TOC generation (always)                                 │
│    ↓   • Image processing (Nhost URLs)                           │
│    ↓   • Detect features used                                    │
│    ↓ Apply caching strategy (if configured)                      │
│    ↓ Return processed data:                                      │
│      {                                                           │
│        post: { ...metadata },                                    │
│        html: "<h1>...</h1><p>...</p>",  // Pre-rendered          │
│        toc: [...],                       // Table of contents    │
│        features: { ... }                 // Which features used  │
│      }                                                           │
└──────────────────────────────────────────────────────────────────┘
                            ↓
┌──────────────────────────────────────────────────────────────────┐
│ 3. Client-Side (Browser)                                         │
├──────────────────────────────────────────────────────────────────┤
│  +page.svelte                                                    │
│    ↓ Receive pre-rendered HTML                                   │
│    ↓ Conditionally load CSS based on features                    │
│    ↓ Use QWER's (or custom) layout                               │
│    ↓ {@html data.html} → Display immediately                     │
│    ↓ Apply prose styles                                          │
│    ↓ Initialize TOC scrollspy                                    │
│    ↓ Add interactive features (image zoom, code copy)            │
└──────────────────────────────────────────────────────────────────┘
```

**Key Point**: No custom Svelte component imports needed since database markdown won't contain them.

---

## Implementation

### Phase 1: Configurable Markdown Processor

**File**: `packages/symbiont-cms/src/lib/server/markdown-processor.ts`

```typescript
import { marked } from 'marked';
import { mangle } from 'marked-mangle';
import { gfmHeadingId } from 'marked-gfm-heading-id';
import slug from 'slug';
import type { SymbiontConfig } from '../types';

// Optional imports (loaded conditionally)
let Prism: any;
let katex: any;

interface TOCItem {
  level: number;
  heading: string;
  slug: string;
  child?: TOCItem[];
}

export interface MarkdownFeatures {
  syntaxHighlighting?: string[];  // ['typescript', 'python']
  syntaxHighlightingTheme?: string;
  math?: boolean;
  images?: boolean;
  footnotes?: boolean;
  spoilers?: boolean;
  highlights?: boolean;
  textColors?: boolean;
}

export interface MarkdownResult {
  html: string;
  toc: TOCItem[];
  features: MarkdownFeatures;  // Detected during parsing
}

export interface MarkdownOptions {
  config: SymbiontConfig['markdown'];
}

/**
 * Configurable markdown processor inspired by QWER's mdify
 * Features enabled/disabled via symbiont.config.js
 */
export async function parseMarkdown(
  content: string, 
  options: MarkdownOptions
): Promise<MarkdownResult> {
  const config = options.config;
  const toc: TOCItem[] = [];
  const features: MarkdownFeatures = {};
  
  // Track detected features
  const detectedLanguages = new Set<string>();
  let hasImages = false;
  let hasMath = false;
  let hasFootnotes = false;
  let hasSpoilers = false;
  let hasHighlights = false;
  let hasTextColors = false;
  
  // Lazy load syntax highlighting if enabled
  if (config.syntaxHighlighting?.enabled && !Prism) {
    Prism = await import('prismjs');
    // Load requested languages
    for (const lang of config.syntaxHighlighting.languages || []) {
      try {
        await import(`prismjs/components/prism-${lang}.min.js`);
      } catch (e) {
        console.warn(`Failed to load Prism language: ${lang}`);
      }
    }
  }
  
  // Lazy load KaTeX if enabled
  if (config.math?.enabled && !katex) {
    katex = await import('katex');
    await import('katex/contrib/mhchem'); // Chemistry formulas
  }

  // Configure marked with custom renderer
  marked.use({
    mangle: false,
    headerIds: false,
    extensions: [mangle, gfmHeadingId],
    renderer: {
      // Heading with TOC tracking
      heading(text: string, level: number) {
        const slugUrl = slug(text);
        
        // Only add to TOC if within configured range
        if (level >= (config.toc?.minHeadingLevel || 2) && 
            level <= (config.toc?.maxHeadingLevel || 4)) {
          addToTOC(toc, level, text, slugUrl);
        }
        
        return `<h${level} id="${slugUrl}"><a href="#${slugUrl}">${text}</a></h${level}>\n`;
      },
      
      // Code blocks with optional syntax highlighting
      code(code: string, language: string | undefined) {
        // Track language usage
        if (language) {
          detectedLanguages.add(language);
        }
        
        // Check for math code blocks
        if (language === 'math' && config.math?.enabled && katex) {
          hasMath = true;
          return renderMathBlock(code, katex);
        }
        
        // Syntax highlighting if enabled
        if (config.syntaxHighlighting?.enabled && language && Prism) {
          const lang = Prism.languages[language];
          if (lang) {
            const highlighted = Prism.highlight(code, lang, language);
            const showLineNumbers = config.syntaxHighlighting.showLineNumbers;
            
            return `<pre><code class="language-${language}">${
              showLineNumbers ? addLineNumbers(highlighted) : highlighted
            }</code></pre>\n`;
          }
        }
        
        // Plain code block
        return `<pre><code${language ? ` class="language-${language}"` : ''}>${escapeHtml(code)}</code></pre>\n`;
      },
      
      // Inline code with optional math detection
      codespan(text: string) {
        // Check for inline math if enabled
        if (config.math?.enabled && katex) {
          const [start, end] = config.math.inlineDelimiters || ['$', '$'];
          if (text.startsWith(start) && text.endsWith(end)) {
            hasMath = true;
            const mathContent = text.slice(start.length, -end.length);
            return renderMathInline(mathContent, katex);
          }
        }
        
        return `<code class="inline-code-block">${text}</code>`;
      },
      
      // Image handling with Nhost Storage optimization
      image(href: string | null, title: string | null, alt: string) {
        if (!href) return alt;
        
        hasImages = true;
        const attrs = [`src="${href}"`, `alt="${alt}"`];
        
        if (title) attrs.push(`title="${title}"`);
        if (config.images?.lazy) attrs.push('loading="lazy"');
        
        // Detect Nhost Storage URLs and add optimization hints
        if (config.images?.nhostStorage && isNhostStorageUrl(href)) {
          attrs.push('data-nhost-optimized="true"');
        }
        
        return `<img ${attrs.join(' ')} />`;
      },
      
      // Paragraph with optional extensions
      paragraph(text: string) {
        if (config.extensions?.spoilers && text.includes('||')) {
          hasSpoilers = true;
          text = parseSpoiler(text);
        }
        if (config.extensions?.highlights && text.includes('==')) {
          hasHighlights = true;
          text = parseHighlight(text);
        }
        if (config.extensions?.textColors && /\{[a-z]+\}\(/.test(text)) {
          hasTextColors = true;
          text = parseTextColor(text);
        }
        return `<p>${text}</p>\n`;
      },
      
      // Blockquote
      blockquote(quote: string) {
        return '<blockquote>\n' + quote + '</blockquote>\n';
      },
      
      // Table
      table(header: string, body: string) {
        if (body) body = '<tbody>' + body + '</tbody>';
        return '<table>\n' + '<thead>\n' + header + '</thead>\n' + body + '</table>\n';
      },
    },
  });

  // Parse footnotes if enabled
  let html: string;
  if (config.extensions?.footnotes) {
    const result = await parseWithFootnotes(content, marked);
    html = result.html;
    hasFootnotes = result.hasFootnotes;
  } else {
    html = marked.parse(content) as string;
  }

  // Build features metadata
  if (detectedLanguages.size > 0 && config.syntaxHighlighting?.enabled) {
    features.syntaxHighlighting = Array.from(detectedLanguages);
    features.syntaxHighlightingTheme = config.syntaxHighlighting.theme;
  }
  
  if (hasMath && config.math?.enabled) {
    features.math = true;
  }
  
  if (hasImages) {
    features.images = true;
  }
  
  if (hasFootnotes && config.extensions?.footnotes) {
    features.footnotes = true;
  }
  
  if (hasSpoilers && config.extensions?.spoilers) {
    features.spoilers = true;
  }
  
  if (hasHighlights && config.extensions?.highlights) {
    features.highlights = true;
  }
  
  if (hasTextColors && config.extensions?.textColors) {
    features.textColors = true;
  }

  return { html, toc, features };
}

// Helper functions
function addToTOC(toc: TOCItem[], level: number, heading: string, slugUrl: string) {
  const item = { level, heading, slug: `#${slugUrl}` };
  
  if (toc.length === 0) {
    toc.push(item);
    return;
  }
  
  const last = toc[toc.length - 1];
  if (item.level > last.level) {
    if (!last.child) last.child = [];
    addToTOC(last.child, level, heading, slugUrl);
  } else {
    toc.push(item);
  }
}

function parseSpoiler(text: string): string {
  return text.replace(/\|\|(.+?)\|\|/g, '<span class="spoiler">$1</span>');
}

function parseHighlight(text: string): string {
  return text.replace(/==(.+?)==/g, '<mark>$1</mark>');
}

function parseTextColor(text: string): string {
  // Parse {color}(text) syntax
  return text.replace(/\{([a-z]+)\}\((.+?)\)/g, '<span class="text-$1">$2</span>');
}

function escapeHtml(html: string): string {
  return html.replace(/[&<>"']/g, (c) => {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c;
  });
}

function isNhostStorageUrl(url: string): boolean {
  return url.includes('nhost') || url.includes('/storage/');
}

function renderMathBlock(code: string, katex: any): string {
  const rendered = katex.renderToString(code, {
    displayMode: true,
    trust: true,
    throwOnError: false,
  });
  return `<p class="katex-block">${rendered}</p>`;
}

function renderMathInline(code: string, katex: any): string {
  const rendered = katex.renderToString(code, {
    trust: true,
    throwOnError: false,
  });
  return `<span class="katex-inline">${rendered}</span>`;
}

function addLineNumbers(html: string): string {
  const lines = html.split('\n');
  return lines.map((line, i) => 
    `<span class="line-number">${i + 1}</span>${line}`
  ).join('\n');
}

async function parseWithFootnotes(content: string, marked: any): Promise<{ html: string; hasFootnotes: boolean }> {
  const footnotes: Array<{ name: string; note: string }> = [];
  const footnoteTest = /^\[\^[^\]]+\]: /;
  const footnoteMatch = /^\[\^([^\]]+)\]: ([\s\S]*)$/;
  const referenceTest = /\[\^([^\]]+)\](?!\()/g;

  const tokens = marked.lexer(content);
  
  // Extract footnotes
  visitTokens(tokens, (token) => {
    if (token.type === 'paragraph' && footnoteTest.test(token.text)) {
      const match = token.text.match(footnoteMatch);
      if (match) {
        const name = match[1].replace(/\W/g, '-');
        footnotes.push({
          name,
          note: `${marked(match[2])}<a href="#fnref:${name}">↩</a>`,
        });
        token.toDelete = true;
      }
    }
  });

  // Remove deleted tokens
  removeDeletedTokens(tokens);

  // Replace footnote references
  visitTokens(tokens, (token) => {
    if (token.type === 'paragraph' || token.type === 'text') {
      token.text = token.text.replace(referenceTest, (ref: string, value: string) => {
        const name = value.replace(/\W/g, '-');
        const index = footnotes.findIndex(f => f.name === name);
        if (index >= 0) {
          return `<sup id="fnref:${name}"><a href="#fn:${name}">${index + 1}</a></sup>`;
        }
        return ref;
      });
      if (token.type === 'paragraph') {
        token.tokens = marked.lexer(token.text)[0].tokens;
      }
    }
  });

  let html = marked.parser(tokens);

  // Append footnotes
  if (footnotes.length > 0) {
    html += `
<hr />
<ol>
  ${footnotes.map((f) => `<li id="fn:${f.name}" class="footnote">${f.note}</li>`).join('\n')}
</ol>`;
  }

  return { html, hasFootnotes: footnotes.length > 0 };
}

function visitTokens(tokens: any[], fn: (token: any) => void) {
  for (const token of tokens) {
    fn(token);
    if (token.tokens) {
      visitTokens(token.tokens, fn);
    }
  }
}

function removeDeletedTokens(tokens: any[]) {
  for (let i = tokens.length - 1; i >= 0; i--) {
    if (tokens[i].toDelete) {
      tokens.splice(i, 1);
    } else if (tokens[i].tokens) {
      removeDeletedTokens(tokens[i].tokens);
    }
  }
}
```

---

### Phase 2: Server-Side Load Function

**File**: `packages/symbiont-cms/src/lib/server/load-post.ts`

```typescript
import type { LoadEvent } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';
import { loadConfig } from './config-loader';
import { getPost } from './graphql';
import { parseMarkdown } from './markdown-processor';

export const loadPost = async ({ params }: LoadEvent) => {
  const config = await loadConfig();
  const { slug } = params;

  // Fetch from database
  const post = await getPost(slug, {
    graphqlEndpoint: config.graphqlEndpoint,
  });

  if (!post) {
    throw error(404, 'Post not found');
  }

  // Parse markdown with config
  const result = await parseMarkdown(post.content, {
    config: config.markdown,
  });

  return {
    post: {
      ...post,
      html: result.html,
      toc: result.toc,
      features: result.features,  // Smart detection!
    },
  };
};

// Export ISR config if enabled
export const config = (async () => {
  const symbiontConfig = await loadConfig();
  
  if (symbiontConfig.caching?.isr?.enabled) {
    // Note: Bypass tokens should be accessed from environment at runtime
    // via server-side functions, not from config
    return {
      isr: {
        expiration: symbiontConfig.caching.isr.revalidate,
      },
    };
  }
  
  return {};
})();
```

**User Implementation** - `packages/qwer-test/src/routes/[slug]/+page.server.ts`:

```typescript
// That's it! One line.
export { loadPost as load } from 'symbiont-cms/server';
```

**Advanced: Custom load with additional data**:

```typescript
import { loadPost } from 'symbiont-cms/server';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const postData = await loadPost(event);
  
  // Add your own data
  const relatedPosts = await fetchRelatedPosts(postData.post.tags);
  
  return {
    ...postData,
    relatedPosts,
  };
};
```

---

### Phase 3: Client-Side Integration

#### Option A: Use Existing Template (QWER, etc.) - Recommended

**File**: `packages/qwer-test/src/routes/[slug]/+page.svelte`

```svelte
<script lang="ts">
  import PostLayout from '$lib/components/post.svelte';  // QWER's layout
  import type { PageData } from './$types';
  
  export let data: PageData;
</script>

<!-- Conditionally load CSS based on server-detected features -->
<svelte:head>
  {#if data.post.features?.syntaxHighlighting}
    <link rel="stylesheet" href="/prism-{data.post.features.syntaxHighlightingTheme}.css" />
  {/if}
  
  {#if data.post.features?.math}
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
  {/if}
</svelte:head>

<!-- Use QWER's existing layout - it handles scrollspy, styling, etc. -->
<PostLayout post={data.post}>
  <svelte:fragment slot="post_content">
    <article class="prose prose-lg dark:prose-invert max-w-none">
      {@html data.post.html}
    </article>
  </svelte:fragment>
  
  <!-- QWER's layout will use post.toc for its own scrollspy TOC -->
</PostLayout>
```

**Key Benefits**:
- ✅ QWER's layout receives `post.toc` data structure
- ✅ QWER's scrollspy and navigation work as designed
- ✅ Smart CSS loading based on `post.features`
- ✅ No duplication of TOC rendering logic
- ✅ Leverages QWER's existing styles and interactivity

#### Option B: Use Provided Component (New Projects)

**File**: `packages/symbiont-cms/src/lib/components/SymbiontPost.svelte`

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import type { Post } from '$lib/types';
  
  export let post: Post;
  
  // Optional customization props
  export let proseClass = 'prose prose-lg dark:prose-invert max-w-none';
  export let showToc = true;
  export let tocPosition: 'sidebar' | 'top' = 'sidebar';
  export let enableScrollspy = true;
  export let enableCodeCopy = true;
  export let enableImageZoom = true;
  
  // Lazy load interactive features only if needed
  onMount(async () => {
    if (enableScrollspy && post.toc?.length > 0) {
      const { initScrollspy } = await import('./scrollspy');
      initScrollspy();
    }
    
    if (enableCodeCopy && post.features?.syntaxHighlighting) {
      const { initCodeCopy } = await import('./code-copy');
      initCodeCopy();
    }
    
    if (enableImageZoom && post.features?.images) {
      const { initImageZoom } = await import('./image-zoom');
      initImageZoom();
    }
  });
</script>

<!-- Conditionally load CSS only for features used in this post -->
<svelte:head>
  {#if post.features?.syntaxHighlighting}
    <link rel="stylesheet" href="/prism-{post.features.syntaxHighlightingTheme || 'vsc-dark-plus'}.css" />
  {/if}
  
  {#if post.features?.math}
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css" />
  {/if}
</svelte:head>

<!-- Layout with TOC -->
<article class="symbiont-post-layout">
  {#if showToc && post.toc?.length > 0 && tocPosition === 'top'}
    <nav class="toc toc-top">
      <h2>Table of Contents</h2>
      <ul>
        {#each post.toc as item}
          <li class="toc-{item.level}">
            <a href={item.slug}>{item.heading}</a>
            {#if item.child}
              <ul>
                {#each item.child as child}
                  <li class="toc-{child.level}">
                    <a href={child.slug}>{child.heading}</a>
                  </li>
                {/each}
              </ul>
            {/if}
          </li>
        {/each}
      </ul>
    </nav>
  {/if}
  
  <div class="post-content-wrapper">
    {#if showToc && post.toc?.length > 0 && tocPosition === 'sidebar'}
      <aside class="toc-sidebar">
        <nav class="toc">
          <h2>Contents</h2>
          <ul>
            {#each post.toc as item}
              <li class="toc-{item.level}">
                <a href={item.slug}>{item.heading}</a>
                {#if item.child}
                  <ul>
                    {#each item.child as child}
                      <li class="toc-{child.level}">
                        <a href={child.slug}>{child.heading}</a>
                      </li>
                    {/each}
                  </ul>
                {/if}
              </li>
            {/each}
          </ul>
        </nav>
      </aside>
    {/if}
    
    <div class="post-content {proseClass}">
      {@html post.html}
    </div>
  </div>
</article>

<style>
  .symbiont-post-layout {
    max-width: 1400px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  .post-content-wrapper {
    display: grid;
    grid-template-columns: 1fr min(65ch, 100%) 1fr;
    gap: 2rem;
  }
  
  .post-content {
    grid-column: 2;
  }
  
  .toc-sidebar {
    grid-column: 3;
    position: sticky;
    top: 2rem;
    height: fit-content;
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
  }
  
  @media (max-width: 1024px) {
    .post-content-wrapper {
      grid-template-columns: 1fr;
    }
    
    .toc-sidebar {
      display: none;
    }
  }
</style>
```

**Usage**:

```svelte
<script lang="ts">
  import { SymbiontPost } from 'symbiont-cms';
  import type { PageData } from './$types';
  
  export let data: PageData;
</script>

<SymbiontPost post={data.post} />
```

---

### TOC Data Structure

The server returns TOC in a standardized format that any template can use:

```typescript
interface TOCItem {
  level: number;        // 1-6 (H1-H6)
  heading: string;      // "Introduction"
  slug: string;         // "#introduction"
  child?: TOCItem[];    // Nested headings
}

// Example:
{
  html: "<h1 id='intro'>...</h1>...",
  toc: [
    {
      level: 1,
      heading: "Introduction",
      slug: "#intro",
      child: [
        { level: 2, heading: "Background", slug: "#background" },
        { level: 2, heading: "Goals", slug: "#goals" }
      ]
    },
    {
      level: 1,
      heading: "Implementation",
      slug: "#implementation"
    }
  ]
}
```

Any template (QWER, custom, etc.) can consume this directly for scrollspy, navigation, etc.

---

## Performance Optimization

### Bundle Impact Analysis

| Feature | Library | Size (min+gzip) | When Loaded |
|---------|---------|----------------|-------------|
| **Base** | marked | ~15KB | Always |
| **Syntax Highlighting** | Prism.js + langs | ~100KB+ | Only if `config.markdown.syntaxHighlighting.enabled === true` |
| **Math Rendering** | KaTeX | ~100KB | Only if `config.markdown.math.enabled === true` |
| **Extensions** | marked plugins | ~5-10KB | Based on individual feature flags |

**Key Benefit**: Disabling unused features dramatically reduces serverless function size, resulting in:
- Faster cold starts (~100-200ms improvement)
- Lower memory usage
- Cheaper execution (Vercel charges by GB-seconds)

### Smart Per-Page Loading

**Post A** (code tutorial):
```markdown
# TypeScript Tutorial

```typescript
const x: string = "hello";
```
```

Features detected: `{ syntaxHighlighting: ['typescript'] }`  
Client loads: Prism CSS + TypeScript grammar (~30KB)

**Post B** (personal story):
```markdown
# My Trip to Japan

It was amazing! Here are some photos...
```

Features detected: `{ images: true }`  
Client loads: Nothing extra! (images are native HTML)

**Savings**: Post B visitors save ~100KB+ by not loading Prism/KaTeX

---

## Vercel Free Tier Analysis

### How It Works

```
User Request → Vercel Edge/CDN (static assets)
              ↓
         Vercel Serverless Function (for dynamic routes)
              ↓
         SvelteKit +page.server.ts executes
              ↓
         - Fetch from Nhost (database query)
         - Parse markdown (server-side processing)
         - Render HTML (SSR)
              ↓
         Return HTML response → Cache at edge (ISR)
```

### Free Tier Limits

| Resource | Limit | Notes |
|----------|-------|-------|
| **Function Invocations** | 100,000/month | Each uncached page view = 1 invocation |
| **Function Duration** | 10 sec max | Serverless execution time |
| **Function Memory** | 1024 MB | RAM available |
| **Bandwidth** | 100 GB/month | Data transfer out |
| **Edge Cache** | Included | CDN caching (dramatically reduces function calls) |

### Per-Request Resource Usage

With server-side markdown rendering:
1. **Database query** (~50-100ms): Nhost GraphQL fetch
2. **Markdown parsing** (~10-50ms): marked + optional Prism/KaTeX
3. **HTML rendering** (~5-10ms): SvelteKit SSR
4. **Total**: ~65-160ms per request

### Scaling Projections

**Scenario 1: Personal Blog**
- 1,000 visitors/month
- 5,000 page views/month
- With ISR caching (60s): ~500 function invocations/month
- **5% of free tier used** ✅

**Scenario 2: Growing Blog**
- 10,000 visitors/month
- 50,000 page views/month  
- With ISR caching: ~5,000 function invocations/month
- **5% of free tier used** ✅

**Scenario 3: Popular Blog**
- 100,000 visitors/month
- 500,000 page views/month
- With ISR caching: ~50,000 function invocations/month
- **50% of free tier used** ✅

**Scenario 4: Viral Content**
- 1,000,000+ visitors/month
- With ISR caching: Most traffic served from edge
- **May need Pro plan** (~$20/month)

### Key Insight: ISR Makes It Work

Without ISR:
- 100,000 page views = 100,000 function invocations
- Hit free tier limit quickly

With ISR (60s revalidation):
- 100,000 page views ≈ 5,000-10,000 function invocations
- 10x-20x reduction in function calls
- **Free tier supports 100,000+ monthly visitors easily**

### Caching Strategy Recommendations

**Balanced (Recommended)**:
```javascript
caching: {
  strategy: 'isr',
  isr: {
    enabled: true,
    revalidate: 60,  // 1 minute
  },
}
```
- Updates appear within 1 minute
- Good balance of freshness and performance

**Aggressive (Stable Content)**:
```javascript
caching: {
  strategy: 'isr',
  isr: {
    enabled: true,
    revalidate: 300,  // 5 minutes
  },
}
```
- Best for mature blogs with infrequent updates
- Maximum performance

**Fast (Development)**:
```javascript
caching: {
  strategy: 'isr',
  isr: {
    enabled: true,
    revalidate: 10,  // 10 seconds
  },
}
```
- For testing and frequent content changes
- More function invocations

---

## Configuration Presets

### Minimal (Fastest Performance)

```javascript
// symbiont.config.js
export default defineConfig({
  graphqlEndpoint: 'https://your-project.nhost.run/v1/graphql',
  primaryShortDbId: 'blog',
  
  databases: [
    {
      short_db_ID: 'blog',
      notionDatabaseId: 'your-db-id',
      isPublicRule: (page) => page.properties.Status?.select?.name === 'Published',
      sourceOfTruthRule: () => 'NOTION',
      slugPropertyName: "Website Slug",
      slugRule: (page) => page.properties["Website Slug"]?.rich_text?.[0]?.plain_text?.trim() || null,
    },
  ],
  
  markdown: {
    syntaxHighlighting: { enabled: false },
    math: { enabled: false },
    toc: { enabled: true },
    extensions: {
      footnotes: true,
      gfm: true,
    },
    images: {
      lazy: true,
      nhostStorage: true,
    },
  },
  caching: {
    strategy: 'isr',
    isr: { enabled: true, revalidate: 60 },
  },
});
```

**Bundle size**: ~20KB  
**Best for**: Personal blogs, documentation, simple content

### Full-Featured (Maximum Power)

```javascript
// symbiont.config.js
export default defineConfig({
  graphqlEndpoint: 'https://your-project.nhost.run/v1/graphql',
  primaryShortDbId: 'blog',
  
  databases: [
    {
      short_db_ID: 'blog',
      notionDatabaseId: 'your-db-id',
      isPublicRule: (page) => page.properties.Status?.select?.name === 'Published',
      sourceOfTruthRule: () => 'NOTION',
      slugPropertyName: "Website Slug",
      slugRule: (page) => page.properties["Website Slug"]?.rich_text?.[0]?.plain_text?.trim() || null,
    },
  ],
  
  markdown: {
    syntaxHighlighting: {
      enabled: true,
      theme: 'vsc-dark-plus',
      showLineNumbers: true,
      languages: ['typescript', 'python', 'rust', 'bash', 'sql'],
    },
    math: {
      enabled: true,
      inlineDelimiters: ['$', '$'],
      displayDelimiters: ['$$', '$$'],
    },
    toc: {
      enabled: true,
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
    extensions: {
      footnotes: true,
      spoilers: true,
      highlights: true,
      textColors: true,
      gfm: true,
    },
    images: {
      lazy: true,
      nhostStorage: true,
    },
  },
  caching: {
    strategy: 'isr',
    isr: { enabled: true, revalidate: 60 },
  },
});
```

**Bundle size**: ~220KB  
**Best for**: Technical blogs, tutorials, math/science content

### Developer Documentation

```javascript
// symbiont.config.js
export default defineConfig({
  graphqlEndpoint: 'https://your-project.nhost.run/v1/graphql',
  primaryShortDbId: 'blog',
  
  databases: [
    {
      short_db_ID: 'blog',
      notionDatabaseId: 'your-db-id',
      isPublicRule: (page) => page.properties.Status?.select?.name === 'Published',
      sourceOfTruthRule: () => 'NOTION',
      slugPropertyName: "Website Slug",
      slugRule: (page) => page.properties["Website Slug"]?.rich_text?.[0]?.plain_text?.trim() || null,
    },
  ],
  
  markdown: {
    syntaxHighlighting: {
      enabled: true,
      theme: 'github-dark',
      showLineNumbers: true,
      languages: ['typescript', 'javascript', 'bash', 'json', 'yaml'],
    },
    math: { enabled: false },
    toc: {
      enabled: true,
      minHeadingLevel: 1,  // Include H1 in docs
      maxHeadingLevel: 3,
    },
    extensions: {
      footnotes: true,
      gfm: true,
    },
  },
  caching: {
    strategy: 'isr',
    isr: { enabled: true, revalidate: 300 },  // 5 minutes for docs
  },
});
```

**Bundle size**: ~120KB  
**Best for**: API docs, developer guides, code-heavy content

---

## Migration Checklist

### Step 1: Implement Core Markdown Processor
- [ ] Create `packages/symbiont-cms/src/lib/server/markdown-processor.ts`
- [ ] Implement `parseMarkdown()` with `marked` library
- [ ] Add TOC extraction logic
- [ ] Test with sample markdown content

### Step 2: Add Configuration System
- [ ] Create `packages/symbiont-cms/src/lib/types/config.ts`
- [ ] Add TypeScript types for markdown config options
- [ ] Add markdown config to example `symbiont.config.js`

### Step 3: Add Optional Features
- [ ] Conditional Prism.js syntax highlighting
- [ ] Conditional KaTeX math rendering
- [ ] Footnotes extension
- [ ] Spoiler/highlight extensions
- [ ] Text color extension
- [ ] Test feature toggles work correctly

### Step 4: Integrate with SvelteKit
- [ ] Create `packages/symbiont-cms/src/lib/server/load-post.ts`
- [ ] Implement `loadPost()` function
- [ ] Add ISR caching configuration
- [ ] Export for user consumption
- [ ] Test SSR rendering works

### Step 5: Client-Side Integration
- [ ] Document QWER layout integration pattern
- [ ] Create optional `<SymbiontPost>` component
- [ ] Add smart CSS loading examples
- [ ] Test with QWER template
- [ ] Verify TOC scrollspy works

### Step 6: Performance Testing
- [ ] Test cold start times with different configs
- [ ] Measure markdown parsing time for various post lengths
- [ ] Verify ISR caching works on Vercel
- [ ] Test with/without syntax highlighting and math
- [ ] Document recommended settings

### Step 7: Documentation
- [ ] Add configuration reference to symbiont-cms README
- [ ] Document migration from client-side rendering
- [ ] Create examples for common configurations
- [ ] Add troubleshooting guide

---

## Design Decisions

### What We're Keeping from QWER

**Core Markdown Features**:
- ✅ TOC (Table of Contents) generation
- ✅ Footnote support
- ✅ Spoiler text `||text||`
- ✅ Highlight marks `==text==`
- ✅ Image handling (adapted for Nhost Storage)
- ✅ Table styling
- ✅ GitHub Flavored Markdown (GFM)

**Optional Features (Configuration-Driven)**:
- ✅ KaTeX math rendering (toggle via config)
- ✅ Prism syntax highlighting (toggle via config)
- ✅ Line numbers for code blocks (toggle via config)
- ✅ Text color support (toggle via config)

### What We're Removing from QWER

**Build-Time Only Features**:
- ❌ Custom Svelte component imports (not needed for database markdown)
- ❌ `<script>` block extraction
- ❌ Template placeholder replacement
- ❌ LZString compression (handled by Vercel)
- ❌ Static file generation (`$generated/`)

**Result**: Simpler, cleaner markdown processor focused on runtime rendering with configurable features.

---

## Benefits Over QWER's Build-Time Approach

| Aspect | QWER (Build-Time) | Symbiont (Server-Side) |
|--------|-------------------|------------------------|
| **Timing** | During `pnpm build` | During SSR request |
| **Speed** | Slow builds (all posts) | Fast (one post) |
| **Updates** | Requires rebuild | Instant (database change) |
| **Caching** | Static files | CDN edge cache (ISR) |
| **Scaling** | Builds get slower | O(1) per request |
| **Features** | All hardcoded ✅ | All configurable ✅ |
| **Bundle Size** | All features shipped | Only enabled features |
| **Flexibility** | Change requires rebuild | Toggle via config |

---

## Success Criteria

This implementation will be considered successful when:

- ✅ **Posts render with QWER's visual quality** - Same layout, styles, and interactive features
- ✅ **All markdown features work** - TOC, footnotes, spoilers, highlights, tables, text colors
- ✅ **Optional features are configurable** - Syntax highlighting, math rendering can be toggled
- ✅ **No rebuild required for content changes** - Updates appear instantly via database
- ✅ **Page load performance equals or beats static build** - ISR caching provides fast TTFB
- ✅ **SEO remains excellent** - HTML in initial SSR response
- ✅ **Free tier viable** - 100,000+ monthly visitors supported on Vercel
- ✅ **Smart resource loading** - Posts only load CSS/JS for features they actually use

---

## Related Documentation

- [Zero-Rebuild CMS Vision](.docs/zero-rebuild-cms-vision.md)
- [Symbiont CMS Documentation](.docs/symbiont-cms.md)
- [Integration Guide](.docs/INTEGRATION_GUIDE.md)
- [Dynamic File Management](.docs/dynamic-file-management.md)
- [Type Compatibility](.docs/TYPE_COMPATIBILITY.md)

---

**Status**: 📝 Planning Phase - Ready for Implementation  
**Last Updated**: October 2025  
**Next Steps**: 
1. Implement Phase 1 - Create configurable markdown processor in symbiont-cms
2. Add Phase 2 - Integrate with +page.server.ts and ISR caching
3. Implement Phase 3 - Client-side display with QWER layout
4. Test configuration toggles and performance
