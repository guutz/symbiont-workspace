/**
 * Markdown to Notion Conversion
 * 
 * Pure utility for converting markdown to Notion blocks.
 * Built on @tryfabric/martian for robust markdown parsing.
 * 
 * For orchestrated sync workflows, see sync/publish-to-notion.ts
 */

import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints.js';
import { markdownToBlocks as martianMarkdownToBlocks } from '@tryfabric/martian';

/**
 * Convert markdown to Notion blocks using Martian
 * 
 * Handles comprehensive markdown features:
 * - Inline formatting (bold, italic, strikethrough, code, links)
 * - Headings (h1-h3, h4+ converted to h3)
 * - Lists (ordered, unordered, checkboxes with nesting)
 * - Code blocks with language detection
 * - Blockquotes (standard, GFM alerts)
 * - Tables, images, math equations, dividers
 * 
 * Automatically handles Notion limits:
 * - 2000 chars per rich_text object
 * - 100 blocks per request
 * - Invalid image URLs
 * 
 * @param markdown - Markdown content to convert
 * @param options - Conversion options
 * @returns Array of Notion BlockObjectRequest objects
 */
export function markdownToNotionBlocks(
  markdown: string,
  options?: {
    /** Convert invalid image URLs to text instead of failing (default: false) */
    strictImageUrls?: boolean;
    /** Auto-truncate when exceeding Notion limits (default: true) */
    truncate?: boolean;
    /** Callback for when content exceeds Notion limits */
    onLimitExceeded?: (err: Error) => void;
  }
): BlockObjectRequest[] {
  // Martian returns blocks compatible with an older version of the Notion client
  // We cast them to work with the latest client types
  return martianMarkdownToBlocks(markdown, {
    strictImageUrls: options?.strictImageUrls ?? false,
    notionLimits: {
      truncate: options?.truncate ?? true,
      onError: options?.onLimitExceeded,
    },
  }) as unknown as BlockObjectRequest[];
}
