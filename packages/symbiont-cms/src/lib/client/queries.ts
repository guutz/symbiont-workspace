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

// --- GraphQL Query Generators (hardcoded 'pages' table) ---

function getPostBySlugQuery(): string {
	return `
		query GetPostBySlug($slug: String!) {
			pages(where: { slug: { _eq: $slug } }) {
				page_id
				datasource_id
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

function getAllPostsQuery(): string {
	return `
		query GetAllPosts($limit: Int, $offset: Int, $alias: String!) {
			pages(
				where: { datasource_id: { _eq: $alias } }
				order_by: { publish_at: desc }
				limit: $limit
				offset: $offset
			) {
				page_id
				datasource_id
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

// --- Response Types ---

interface GetPostBySlugResult {
	[key: string]: Post[];
}

interface GetAllPostsResult {
	[key: string]: Post[];
}

// --- Query Options ---

export interface GetPostOptions {
	/** Custom fetch function for SSR context */
	fetch?: typeof globalThis.fetch;
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
async function createClient(customFetch?: typeof globalThis.fetch): Promise<GraphQLClient> {
	const config = await loadConfig();
	return new GraphQLClient(config.graphqlEndpoint, {
		fetch: customFetch
	});
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
	const client = await createClient(options.fetch);
	const query = getPostBySlugQuery();
	const result = await client.request<{ pages: Post[] }>(query, { slug });
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
	const config = await loadConfig();
	const client = await createClient(options.fetch);
	
	// Use alias if provided, otherwise use first configured alias
	const sourceAlias = options.alias ?? config.aliases[0];
	
	if (!sourceAlias) {
		throw new Error('No database alias configured or provided');
	}
	
	const query = getAllPostsQuery();
	const result = await client.request<{ pages: Post[] }>(query, {
		limit: options.limit ?? 100,
		offset: options.offset ?? 0,
		alias: sourceAlias
	});
	
	return result.pages;
}
