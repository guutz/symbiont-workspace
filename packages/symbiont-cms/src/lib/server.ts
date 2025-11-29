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
export { syncFromNotion } from './server/sync.js';

// Post loading
export { createPostLoad, load as postLoad } from './server/post-loader.js';
export type { PostServerLoad, PostLoadResult } from './server/post-loader.js';

// Markdown processing
export { parseMarkdown } from './server/markdown-processor.js';
export type { MarkdownResult } from './server/markdown-processor.js';

// Admin GraphQL operations
export { gqlAdminClient } from './server/queries.js';

// Server utilities
export { requireEnvVar, resolveNotionToken, readEnvVar } from './server/utils/env.server.js';
export { createLogger } from './server/utils/logger.js';
export { createSlug } from './server/utils/slug-helpers.js';

// Server-side config loader (full config with secrets)
export { loadServerConfig, getSourceByAlias } from './server/load-config.js';

// Image processing utilities
export { extractImageUrlsFromMarkdown, extractImageUrlsFromNotionPage } from './image-utils.js';
export { uploadImage, uploadImages, rewriteImageUrls } from './image-upload.js';
export type { ImageUploadOptions, ImageUploadResult, ImageUploadError } from './image-upload.js';
export { processMarkdownImages, processNotionPageImages, isExternalUrl } from './image-processor.js';
export type { ImageProcessorOptions, ProcessMarkdownResult } from './image-processor.js';

// Markdown to Notion conversion
export { markdownToNotionBlocks } from './server/notion/markdown-to-notion.js';

// Reverse sync (DB → Notion)
export { publishPostToNotion } from './server/sync/publish-to-notion.js';
export type { PublishToNotionOptions } from './server/sync/publish-to-notion.js';

// Markdown migration utilities
export { extractImages, replaceImageUrls } from './server/utils/markdown-migration.js';
export type { ImageReference } from './server/utils/markdown-migration.js';
