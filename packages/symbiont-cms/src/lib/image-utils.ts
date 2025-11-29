/**
 * Small utility helpers for extracting image URLs from Markdown text
 * and from a Notion page-like object. These are intentionally conservative
 * and return unique URLs found in the input.
 */

export function extractImageUrlsFromMarkdown(markdown: string): string[] {
  const urls = new Set<string>();
  if (!markdown) return [];

  // Markdown image syntax: ![alt](url)
  const mdImgRe = /!\[[^\]]*\]\(([^)]+)\)/g;
  let m;
  while ((m = mdImgRe.exec(markdown))) {
    if (m[1]) urls.add(m[1].trim());
  }

  // HTML <img src="...">
  const htmlImgRe = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((m = htmlImgRe.exec(markdown))) {
    if (m[1]) urls.add(m[1].trim());
  }

  // Plain image URLs (common extensions)
  const plainImgRe = /\bhttps?:\/\/[^\s)"']+\.(?:png|jpe?g|gif|webp|svg)(?:\?[^\s)"']*)?/gi;
  while ((m = plainImgRe.exec(markdown))) {
    if (m[0]) urls.add(m[0].trim());
  }

  return Array.from(urls);
}

/**
 * Extract image URLs from a Notion page object.
 * This handles common fields: `cover`, file properties, and rich_text.
 * The function is defensive about input shapes — it will try multiple
 * possible property shapes and fall back to string-scanning property text
 * with the markdown extractor above.
 */
export function extractImageUrlsFromNotionPage(page: any): string[] {
  const urls = new Set<string>();
  if (!page || typeof page !== 'object') return [];

  // cover can be {type: 'external'|'file', external: {url}, file: {url}}
  try {
    const cover = (page as any).cover;
    if (cover) {
      if (cover.external?.url) urls.add(cover.external.url);
      if (cover.file?.url) urls.add(cover.file.url);
    }
  } catch (e) {
    // ignore
  }

  // Properties: iterate and look for 'files' or rich text containing URLs
  const props = (page as any).properties;
  if (props && typeof props === 'object') {
    for (const key of Object.keys(props)) {
      const prop = props[key];
      if (!prop) continue;

      // Files property: prop.files -> [{file: {url}} | {external: {url}}]
      if (Array.isArray(prop.files)) {
        for (const f of prop.files) {
          if (f?.file?.url) urls.add(f.file.url);
          if (f?.external?.url) urls.add(f.external.url);
        }
      }

      // Some Notion property types embed rich_text arrays or plain_text
      const richTextCandidates: string[] = [];
      if (Array.isArray(prop.rich_text)) {
        for (const rt of prop.rich_text) {
          if (typeof rt.plain_text === 'string') richTextCandidates.push(rt.plain_text);
          else if (typeof rt.text === 'object' && typeof rt.text.content === 'string') richTextCandidates.push(rt.text.content);
        }
      }

      if (typeof prop.plain_text === 'string') richTextCandidates.push(prop.plain_text);
      if (typeof prop.title === 'string') richTextCandidates.push(prop.title);
      if (Array.isArray(prop.title)) {
        for (const t of prop.title) {
          if (typeof t.plain_text === 'string') richTextCandidates.push(t.plain_text);
        }
      }

      // Fallback: if property is a string-ish value, stringify and scan
      if (typeof prop === 'string') richTextCandidates.push(prop);

      for (const text of richTextCandidates) {
        for (const u of extractImageUrlsFromMarkdown(text)) urls.add(u);
      }
    }
  }

  return Array.from(urls);
}

export default {
  extractImageUrlsFromMarkdown,
  extractImageUrlsFromNotionPage,
};
