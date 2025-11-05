import type { PageObjectResponse } from '@notionhq/client';
import { json, type RequestEvent } from '@sveltejs/kit';
import { requireEnvVar, resolveNotionToken } from '../utils/env.js';
import { loadConfig } from './load-config.js';
import { syncFromNotion } from './sync.js';
import { createLogger } from '../utils/logger.js';
import { createSyncOrchestrator } from './sync/factory.js';
import { Client } from '@notionhq/client';

const CRON_SECRET = requireEnvVar('CRON_SECRET', 'Set CRON_SECRET for authenticating scheduled jobs.'); 

/**
 * Handle Notion webhook requests for page updates
 * 
 * Refactored to use new SyncOrchestrator architecture
 */
export async function handleNotionWebhookRequest(event: RequestEvent) {
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
		const config = await loadConfig();
		const dbConfig = config.databases.find((db) => db.dataSourceId === notionDataSourceId);

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

		// Resolve Notion token (supports env var name, actual token, or default)
		const notionToken = resolveNotionToken(dbConfig.notionToken, dbConfig.alias);
		
		// Fetch page from Notion using the resolved token
		const notion = new Client({ auth: notionToken });
		const page = (await notion.pages.retrieve({ page_id: pageId })) as PageObjectResponse;

		// Create orchestrator and process page
		const orchestrator = createSyncOrchestrator(dbConfig);
		await orchestrator.processPage(page);

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
 */
export async function handlePollBlogRequest(event: RequestEvent) {
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

		const result = await syncFromNotion({
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
