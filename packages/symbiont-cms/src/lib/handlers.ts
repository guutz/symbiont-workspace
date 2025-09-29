import { Client } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client';
import { json, type RequestEvent } from '@sveltejs/kit';
import { GraphQLClient, gql } from 'graphql-request';
import slugify from 'slugify';
import { loadConfig } from './config-loader.js';
import { requireEnvVar } from './env.js';
import type { HydratedDatabaseConfig, SyncSummary } from './types.js';

// --- SETUP: Load Environment Variables & Initialize Clients ---
const NOTION_API_KEY = requireEnvVar('NOTION_API_KEY', 'Set NOTION_API_KEY in your environment.');
const NHOST_GRAPHQL_URL = requireEnvVar('NHOST_GRAPHQL_URL', 'Set NHOST_GRAPHQL_URL to your Nhost endpoint.');
const NHOST_ADMIN_SECRET = requireEnvVar('NHOST_ADMIN_SECRET', 'Set NHOST_ADMIN_SECRET for admin access to Nhost.');
const CRON_SECRET = requireEnvVar('CRON_SECRET', 'Set CRON_SECRET for authenticating scheduled jobs.');

const notion = new Client({ auth: NOTION_API_KEY });
const gqlClient = new GraphQLClient(NHOST_GRAPHQL_URL, {
	headers: { 'x-hasura-admin-secret': NHOST_ADMIN_SECRET }
});

// --- GraphQL Mutations ---
const UPSERT_POST_MUTATION = gql`
	mutation UpsertPost($post: posts_insert_input!) {
		insert_posts_one(
			object: $post,
			on_conflict: { constraint: posts_notion_page_id_key, update_columns: [title, content, slug, publish_at, tags, updated_at] }
		) {
			id
		}
	}
`;

// --- CORE SYNC LOGIC ---

/**
 * The main engine for the Notion sync process. This function is framework-agnostic.
 * @param options - Options to control the sync, like filtering by database or setting a lookback window.
 */
export async function syncFromNotion(options: { databaseId?: string | null; since?: string | null; syncAll?: boolean } = {}) {
	console.log('[symbiont] Starting Notion sync process...');
	const config = await loadConfig();

	const sinceIso = options.syncAll ? null : (options.since || new Date(Date.now() - 5 * 60 * 1000).toISOString());
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
			summaries.push(await syncDatabase(dbConfig, sinceIso));
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
 * A pre-built SvelteKit request handler that wraps the core sync logic.
 * It provides a secure API endpoint for Vercel's Cron Job.
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
			syncAll: event.url.searchParams.get('syncAll') === 'true'
		});

		const hasError = result.summaries.some((s) => s.status === 'error');
		return json(result, { status: hasError ? 500 : 200 });
	} catch (error: any) {
		console.error('[symbiont] Critical error during Notion sync:', error);
		return json({ error: error.message ?? 'Unknown error' }, { status: 500 });
	}
}


// --- Helper Functions ---

function getTargetDatabases(
	databases: HydratedDatabaseConfig[],
	filterId: string | null | undefined
): HydratedDatabaseConfig[] {
	if (!filterId) return databases;
	return databases.filter((db) => db.id === filterId || db.databaseId === filterId);
}

async function syncDatabase(config: HydratedDatabaseConfig, sinceIso: string | null): Promise<SyncSummary> {
	const queryOptions: any = {
		data_source_id: config.databaseId
	};

	// Only add filter if we have a since date (for incremental sync)
	if (sinceIso) {
		queryOptions.filter = {
			timestamp: 'last_edited_time',
			last_edited_time: {
				after: sinceIso
			}
		};
	}

	const response = await notion.dataSources.query(queryOptions);

	if (response.results.length === 0) {
		console.log(`[symbiont] No changes for database '${config.id}'.`);
		return { id: config.id, databaseId: config.databaseId, processed: 0, skipped: 0, status: 'no-changes' };
	}

	console.log(`[symbiont] Processing ${response.results.length} page(s) for '${config.id}'.`);

	let processed = 0;
	let skipped = 0;

	for (const page of response.results) {
		if (!('properties' in page)) {
			skipped += 1;
			continue;
		}

		const pageResponse = page as PageObjectResponse;
		const title = (pageResponse.properties.Name as any).title?.[0]?.plain_text ?? 'Untitled';
		
		const postData = {
			notion_page_id: pageResponse.id,
			title: title,
			tags: ((pageResponse.properties.Tags as any)?.multi_select ?? []).map((tag: { name: string }) => tag.name),
			updated_at: pageResponse.last_edited_time,
			publish_at: config.isPublicRule(pageResponse) ? ((pageResponse.properties["Publish Date"] as any)?.date?.start ?? new Date().toISOString()) : null,
			slug: slugify.default ? slugify.default(title, { lower: true, strict: true }) : (slugify as any)(title, { lower: true, strict: true }),
			content: 'Content sync is a work in progress...' // TODO: Fetch and convert page content
		};

		await gqlClient.request(UPSERT_POST_MUTATION, { post: postData });
		processed += 1;
	}

	return { id: config.id, databaseId: config.databaseId, processed, skipped, status: 'ok' };
}

