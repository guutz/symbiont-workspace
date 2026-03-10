/**
 * Symbiont CMS - Sync Architecture
 * 
 * This module exports the refactored sync classes that implement
 * a clean separation of concerns for Notion → Database sync.
 * 
 * ## Architecture Layers
 * 
 * ```
 * NotionClient (API layer) - Talk to Notion API
 *     ↓
 * NotionPageToDatabasePageTransformer (Business logic) - Apply sync rules, resolve slugs
 *     ↓
 * DatabasePageCRUD (Database layer) - Postgres operations
 *     ↓
 * NotionToDatabaseSync (Coordination) - Coordinate full sync flow
 * ```
 * 
 * ## Usage
 * 
 * ### High-level (recommended):
 * ```typescript
 * import { createNotionToDatabaseSyncCoordinator } from 'symbiont-cms/server';
 * 
 * const sync = createNotionToDatabaseSyncCoordinator(config);
 * await sync.syncDataSource({ syncAll: true });
 * ```
 * 
 * ### Low-level (for testing or custom workflows):
 * ```typescript
 * import { NotionClient, DatabasePageCRUD, NotionPageToDatabasePageTransformer } from 'symbiont-cms/server';
 * 
 * const notionClient = new NotionClient(notion);
 * const pageCrud = new DatabasePageCRUD(supabaseUrl, serviceRoleKey);
 * const transformer = new NotionPageToDatabasePageTransformer(config, notionClient, pageCrud);
 * 
 * const pageData = await transformer.transformPage(page);
 * await pageCrud.upsert(pageData);
 * ```
 */

// Factory functions (recommended entry point)
export { createNotionToDatabaseSyncCoordinator } from './sync/coordinator.js';

// Orchestration layer
export { NotionToDatabaseSync } from './sync/notion-to-database-sync.js';
export type { SyncOptions, SyncResult } from './sync/notion-to-database-sync.js';

// Business logic layer
export { NotionPageToDatabasePageTransformer } from './notion/page-transformer.js';

// Database layer
export { DatabasePageCRUD } from './database/page-crud.js';

// API layer
export { NotionClient } from './notion/client.js';

// Webhook handlers
export { handleNotionWebhookRequest, handlePollBlogRequest } from './webhook.js';
