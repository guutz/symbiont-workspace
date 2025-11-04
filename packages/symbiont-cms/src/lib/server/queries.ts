/**
 * Server-side GraphQL query wrappers for Symbiont CMS
 * 
 * These functions handle config loading and client creation internally,
 * providing a clean API for fetching posts in SvelteKit server contexts.
 * 
 * Unlike client/queries.ts (public, SSR-safe), these are server-only and
 * can access server config directly.
 */

import { GraphQLClient, gql } from 'graphql-request';
import { loadConfig } from './load-config.js';
import type { Post } from '../types.js';

// --- GraphQL Queries ---

const GET_POST_BY_SLUG = gql`
	query GetPostBySlug($slug: String!) {
		posts(where: { slug: { _eq: $slug } }) {
			sql_id: id
			title
			slug
			content
			publish_at
			updated_at
			tags
			layout_config
			authors
		}
	}
`;

const GET_ALL_POSTS = gql`
	query GetAllPosts($limit: Int, $offset: Int, $dbNickname: String!) {
		posts(
			where: { source_id: { _eq: $dbNickname } }
			order_by: { publish_at: desc }
			limit: $limit
			offset: $offset
		) {
			sql_id: id
			title
			slug
			content
			publish_at
			updated_at
			tags
			layout_config
			authors
		}
	}
`;

// --- Response Types ---

interface GetPostBySlugResult {
	posts: Post[];
}

interface GetAllPostsResult {
	posts: Post[];
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
	/** Override the default dbNickname from config */
	shortDbId?: string;
}

// --- Helper: Create Client ---

/**
 * Internal helper to create a GraphQL client with config
 */
async function createClient(customFetch?: typeof globalThis.fetch): Promise<GraphQLClient> {
	const config = await loadConfig();
	return new GraphQLClient(config.graphqlEndpoint, {
		fetch: customFetch
	});
}

// --- Public Query Functions ---

/**
 * Fetch a single post by slug (server-side)
 * 
 * Automatically loads config and creates a GraphQL client internally.
 * Pass `fetch` from SvelteKit load context for SSR.
 * 
 * @param slug - The post slug to fetch
 * @param options - Optional fetch function for SSR
 * @returns The post if found, null otherwise
 * 
 * @example
 * // In +page.server.ts
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
	const result = await client.request<GetPostBySlugResult>(GET_POST_BY_SLUG, { slug });
	return result.posts[0] ?? null;
}

/**
 * Fetch all posts for a database (server-side)
 * 
 * Automatically loads config and creates a GraphQL client internally.
 * Pass `fetch` from SvelteKit load context for SSR.
 * 
 * @param options - Fetch function, pagination, and database selection
 * @returns Array of posts
 * 
 * @example
 * // In +page.server.ts
 * export const load = async ({ fetch }) => {
 *   const posts = await getAllPosts({ fetch, limit: 10 });
 *   return { posts };
 * };
 */
export async function getAllPosts(
	options: GetAllPostsOptions = {}
): Promise<Post[]> {
	const config = await loadConfig();
	const client = await createClient(options.fetch);
	
	// Use alias if provided, otherwise use first database's alias
	const sourceAlias = options.shortDbId ?? config.databases[0]?.alias;
	
	const result = await client.request<GetAllPostsResult>(GET_ALL_POSTS, {
		limit: options.limit ?? 100,
		offset: options.offset ?? 0,
		dbNickname: sourceAlias  // TODO: Update GraphQL query to use datasource_id instead
	});
	
	return result.posts;
}
