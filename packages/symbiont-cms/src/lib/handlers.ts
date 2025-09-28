import { Client } from '@notionhq/client';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints';
import { json, type RequestEvent } from '@sveltejs/kit';
import { GraphQLClient, gql } from 'graphql-request';
import slugify from 'slugify';
import { loadConfig } from './config-loader';
import { requireEnvVar } from './env';
import type { HydratedDatabaseConfig } from './types';

// Environment variables
const NOTION_API_KEY = requireEnvVar('NOTION_SECRET', 'Set NOTION_SECRET in your deployment environment.');
const NHOST_GRAPHQL_URL = requireEnvVar('NHOST_GRAPHQL_URL', 'Set NHOST_GRAPHQL_URL to your Nhost GraphQL endpoint.');
const NHOST_ADMIN_SECRET = requireEnvVar('NHOST_ADMIN_SECRET', 'Set NHOST_ADMIN_SECRET to allow admin access to Nhost.');
const CRON_SECRET = requireEnvVar('CRON_SECRET', 'Set CRON_SECRET so scheduled jobs can be authenticated.');

// Initialize API clients
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

type SyncSummary = {
	id: string;
	databaseId: string;
	processed: number;
	skipped: number;
	status: 'ok' | 'no-changes' | 'error';
	details?: string;
};

function getTargetDatabases(
	databases: HydratedDatabaseConfig[],
	filterId: string | null
): HydratedDatabaseConfig[] {
	if (!filterId) return databases;
	return databases.filter((db) => db.id === filterId || db.databaseId === filterId);
}

function resolveSince(url: URL): string {
	const sinceParam = url.searchParams.get('since');
	if (!sinceParam) {
		return new Date(Date.now() - 5 * 60 * 1000).toISOString();
	}

	const parsed = new Date(sinceParam);
	if (Number.isNaN(parsed.getTime())) {
		throw new Error(`Invalid 'since' parameter: ${sinceParam}`);
	}

	return parsed.toISOString();
}

async function syncDatabase(config: HydratedDatabaseConfig, sinceIso: string): Promise<SyncSummary> {
	const response = await notion.dataSources.query({
		data_source_id: config.databaseId,
		filter: {
			timestamp: 'last_edited_time',
			last_edited_time: {
				after: sinceIso
			}
		}
	});

	if (response.results.length === 0) {
		console.log(`[symbiont] No changes for database '${config.id}'.`);
		return {
			id: config.id,
			databaseId: config.databaseId,
			processed: 0,
			skipped: 0,
			status: 'no-changes'
		};
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
		const tags = ((pageResponse.properties.Tags as any)?.multi_select ?? []).map(
			(tag: { name: string }) => tag.name
		);
		const updatedAt = (pageResponse.properties['Last edited time'] as any)?.last_edited_time ?? new Date().toISOString();
		const publishAt = config.isPublicRule(pageResponse) ? new Date().toISOString() : null;

		const postData = {
			notion_page_id: pageResponse.id,
			title,
			tags,
			updated_at: updatedAt,
			publish_at: publishAt,
			slug: slugify(title, { lower: true, strict: true }),
			// TODO: Fetch and convert page content to Markdown
			content: 'Content sync is a work in progress...'
		};

		await gqlClient.request(UPSERT_POST_MUTATION, { post: postData });
		processed += 1;
		console.log(`[symbiont] Synced '${title}' from database '${config.id}'.`);
	}

	return {
		id: config.id,
		databaseId: config.databaseId,
		processed,
		skipped,
		status: 'ok'
	};
}

/**
 * SvelteKit request handler that polls Notion for updates and upserts posts into Nhost.
 *
 * Query parameters:
 * - `database`: optional Symbiont database id (or raw Notion database ID) to scope the sync.
 *   When omitted, every configured database is processed.
 * - `since`: optional ISO datetime (or anything parsable by Date) to override the default
 *   5-minute lookback window when querying Notion.
 */
export async function handlePollBlogRequest(event: RequestEvent) {
	console.log('[symbiont] Starting Notion sync...');

	try {
		const providedSecret =
			event.request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ??
			event.url.searchParams.get('secret') ?? '';

		if (providedSecret !== CRON_SECRET) {
			console.warn('[symbiont] Unauthorized sync attempt blocked.');
			return json({ error: 'Unauthorized' }, { status: 401 });
		}

		const config = await loadConfig();
		const sinceIso = resolveSince(event.url);
		const requestedId = event.url.searchParams.get('database');
		const targetDatabases = getTargetDatabases(config.databases, requestedId);

		if (targetDatabases.length === 0) {
			const hint = requestedId
				? `No database matched '${requestedId}'. Check symbiont.config.ts for valid ids.`
				: 'No databases configured.';
			return json({ error: hint }, { status: 404 });
		}

	const summaries: SyncSummary[] = [];
	let hadError = false;

		for (const databaseConfig of targetDatabases) {
			try {
				summaries.push(await syncDatabase(databaseConfig, sinceIso));
			} catch (err: any) {
				hadError = true;
				const message = err?.message ?? 'Unknown error';
				console.error(`[symbiont] Failed to sync database '${databaseConfig.id}':`, err);
				summaries.push({
					id: databaseConfig.id,
					databaseId: databaseConfig.databaseId,
					processed: 0,
					skipped: 0,
					status: 'error',
					details: message
				});
			}
		}

	const status = hadError ? 500 : 200;

	return json({ since: sinceIso, summaries }, { status });
	} catch (error: any) {
		console.error('[symbiont] Error during Notion sync:', error);
		return json({ error: error.message ?? 'Unknown error' }, { status: 500 });
	}
}
