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
