// Server-only exports for symbiont-cms
// Import this file only in server-side code (API routes, +page.server.ts, etc.)

export { handlePollBlogRequest, handleNotionWebhookRequest } from './server/webhook.js';
export { syncFromNotion } from './server/sync.js';
export { createPostLoad, load as postLoad } from './server/post-loader.js';
export { requireEnvVar } from './utils/env.js';
export { parseMarkdown } from './server/markdown-processor.js';

// GraphQL query functions (server-side)
export { getPostBySlug, getAllPosts } from './server/queries.js';

// Config loading (server-only, returns full SymbiontConfig with rules/functions)
export { loadConfig } from './server/load-config.js';

export type {
	PostServerLoad,
	PostLoadResult
} from './server/post-loader.js';

export type {
	GetPostOptions,
	GetAllPostsOptions
} from './server/queries.js';

export type { MarkdownResult } from './server/markdown-processor.js';
