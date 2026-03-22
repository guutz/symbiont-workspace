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
export { handlePollBlogRequest, handleNotionWebhookRequest, syncFromNotion } from './server/webhook.js';
export type { SyncFromNotionResult } from './server/webhook.js';

// Storage cleanup
export { cleanupUnusedMedia } from './server/bucket/storage-cleanup.js';
export type { MediaCleanupResult } from './server/bucket/storage-cleanup.js';

// Markdown processing
export { renderMarkdownToHtml, renderSummaryToHtml } from './server/markdown/to-html-renderer.js';
export type { RenderedMarkdown } from './server/markdown/to-html-renderer.js';

// Server utilities
export { requireEnvVar, readEnvVar } from './server/utils/env.js';
export { createLogger } from './server/utils/logger.js';
export { createSlug } from './server/utils/slug.js';

// Image processing utilities
export { uploadImageToSupabase, uploadFileToSupabase, uploadBufferToSupabase, needsUploadToSupabase, getImageUrl } from './server/bucket/image-upload.js';
export type { UploadImageOptions, UploadFileOptions, UploadBufferOptions, UploadImageResult } from './server/bucket/image-upload.js';

// Markdown to Notion conversion
export { convertMarkdownToNotionBlocks } from './server/notion-md/markdown-to-blocks.js';

// Markdown image utilities
export { extractImageUrls, replaceImageUrls } from './server/markdown/image-url-extractor.js';

// Notion property helpers
export {
	getPropertyByName,
	getFirstPropertyByName,
	getPropertyPlainText,
	getPropertyNamedValue,
	getPropertyNumberValue,
} from './server/notion/property-utils.js';
