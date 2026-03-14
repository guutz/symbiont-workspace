import { Client } from '@notionhq/client';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
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
 * @param adminSupabase - Optional pre-created service role Supabase client.
 *   Pass this when the caller already holds an admin client (e.g. syncFromNotion)
 *   to avoid creating redundant client instances.
 *
 * @example
 * const sync = createNotionToDatabaseSyncCoordinator(client, dbConfig);
 * await sync.syncDataSource({ syncAll: true });
 */
export function createNotionToDatabaseSyncCoordinator(
	client: SymbiontClient,
	config: DatabaseBlueprint,
	adminSupabase?: SupabaseClient<Database>
): NotionToDatabaseSync {
	const notionToken = requireEnvVar("NOTION_TOKEN");

	// Initialize Notion API client
	const notion = new Client({ auth: notionToken });

	// Create NotionClient (wraps Notion API + built-in MD conversion)
	const notionClient = new NotionClient(notion);
	if (typeof config.syncBackToNotion === 'boolean' || config.syncBackToNotion === undefined) {
		notionClient.setWritesEnabled(config.syncBackToNotion ?? true);
	} else {
		notionClient.setWritePolicy({
			content: config.syncBackToNotion.content ?? true,
			properties: config.syncBackToNotion.properties ?? true,
		});
	}

	// Custom transformer: use caption as alt text, empty string when no caption.
	// This prevents the default behavior of using the filename as alt text.
	notionClient.setBlockTransformer('image', async (block: any) => {
		const { image } = block;
		if (!image?.type) return false; // use default behavior

		const caption = image.caption
			?.map((item: any) => item.plain_text)
			.join('')
			.trim();

		let url = '';
		if (image.type === 'external') {
			url = image.external?.url || '';
		} else if (image.type === 'file') {
			url = image.file?.url || '';
		}

		if (!url) return false;

		const altText = caption || '';
		return `![${altText}](${url})`;
	});

	// Use the provided admin client, or create one if not supplied.
	const supabase: SupabaseClient<Database> = adminSupabase ?? createClient<Database>(
		client.config.supabase.url,
		requireEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
		{
			auth: {
				autoRefreshToken: false,
				persistSession: false,
				detectSessionInUrl: false
			}
		}
	);

	const pageCrud = new DatabasePageCRUD(supabase);

	const transformer = new NotionPageToDatabasePageTransformer(
		config,
		notionClient,
		pageCrud,
		supabase
	);

	const sync = new NotionToDatabaseSync(
		notionClient,
		transformer,
		pageCrud,
		config
	);

	return sync;
}
