/**
 * Symbiont CMS - Sync Architecture
 * 
 * This module exports the refactored sync classes that implement
 * a clean separation of concerns for Notion → Database sync.
 * 
 * ## Architecture Layers
 * 
 * ```
 * NotionAdapter (API layer) - Talk to Notion API
 *     ↓
 * PostBuilder (Business logic) - Apply sync rules, resolve slugs
 *     ↓
 * PostRepository (Database layer) - GraphQL operations
 *     ↓
 * SyncOrchestrator (Coordination) - Coordinate full sync flow
 * ```
 * 
 * ## Usage
 * 
 * ### High-level (recommended):
 * ```typescript
 * import { createSyncOrchestrator } from 'symbiont-cms/server/sync';
 * 
 * const orchestrator = createSyncOrchestrator(config);
 * await orchestrator.syncDataSource({ syncAll: true });
 * ```
 * 
 * ### Low-level (for testing or custom workflows):
 * ```typescript
 * import { NotionAdapter, PostRepository, PostBuilder } from 'symbiont-cms/server/sync';
 * 
 * const adapter = new NotionAdapter(notion, n2m);
 * const repo = new PostRepository(gqlClient);
 * const builder = new PostBuilder(config, adapter, repo);
 * 
 * const postData = await builder.buildPost(page);
 * await repo.upsert(postData);
 * ```
 */

// Factory functions (recommended entry point)
export { createSyncOrchestrator, createSyncOrchestrators } from './sync/factory.js';

// Orchestration layer
export { SyncOrchestrator } from './sync/orchestrator.js';
export type { SyncOptions, SyncSummary } from './sync/orchestrator.js';

// Business logic layer
export { PostBuilder } from './sync/post-builder.js';

// Database layer
export { PostRepository } from './sync/post-repository.js';
export type { PostData } from './sync/post-repository.js';

// API layer
export { NotionAdapter } from './notion/adapter.js';

// High-level sync functions (legacy API - still works)
export { syncFromNotion } from './sync.js';
export { handleNotionWebhookRequest, handlePollBlogRequest } from './webhook.js';

// Configuration helpers
export { loadConfig, getSourceByAlias } from './load-config.js';
