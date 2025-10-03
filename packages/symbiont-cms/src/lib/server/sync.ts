import type { PageObjectResponse } from '@notionhq/client';
import type { HydratedDatabaseConfig, SyncSummary } from '../types.js';
import { loadConfig } from './config-loader.server.js';
import { buildPostLookups } from '../utils/notion-helpers.js';
import { gqlClient, GET_ALL_POSTS_FOR_DATABASE_QUERY, DELETE_POSTS_BY_SOURCE_MUTATION, type AllPostsResponse, type DeletePostsResponse } from './graphql.js';
import { notion } from './notion.js';
import { processPageBatch } from './page-processor.js';

/**
 * Sync content from Notion databases to Nhost
 */
export async function syncFromNotion(
	options: { databaseId?: string | null; since?: string | null; syncAll?: boolean; wipe?: boolean } = {}
): Promise<{ since: string | null; summaries: SyncSummary[] }> {

	console.log('[symbiont] Starting Notion sync process...');
	const config = await loadConfig();

	const sinceIso = options.syncAll ? null : options.since || new Date(Date.now() - 5 * 60 * 1000).toISOString();
	const targetDatabases = getTargetDatabases(config.databases, options.databaseId);

	if (targetDatabases.length === 0) {
		const hint = options.databaseId
			? `No database matched '${options.databaseId}'. Check symbiont.config.ts for valid ids.`
			: 'No databases configured.';
		throw new Error(hint);
	}

	const summaries: SyncSummary[] = [];
	for (const dbConfig of targetDatabases) {
		try {
			summaries.push(await syncDatabase(dbConfig, sinceIso, options.wipe || false));
		} catch (err: any) {
			const message = err?.message ?? 'Unknown error';
			console.error(`[symbiont] Failed to sync database '${dbConfig.id}':`, err);
			summaries.push({
				id: dbConfig.id,
				databaseId: dbConfig.databaseId,
				processed: 0,
				skipped: 0,
				status: 'error',
				details: message
			});
		}
	}

	console.log('[symbiont] Sync process finished.');
	return { since: sinceIso, summaries };
}

/**
 * Sync a single database
 */
async function syncDatabase(config: HydratedDatabaseConfig, sinceIso: string | null, wipe: boolean): Promise<SyncSummary> {

	// Wipe existing posts if requested
	if (wipe) {
		console.log(`[symbiont] Wiping all existing posts for database '${config.id}'...`);
		const deleteResult = await gqlClient.request<DeletePostsResponse>(DELETE_POSTS_BY_SOURCE_MUTATION, {
			source_id: config.id
		});
		console.log(`[symbiont] Deleted ${deleteResult.delete_posts.affected_rows} post(s) for database '${config.id}'.`);
	}

	const queryOptions: any = { data_source_id: config.databaseId };
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
			console.log(`[symbiont] Fetching page ${pageCount + 1} of results for '${config.id}'...`);
		}
	} while (cursor);

	if (allPages.length === 0) {
		console.log(`[symbiont] No changes for database '${config.id}'.`);
		return { id: config.id, databaseId: config.databaseId, processed: 0, skipped: 0, status: 'no-changes' };
	}

	console.log(`[symbiont] Processing ${allPages.length} page(s) for '${config.id}' (fetched in ${pageCount} request${pageCount > 1 ? 's' : ''}).`);

	// Batch query: Get all existing posts and build lookup maps
	const allPostsResult = await gqlClient.request<AllPostsResponse>(GET_ALL_POSTS_FOR_DATABASE_QUERY, {
		source_id: config.id
	});
	const { byPageId: existingPostsByPageId, slugs: usedSlugs } = buildPostLookups(allPostsResult.posts);

	// Process all pages
	let processed = 0,
		skipped = 0;
	for (const page of allPages) {
		await processPageBatch(page, config, existingPostsByPageId, usedSlugs);
		processed++;
	}

	return { id: config.id, databaseId: config.databaseId, processed, skipped, status: 'ok' };
}

/**
 * Filter databases based on provided ID
 */
function getTargetDatabases(
	databases: HydratedDatabaseConfig[],
	filterId: string | null | undefined
): HydratedDatabaseConfig[] {

	if (!filterId) return databases;
	return databases.filter((db) => db.id === filterId || db.databaseId === filterId);
}
