import type { PageObjectResponse } from '@notionhq/client';
import { json, type RequestEvent } from '@sveltejs/kit';
import { Client } from '@notionhq/client';
import { readEnvVar } from '../utils/env.js';
import { loadConfig } from './load-config.js';
import { requireEnvVar } from '../utils/env.js';
import { gqlAdminClient, GET_EXISTING_POST_QUERY, type ExistingPostResponse } from './graphql.js';
import { notion } from './notion.js';
import { processPageWebhook } from './page-processor.js';
import { syncFromNotion } from './sync.js';

const CRON_SECRET = requireEnvVar('CRON_SECRET', 'Set CRON_SECRET for authenticating scheduled jobs.');

/**
 * Handle Notion webhook requests for page updates
 */
export async function handleNotionWebhookRequest(event: RequestEvent) {

	try {
		const payload = await event.request.json();

		if (payload.event !== 'page.update' || !payload.page?.id || !payload.page.parent?.data_source_id) {
			console.log('[symbiont] Received a non-page-update webhook or invalid payload. Ignoring.');
			return json({ message: 'Ignoring non-page-update event' }, { status: 200 });
		}

		const pageId = payload.page.id;
		const notionDatabaseId = payload.page.parent.data_source_id;

		const config = await loadConfig();
		const dbConfig = config.databases.find((db: any) => db.notionDatabaseId === notionDatabaseId);

		if (!dbConfig) {
			console.warn(`[symbiont] Received webhook for an unknown database ID: ${notionDatabaseId}.`);
			return json({ message: `Database ID ${notionDatabaseId} not configured` }, { status: 404 });
		}

		console.log(`[symbiont] Webhook received for page '${pageId}' in database '${dbConfig.short_db_ID}'.`);

		// Check if post exists (efficient single query)
		const existingPostResult = await gqlAdminClient.request<ExistingPostResponse>(GET_EXISTING_POST_QUERY, {
			source_id: dbConfig.short_db_ID,
			notion_page_id: pageId
		});

		const existingPost = existingPostResult.posts.length > 0 ? existingPostResult.posts[0] : null;

		const page = (await notion.pages.retrieve({ page_id: pageId })) as PageObjectResponse;
		await processPageWebhook(page, dbConfig, existingPost);

		return json({ message: `Successfully processed page ${pageId}` }, { status: 200 });
	} catch (error: any) {
		console.error('[symbiont] Critical error during Notion webhook processing:', error);
		return json({ error: error.message ?? 'Unknown error' }, { status: 500 });
	}
}

/**
 * Handle polling/cron sync requests
 */
export async function handlePollBlogRequest(event: RequestEvent) {

	try {
		const providedSecret =
			event.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
			event.url.searchParams.get('secret') ??
			'';

		if (providedSecret !== CRON_SECRET) {
			console.warn('[symbiont] Unauthorized sync attempt blocked.');
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
		console.error('[symbiont] Critical error during Notion sync:', error);
		return json({ error: error.message ?? 'Unknown error' }, { status: 500 });
	}
}
