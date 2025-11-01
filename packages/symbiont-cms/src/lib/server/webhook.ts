import type { PageObjectResponse } from '@notionhq/client';
import { json, type RequestEvent } from '@sveltejs/kit';
import { Client } from '@notionhq/client';
import { readEnvVar } from '../utils/env.js';
import { loadDatabaseConfig } from './load-config.js';
import { requireEnvVar } from '../utils/env.js';
import { gqlAdminClient, GET_EXISTING_POST_QUERY, type ExistingPostResponse } from './graphql.js';
import { notion } from './notion.js';
import { ingestNotionPage } from './notion-ingest.js';
import { syncFromNotion } from './sync.js';
import { createLogger } from '../utils/logger.js';

const CRON_SECRET = requireEnvVar('CRON_SECRET', 'Set CRON_SECRET for authenticating scheduled jobs.');

/**
 * Handle Notion webhook requests for page updates
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
		const notionDatabaseId = payload.page.parent.data_source_id;

		const dbConfig = await loadDatabaseConfig(notionDatabaseId);

		if (!dbConfig) {
			logger.warn({ 
				event: 'webhook_database_not_found', 
				notionDatabaseId 
			});
			return json({ message: `Database ID ${notionDatabaseId} not configured` }, { status: 404 });
		}

		logger.info({ 
			event: 'webhook_received', 
			pageId, 
			databaseId: dbConfig.dbNickname 
		});

		// Check if this post has already been ingested into the database (efficient single query)
		const existingPostResult = await gqlAdminClient.request<ExistingPostResponse>(GET_EXISTING_POST_QUERY, {
			source_id: dbConfig.dbNickname,
			notion_page_id: pageId
		});

		const existingPost = existingPostResult.posts.length > 0 ? existingPostResult.posts[0] : null;

		const page = (await notion.pages.retrieve({ page_id: pageId })) as PageObjectResponse;
		await processPageWebhook(page, dbConfig, existingPost);

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
			event: 'sync_failed', 
			error: error?.message,
			stack: error?.stack
		});
		return json({ error: error.message ?? 'Unknown error' }, { status: 500 });
	}
}
