import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { createClient } from '@supabase/supabase-js';
import type { DatabaseBlueprint } from '../../types.js';
import type { Database } from '../../database.types.js';
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
 * **Supabase Client Pattern**:
 * - User's SymbiontClient contains a public/anon Supabase client (read-only)
 * - Coordinator creates a service role Supabase client (admin, write access)
 * - Service role client is used for:
 *   - Image uploads to storage
 *   - Database mutations (upsert/delete pages)
 *   - Sync operations requiring write access
 * 
 * @param client - Symbiont client instance (contains public Supabase client)
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

	// Create Supabase admin client for sync operations
	// This is separate from the user's public client in SymbiontClient
	// Service role key grants full access for mutations and storage
	const supabase = createClient<Database>(
		client.config.supabase.url,
		serviceRoleKey,
		{
			auth: {
				autoRefreshToken: false,
				persistSession: false,
				detectSessionInUrl: false
			}
		}
	);

	// Create page CRUD layer (Database) with service role client
	const pageCrud = new DatabasePageCRUD(
		client.config.supabase.url,
		serviceRoleKey
	);

	// Create transformation layer (Notion page to website page)
	// Receives admin Supabase client for image uploads
	const transformer = new NotionPageToDatabasePageTransformer(
		config,
		notionClient,
		pageCrud,
		supabase
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
