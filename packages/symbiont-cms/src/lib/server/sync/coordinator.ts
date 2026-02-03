import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import type { DatabaseBlueprint } from '../../types.js';
import type { SymbiontClient } from '../../client.js';
import { requireEnvVar } from '../utils/env.js';
import { NotionClient } from '../notion/client.js';
import { DatabasePageCRUD } from '../database/page-crud.js';
import { NotionPageToWebsitePageTransformer } from '../notion/page-transformer.js';
import { NotionToDatabaseSync } from './notion-to-database-sync.js';

/**
 * Factory function to create a fully-wired NotionToDatabaseSync coordinator
 * 
 * This handles all the dependency injection:
 * - Notion client initialization (with token resolution)
 * - Database client setup
 * - Class instantiation in the correct order
 * 
 * @param client - Symbiont client instance
 * @param config - Database configuration blueprint
 * 
 * @example
 * const sync = createNotionToDatabaseSyncCoordinator(client, dbConfig);
 * await sync.syncDataSource({ syncAll: true });
 */
export function createNotionToDatabaseSyncCoordinator(
	client: SymbiontClient,
	config: DatabaseBlueprint
): NotionToDatabaseSync {
	const notionToken = requireEnvVar("NOTION_TOKEN");
	const serviceRoleKey = requireEnvVar("SUPABASE_SERVICE_ROLE_KEY");
	
	// Initialize Notion client with resolved token
	const notion = new Client({ auth: notionToken });
	const n2m = new NotionToMarkdown({ notionClient: notion });

	// Create Notion client layer (Notion API)
	const notionClient = new NotionClient(notion, n2m);

	// Create page CRUD layer (Database) with Supabase admin client
	const pageCrud = new DatabasePageCRUD(
		client.config.supabase.url,
		serviceRoleKey
	);

	// Create transformation layer (Notion page to website page)
	const transformer = new NotionPageToWebsitePageTransformer(
		config,
		notionClient,
		pageCrud,
		client.config.supabase.url,
		serviceRoleKey
	);

	// Create sync coordinator (coordination layer)
	const sync = new NotionToDatabaseSync(
		notionClient,
		transformer,
		pageCrud,
		config
	);

	return sync;
}
