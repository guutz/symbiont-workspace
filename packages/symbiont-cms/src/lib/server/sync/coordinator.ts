import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import type { DatabaseBlueprint } from '../../types.js';
import type { SymbiontClient } from '../../client.js';
import { requireEnvVar } from '../utils/env.js';
import { NotionClient } from '../notion/client.js';
import { DatabasePageCRUD } from '../database/page-crud.js';
import { NotionPageToDatabasePageTransformer } from '../notion/page-transformer.js';
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
	// Note: Type assertion needed because notion-to-md types expect older @notionhq/client version
	// The runtime API is compatible, it's just a TypeScript version mismatch
	const n2m = new NotionToMarkdown({ notionClient: notion as any });

	// Custom transformer: Use empty alt text when image has no caption
	// This prevents notion-to-md from using the filename as alt text
	n2m.setCustomTransformer('image', async (block: any) => {
		const { image } = block;
		if (!image?.type) return false; // use default behavior

		// Get caption from Notion block
		const caption = image.caption
			?.map((item: any) => item.plain_text)
			.join('')
			.trim();

		// Get image URL
		let url = '';
		if (image.type === 'external') {
			url = image.external?.url || '';
		} else if (image.type === 'file') {
			url = image.file?.url || '';
		}

		if (!url) return false; // use default behavior if no URL

		// Use caption if provided, otherwise empty string (no alt text)
		const altText = caption || '';
		return `![${altText}](${url})`;
	});

	// Create Notion client layer (Notion API)
	const notionClient = new NotionClient(notion, n2m);

	// Create page CRUD layer (Database) with Supabase admin client
	const pageCrud = new DatabasePageCRUD(
		client.config.supabase.url,
		serviceRoleKey
	);

	// Create transformation layer (Notion page to website page)
	const transformer = new NotionPageToDatabasePageTransformer(
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
