/**
 * Markdown processor for Symbiont CMS
 * 
 * Converts markdown to HTML using markdown-it with custom renderers and plugins.
 * 
 * **IMPORTANT**: This processor must maintain compatibility with:
 * - Notion markdown (via notion-to-md library)
 * - Tiptap markdown (future implementation)
 * 
 * See `.docs/markdown-compatibility.md` for the full markdown syntax contract
 * and compatibility requirements between content sources and this processor.
 * 
 * **ARCHITECTURE NOTE**: This processor does NOT detect features (syntax highlighting,
 * math, images, etc.). Feature detection should happen during content ingestion
 * (Notion→DB or Tiptap→DB sync) and be stored in the database. This keeps the
 * renderer simple and performant. See `.docs/feature-detection-architecture.md`
 * for details on the recommended approach.
 * 
 * @module markdown-processor
 */

import MarkdownIt from 'markdown-it';
import slugifyFn from 'slugify';
import type { MarkdownConfig, SymbiontConfig, ContentFeatures } from '../types.js';
import { createLogger } from '../utils/logger.js';

// @mdit plugins
import { abbr } from '@mdit/plugin-abbr';
import { attrs } from '@mdit/plugin-attrs';
import { embed } from '@mdit/plugin-embed';
import { figure } from '@mdit/plugin-figure';
import { footnote } from '@mdit/plugin-footnote';
import { imgLazyload } from '@mdit/plugin-img-lazyload';
import { imgSize } from '@mdit/plugin-img-size';
import { mark } from '@mdit/plugin-mark';
import { spoiler } from '@mdit/plugin-spoiler';
import { katex, loadMhchem } from '@mdit/plugin-katex';

// Prism.js for syntax highlighting
import Prism from 'prismjs';
import loadLanguages from 'prismjs/components/index.js';

// Helper to use slugify - handle both default and named exports
const slugify = (text: string, options?: any) => {
  const fn = typeof slugifyFn === 'function' ? slugifyFn : (slugifyFn as any).default;
  return fn(text, options);
};

// Track loaded Prism languages to avoid reloading
const loadedLanguages = new Set<string>();

/**
 * Load a Prism language if not already loaded
 */
function loadPrismLanguage(lang: string): void {
  if (loadedLanguages.has(lang)) {
    return;
  }
  
  const logger = createLogger({ operation: 'load_prism_language' });
  try {
    loadLanguages([lang]);
    loadedLanguages.add(lang);
  } catch (e: any) {
    logger.warn({ 
      event: 'prism_language_load_failed', 
      language: lang,
      error: e?.message
    });
  }
}

interface TOCItem {
  level: number;
  heading: string;
  slug: string;
  child?: TOCItem[];
}

export interface MarkdownResult {
  html: string;
  toc: TOCItem[];
}

export interface MarkdownOptions {
  config: SymbiontConfig['markdown'];
  features?: ContentFeatures;  // Optional: features detected during sync
}

/**
 * Configurable markdown processor using markdown-it
 * 
 * @param content - Markdown content to render
 * @param options - Configuration and optional features
 * @param options.config - Markdown configuration from symbiont.config
 * @param options.features - Pre-detected features from database (for optimization)
 * 
 * If `features.syntaxHighlighting` is provided, only those Prism languages will be preloaded.
 * Otherwise, languages are loaded on-demand during rendering (lazy loading).
 */
export async function parseMarkdown(
  content: string, 
  options: MarkdownOptions
): Promise<MarkdownResult> {
  const config: MarkdownConfig = options.config ?? {};
  const features = options.features;
  const toc: TOCItem[] = [];
  
  // Preload Prism languages if we know which ones are needed
  if (features?.syntaxHighlighting && config.syntaxHighlighting?.enabled) {
    for (const lang of features.syntaxHighlighting) {
      loadPrismLanguage(lang);
    }
  }
  
  // Initialize markdown-it with base options
  const md = new MarkdownIt({
    html: true,
    breaks: false,
    linkify: true,
    typographer: true,
  });

  // Add core plugins (always enabled like QWER)
  md.use(abbr);     // Abbreviations: *[HTML]: Hyper Text Markup Language
  md.use(attrs);    // Add attributes to elements: {#id .class key=value}
  md.use(footnote); // Footnotes: [^1]
  md.use(mark);     // Highlights: ==text==
  md.use(spoiler);  // Spoilers: ||text||
  md.use(figure);   // Wrap images in <figure> with <figcaption>
  // NOTE: embed plugin disabled for now - requires provider config
  // md.use(embed, []); // Embed videos/content
  md.use(imgSize);  // Image size syntax: ![alt](url =WxH)
  
  // Add lazy loading for images if enabled
  if (config.images?.lazy) {
    md.use(imgLazyload);
  }

  // Add KaTeX plugin (always enabled like QWER - only ~23KB CSS)
  await loadMhchem(); // Load mhchem extension for chemistry formulas
  md.use(katex, {
    throwOnError: false,
    errorColor: '#cc0000',
  });

  // Store original rules for modification
  const defaultRender = md.renderer.rules;
  
  // Custom heading renderer for TOC tracking
  md.renderer.rules.heading_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const level = parseInt(token.tag.slice(1)); // h1 -> 1, h2 -> 2, etc
    const content = tokens[idx + 1].content;
    const slugUrl = slugify(content, { lower: true, strict: true });
    
    // Store slug for heading_close to use
    token.attrSet('id', slugUrl);
    
    // Only add to TOC if within configured range
    if (level >= (config.toc?.minHeadingLevel || 2) && 
        level <= (config.toc?.maxHeadingLevel || 4)) {
      addToTOC(toc, level, content, slugUrl);
    }
    
    return `<h${level} id="${slugUrl}">`;
  };
  
  md.renderer.rules.heading_close = function (tokens, idx) {
    const token = tokens[idx];
    const level = token.tag.slice(1);
    const openToken = tokens[idx - 2];
    const slugUrl = openToken.attrGet('id');
    return `<a href="#${slugUrl}">${tokens[idx - 1].content}</a></h${level}>\n`;
  };
  
  // Custom fence (code block) renderer
  md.renderer.rules.fence = function (tokens, idx) {
    const token = tokens[idx];
    const code = token.content;
    const language = token.info.trim();
    
    // Syntax highlighting if enabled
    if (config.syntaxHighlighting?.enabled && language && Prism) {
      // Lazy load the language if needed
      loadPrismLanguage(language);
      
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
  };
  
  // Custom inline code renderer
  md.renderer.rules.code_inline = function (tokens, idx) {
    const token = tokens[idx];
    const text = token.content;
    
    return `<code class="inline-code-block">${text}</code>`;
  };
  
  // Custom image renderer for Nhost optimization
  const defaultImageRender = md.renderer.rules.image || 
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    
  md.renderer.rules.image = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const href = token.attrGet('src');
    
    if (href) {
      // Detect Nhost Storage URLs and add optimization hints
      if (config.images?.nhostStorage && isNhostStorageUrl(href)) {
        token.attrSet('data-nhost-optimized', 'true');
      }
    }
    
    return defaultImageRender(tokens, idx, options, env, self);
  };
  
  // Custom link renderer with email mangling
  const defaultLinkOpen = md.renderer.rules.link_open || 
    ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
  
  md.renderer.rules.link_open = function (tokens, idx, options, env, self) {
    const token = tokens[idx];
    const href = token.attrGet('href');
    
    // Mangle mailto links to prevent email harvesting
    if (href && href.startsWith('mailto:')) {
      const mangledHref = mangleString(href);
      token.attrSet('href', mangledHref);
    }
    
    return defaultLinkOpen(tokens, idx, options, env, self);
  };
  
  // Also mangle the email text content in link_close
  md.renderer.rules.text = function (tokens, idx) {
    const token = tokens[idx];
    let content = token.content;
    
    // Check if this text is inside a mailto link by looking at surrounding tokens
    // Look backwards for link_open with mailto
    for (let i = idx - 1; i >= 0; i--) {
      if (tokens[i].type === 'link_open') {
        const href = tokens[i].attrGet('href');
        if (href && href.startsWith('mailto:')) {
          // This text is inside a mailto link, mangle it
          content = mangleString(content);
        }
        break;
      }
      if (tokens[i].type === 'link_close') {
        // We've gone past the current link
        break;
      }
    }
    
    // Handle custom text color syntax {color}(text)
    if (config.extensions?.textColors && /\{[a-z]+\}\(/.test(content)) {
      content = parseTextColor(content);
    }
    
    return content;
  };

  // Parse with markdown-it (plugins handle footnotes now)
  const html = md.render(content);

  return { html, toc };
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

/**
 * Mangle string by converting characters to HTML character references
 * This helps prevent email harvesting bots from collecting addresses
 */
function mangleString(text: string): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    // Randomly use decimal or hex encoding for obfuscation
    if (Math.random() > 0.5) {
      result += `&#${char};`;
    } else {
      result += `&#x${char.toString(16)};`;
    }
  }
  return result;
}

function addLineNumbers(html: string): string {
  const lines = html.split('\n');
  return lines.map((line, i) => 
    `<span class="line-number">${i + 1}</span>${line}`
  ).join('\n');
}