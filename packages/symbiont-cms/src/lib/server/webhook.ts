import type { PageObjectResponse } from '@notionhq/client';
import { json, type RequestEvent } from '@sveltejs/kit';
import { requireEnvVar } from './utils/env.js';
import type { SymbiontClient } from '../client.js';
import { createLogger } from './utils/logger.js';
import { createNotionToDatabaseSyncCoordinator } from './sync/coordinator.js';
import type { SyncResult, SyncOptions } from './sync/notion-to-database-sync.js';
import { Client } from '@notionhq/client';

const CRON_SECRET = requireEnvVar('CRON_SECRET', 'Set CRON_SECRET for authenticating scheduled jobs.');

/**
 * Sync one or more databases from Notion
 */
export async function syncFromNotion(
	client: SymbiontClient,
	options: { databaseId?: string | null; since?: string | null; syncAll?: boolean; wipe?: boolean } = {}
): Promise<{ summaries: SyncResult[] }> {
	const logger = createLogger({ operation: 'sync_from_notion' });

	// Determine which databases to sync
	const dbConfigs = options.databaseId
		? client.config.databases.filter((db: any) => db.alias === options.databaseId || db.dataSourceId === options.databaseId)
		: client.config.databases;

	if (dbConfigs.length === 0) {
		logger.warn({ event: 'no_databases_found', databaseId: options.databaseId });
		return { summaries: [] };
	}

	// Sync each database
	const summaries: SyncResult[] = [];
	for (const dbConfig of dbConfigs) {
		const sync = createNotionToDatabaseSyncCoordinator(client, dbConfig);
		const result = await sync.syncDataSource({
			since: options.since,
			syncAll: options.syncAll,
			wipe: options.wipe
		});
		summaries.push(result);
	}

	return { summaries };
} 

/**
 * Handle Notion webhook requests for page updates
 * 
 * Refactored to use new SyncOrchestrator architecture
 * 
 * @param client - Symbiont client instance
 * @param event - SvelteKit RequestEvent
 */
export async function handleNotionWebhookRequest(client: SymbiontClient, event: RequestEvent) {
	const logger = createLogger({ operation: 'webhook' });

	try {
		const payload = await event.request.json();

		if (payload.event !== 'page.update' || !payload.page?.id || !payload.page.parent?.data_source_id) {
			logger.debug({ 
				event: 'webhook_ignored', 
				reason: 'non_page_update_or_invalid_payload' 
			});
			return json({ message: 'Ignoring non-page-update event' }, { status: 200 });
		}

		const pageId = payload.page.id;
		const notionDataSourceId = payload.page.parent.data_source_id;

		// Find database config by dataSourceId (Notion database UUID)
		const config = client.config;
		const dbConfig = config.databases.find((db: any) => db.dataSourceId === notionDataSourceId);

		if (!dbConfig) {
			logger.warn({ 
				event: 'webhook_database_not_found', 
				notionDataSourceId 
			});
			return json({ message: `Database ID ${notionDataSourceId} not configured` }, { status: 404 });
		}

		logger.info({ 
			event: 'webhook_received', 
			pageId, 
			alias: dbConfig.alias,
			dataSourceId: dbConfig.dataSourceId 
		});

		// Get Notion token from environment
		const notionToken = requireEnvVar('NOTION_TOKEN');
		
		// Fetch page from Notion
		const notion = new Client({ auth: notionToken });
		const page = (await notion.pages.retrieve({ page_id: pageId })) as PageObjectResponse;

		// Create sync coordinator and process page
		const sync = createNotionToDatabaseSyncCoordinator(client, dbConfig);
		await sync.processPage(page);

		logger.info({ event: 'webhook_processed_successfully', pageId });
		return json({ message: `Successfully processed page ${pageId}` }, { status: 200 });
	} catch (error: any) {
		logger.error({ 
			event: 'webhook_processing_failed', 
			error: error?.message,
			stack: error?.stack
		});
		return json({ error: error.message ?? 'Unknown error' }, { status: 500 });
	}
}

/**
 * Handle polling/cron sync requests
 * 
 * @param client - Symbiont client instance
 * @param event - SvelteKit RequestEvent
 */
export async function handlePollBlogRequest(client: SymbiontClient, event: RequestEvent) {
	const logger = createLogger({ operation: 'poll_sync' });

	try {
		const providedSecret =
			event.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
			event.url.searchParams.get('secret') ??
			'';

		if (providedSecret !== CRON_SECRET) {
			logger.warn({ event: 'unauthorized_sync_attempt' });
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const result = await syncFromNotion(client, {
			databaseId: event.url.searchParams.get('database'),
			since: event.url.searchParams.get('since'),
			syncAll: event.url.searchParams.get('syncAll') === 'true',
			wipe: event.url.searchParams.get('wipe') === 'true'
		});

		const hasError = result.summaries.some((s) => s.status === 'error');
		return json(result, { status: hasError ? 500 : 200 });
	} catch (error: any) {
		logger.error({ 
			event: 'poll_sync_failed', 
			error: error?.message,
			stack: error?.stack
		});
		return json({ error: error.message ?? 'Unknown error' }, { status: 500 });
	}
}
