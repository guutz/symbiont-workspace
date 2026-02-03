// Server-side exports for symbiont-cms
// This is a SUPERSET of the default 'symbiont-cms' export
// Import this in server-side code (API routes, +page.server.ts, etc.)

// ============================================================================
// RE-EXPORT EVERYTHING FROM INDEX (client-safe baseline)
// ============================================================================
export * from './index.js';

// ============================================================================
// SERVER-ONLY ADDITIONS
// ============================================================================

// Webhook handlers & sync
export { handlePollBlogRequest, handleNotionWebhookRequest } from './server/webhook.js';

// Markdown processing
export { renderMarkdownToHtml, renderSummaryToHtml } from './server/markdown/to-html-renderer.js';
export type { RenderedMarkdown } from './server/markdown/to-html-renderer.js';

// Server utilities
export { requireEnvVar, readEnvVar } from './server/utils/env.js';
export { createLogger } from './server/utils/logger.js';
export { createSlug } from './server/utils/slug.js';

// Image processing utilities
export { uploadImageToSupabase, needsUploadToSupabase, getImageUrl } from './server/bucket/image-upload.js';
export type { UploadImageOptions, UploadImageResult } from './server/bucket/image-upload.js';

// Markdown to Notion conversion
export { convertMarkdownToNotionBlocks } from './server/notion/markdown-to-blocks.js';

// Markdown image utilities
export { extractImageUrls, replaceImageUrls } from './server/markdown/image-url-extractor.js';
