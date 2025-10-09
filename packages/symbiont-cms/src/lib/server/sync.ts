import type { PageObjectResponse } from '@notionhq/client';
import type { HydratedDatabaseConfig, SyncSummary } from '../types.js';
import { buildPostLookups } from '../utils/notion-helpers.js';
import { gqlAdminClient, GET_ALL_POSTS_FOR_DATABASE_QUERY, DELETE_POSTS_BY_SOURCE_MUTATION, type AllPostsResponse, type DeletePostsResponse } from './graphql.js';
import { notion } from './notion.js';
import { processPageBatch } from './page-processor.js';
import { loadConfig } from './load-config.js';
import { createLogger, SyncMetrics } from '../utils/logger.js';

/**
 * Sync content from Notion databases to Nhost
 */
export async function syncFromNotion(
	options: { databaseId?: string | null; since?: string | null; syncAll?: boolean; wipe?: boolean } = {}
): Promise<{ since: string | null; summaries: SyncSummary[] }> {

	const logger = createLogger({ operation: 'sync' });
	logger.info({ event: 'sync_started', options });
	
	const config = await loadConfig();

	const sinceIso = options.syncAll ? null : options.since || new Date(Date.now() - 5 * 60 * 1000).toISOString();
	const targetDatabases = getTargetDatabases(config.databases, options.databaseId);

	if (targetDatabases.length === 0) {
		const hint = options.databaseId
			? `No database matched '${options.databaseId}'. Check symbiont.config.ts for valid ids.`
			: 'No databases configured.';
		logger.error({ event: 'sync_failed', reason: 'no_databases', hint });
		throw new Error(hint);
	}

	const summaries: SyncSummary[] = [];
	for (const dbConfig of targetDatabases) {
		const dbLogger = logger.child({ databaseId: dbConfig.short_db_ID });
		try {
			summaries.push(await syncDatabase(dbConfig, sinceIso, options.wipe || false, dbLogger));
		} catch (err: any) {
			const message = err?.message ?? 'Unknown error';
			dbLogger.error({ 
				event: 'database_sync_failed', 
				error: message,
				stack: err?.stack 
			});
			summaries.push({
				short_db_ID: dbConfig.short_db_ID,
				notionDatabaseId: dbConfig.notionDatabaseId,
				processed: 0,
				skipped: 0,
				status: 'error',
				details: message
			});
		}
	}

	logger.info({ 
		event: 'sync_finished', 
		databases_synced: summaries.length,
		summaries 
	});
	return { since: sinceIso, summaries };
}

/**
 * Sync a single database
 */
async function syncDatabase(
	config: HydratedDatabaseConfig, 
	sinceIso: string | null, 
	wipe: boolean,
	logger: ReturnType<typeof createLogger>
): Promise<SyncSummary> {

	const metrics = new SyncMetrics();

	// Wipe existing posts if requested
	if (wipe) {
		logger.info({ event: 'wipe_started' });
		const deleteResult = await gqlAdminClient.request<DeletePostsResponse>(DELETE_POSTS_BY_SOURCE_MUTATION, {
			short_db_ID: config.short_db_ID
		});
		logger.info({ 
			event: 'wipe_completed', 
			deleted_count: deleteResult.delete_posts.affected_rows 
		});
	}

	const queryOptions: any = { data_source_id: config.notionDatabaseId };
	if (sinceIso) {
		queryOptions.filter = {
			timestamp: 'last_edited_time',
			last_edited_time: { after: sinceIso }
		};
	}

	// Fetch all pages with cursor pagination (Notion API returns max 100 per page)
	const allPages: PageObjectResponse[] = [];
	let cursor: string | null | undefined = undefined;
	let pageCount = 0;

	do {
		const response = await notion.dataSources.query({
			...queryOptions,
			start_cursor: cursor
		});

		// Filter to only PageObjectResponse types
		const pages = response.results.filter((page): page is PageObjectResponse => 'properties' in page);
		allPages.push(...pages);
		pageCount++;

		cursor = response.has_more ? response.next_cursor : null;
		
		if (cursor) {
			logger.debug({ 
				event: 'fetching_next_page', 
				page_number: pageCount + 1 
			});
		}
	} while (cursor);

	if (allPages.length === 0) {
		logger.info({ event: 'no_changes' });
		return { short_db_ID: config.short_db_ID, notionDatabaseId: config.notionDatabaseId, processed: 0, skipped: 0, status: 'no-changes' };
	}

	logger.info({ 
		event: 'pages_fetched', 
		page_count: allPages.length, 
		fetch_requests: pageCount 
	});

	// Batch query: Get all existing posts and build lookup maps
	const allPostsResult = await gqlAdminClient.request<AllPostsResponse>(GET_ALL_POSTS_FOR_DATABASE_QUERY, {
		short_db_ID: config.short_db_ID
	});
	const { byPageId: existingPostsByPageId, slugs: usedSlugs } = buildPostLookups(allPostsResult.posts);

	// Process all pages
	let processed = 0,
		skipped = 0;
	for (const page of allPages) {
		try {
			await processPageBatch(page, config, existingPostsByPageId, usedSlugs);
			metrics.recordSuccess();
			processed++;
		} catch (err: any) {
			metrics.recordError(page.id, err?.message || 'Unknown error');
			logger.error({ 
				event: 'page_processing_failed', 
				pageId: page.id,
				error: err?.message,
				stack: err?.stack
			});
			skipped++;
		}
	}

	// Log final metrics
	metrics.logSummary(logger);

	return { short_db_ID: config.short_db_ID, notionDatabaseId: config.notionDatabaseId, processed, skipped, status: 'ok' };
}

/**
 * Filter databases based on provided ID
 */
function getTargetDatabases(
	databases: HydratedDatabaseConfig[],
	filterId: string | null | undefined
): HydratedDatabaseConfig[] {

	if (!filterId) return databases;
	return databases.filter((db) => db.short_db_ID === filterId || db.notionDatabaseId === filterId);
}
