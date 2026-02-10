/**
 * Markdown Migration Utilities
 * 
 * Core utilities for processing markdown content during migration.
 * File I/O operations are handled by the migration script itself.
 */

export interface ImageReference {
  url: string;
  alt: string;
  fullMatch: string;
  isLocal: boolean;
}

/**
 * Extract all image URLs from markdown content
 */
export function extractImageUrls(content: string): ImageReference[] {
  const imageUrls: ImageReference[] = [];
  
  // Match: ![alt text](url) or ![alt text](url "title")
  const imageRegex = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  
  let match;
  while ((match = imageRegex.exec(content)) !== null) {
    const [fullMatch, alt, url] = match;
    
    imageUrls.push({
      url,
      alt,
      fullMatch,
      isLocal: url.startsWith('/'),
    });
  }
  
  return imageUrls;
}

/**
 * Update markdown content with new image URLs
 */
export function replaceImageUrls(
  content: string,
  replacements: Map<string, string>
): string {
  let updatedContent = content;
  
  for (const [oldUrl, newUrl] of replacements.entries()) {
    // Escape special regex characters in the old URL
    const escapedOldUrl = oldUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Replace all occurrences of the old URL with the new URL
    updatedContent = updatedContent.replace(
      new RegExp(`!\\[([^\\]]*)\\]\\(${escapedOldUrl}(?:\\s+"[^"]*")?\\)`, 'g'),
      `![$1](${newUrl})`
    );
  }
  
  return updatedContent;
}
