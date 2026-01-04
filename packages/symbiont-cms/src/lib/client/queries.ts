/**
 * Public GraphQL query wrappers for Symbiont CMS (client-safe)
 * 
 * These functions can be used in both client and server contexts.
 * They load public config (graphqlEndpoint) and provide read-only queries.
 * 
 * For admin mutations (upsert, delete), see 'symbiont-cms/server' exports.
 */

import { GraphQLClient } from 'graphql-request';
import { loadConfig } from './load-config.js';
import type { Post } from '../types.js';

// Table name is centralized here; change only after aligning Hasura metadata/migrations
const PAGES_TABLE = 'pages';

// --- GraphQL Query Builders (pure) ---

function buildGetPostBySlug(): string {
	return `
		query GetPostBySlug($slug: String!, $alias: String!) {
			${PAGES_TABLE}(
				where: {
					_and: [
						{ slug: { _eq: $slug } },
						{ datasource_alias: { _eq: $alias } }
					]
				}
				limit: 1
			) {
				page_id
				datasource_alias
				title
				slug
				content
				publish_at
				updated_at
				tags
				authors
				meta
			}
		}
	`;
}

function buildGetAllPosts(): string {
	return `
		query GetAllPosts($limit: Int, $offset: Int, $alias: String!) {
			${PAGES_TABLE}(
				where: { datasource_alias: { _eq: $alias } }
				order_by: { publish_at: desc }
				limit: $limit
				offset: $offset
			) {
				page_id
				datasource_alias
				title
				slug
				content
				publish_at
				updated_at
				tags
				authors
				meta
			}
		}
	`;
}

// --- Query Options ---

export interface GetPostOptions {
	/** Custom fetch function for SSR context */
	fetch?: typeof globalThis.fetch;
	/** Database alias to query */
	alias?: string;
}

export interface GetAllPostsOptions {
	/** Custom fetch function for SSR context */
	fetch?: typeof globalThis.fetch;
	/** Maximum number of posts to return */
	limit?: number;
	/** Number of posts to skip */
	offset?: number;
	/** Database alias to query */
	alias?: string;
}

// --- Helper: Create Client ---

/**
 * Internal helper to create a GraphQL client with public config
 */
async function createClient(customFetch?: typeof globalThis.fetch): Promise<{
	client: GraphQLClient;
	config: Awaited<ReturnType<typeof loadConfig>>;
}> {
	const config = await loadConfig();
	const client = new GraphQLClient(config.graphqlEndpoint, {
		fetch: customFetch
	});

	return { client, config };
}

/** Execute a public GraphQL query against the pages table */
async function runPublicPagesQuery<T>(
	queryBuilder: () => string,
	variables: Record<string, any>,
	options: { fetch?: typeof globalThis.fetch; alias?: string } = {}
): Promise<T> {
	const { client, config } = await createClient(options.fetch);
	const sourceAlias = resolveAlias(config, options.alias);

	const query = queryBuilder();
	return client.request<T>(query, { ...variables, alias: sourceAlias });
}

function resolveAlias(config: Awaited<ReturnType<typeof loadConfig>>, alias?: string): string {
	const sourceAlias = alias ?? config.aliases[0];

	if (!sourceAlias) {
		throw new Error('No database alias configured or provided');
	}

	return sourceAlias;
}

// --- Public Query Functions ---

/**
 * Fetch a single post by slug
 * 
 * Automatically loads public config and creates a GraphQL client.
 * Pass `fetch` from SvelteKit load context for SSR.
 * 
 * @param slug - The post slug to fetch
 * @param options - Optional fetch function for SSR
 * @returns The post if found, null otherwise
 * 
 * @example
 * // In +page.server.ts
 * import { getPostBySlug } from 'symbiont-cms';
 * 
 * export const load = async ({ params, fetch }) => {
 *   const post = await getPostBySlug(params.slug, { fetch });
 *   if (!post) throw error(404);
 *   return { post };
 * };
 */
export async function getPostBySlug(
	slug: string,
	options: GetPostOptions = {}
): Promise<Post | null> {
	const result = await runPublicPagesQuery<{ pages: Post[] }>(
		buildGetPostBySlug,
		{ slug },
		{ fetch: options.fetch, alias: options.alias }
	);
	return result.pages[0] ?? null;
}

/**
 * Fetch all posts for a database
 * 
 * Automatically loads public config and creates a GraphQL client.
 * Pass `fetch` from SvelteKit load context for SSR.
 * 
 * @param options - Fetch function, pagination, and database selection
 * @returns Array of posts
 * 
 * @example
 * // In +page.server.ts
 * import { getAllPosts } from 'symbiont-cms';
 * 
 * export const load = async ({ fetch }) => {
 *   const posts = await getAllPosts({ fetch, limit: 10, alias: 'blog' });
 *   return { posts };
 * };
 */
export async function getAllPosts(
	options: GetAllPostsOptions = {}
): Promise<Post[]> {
	const result = await runPublicPagesQuery<{ pages: Post[] }>(
		buildGetAllPosts,
		{
			limit: options.limit ?? 100,
			offset: options.offset ?? 0
		},
		{ fetch: options.fetch, alias: options.alias }
	);
	
	return result.pages;
}
