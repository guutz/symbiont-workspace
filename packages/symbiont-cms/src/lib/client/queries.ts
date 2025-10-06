import { GraphQLClient, gql } from 'graphql-request';
import type { Post } from '../types.js';

export const GET_POST_BY_SLUG = gql`
	query GetPostBySlug($slug: String!) {
		posts(where: { slug: { _eq: $slug } }) {
			id
			title
			content
			publish_at
			tags
		}
	}
`;

export const GET_ALL_POSTS = gql`
	query GetAllPosts($limit: Int, $offset: Int, $short_db_ID: String!) {
		posts(
			where: { source_id: { _eq: $short_db_ID } }
			order_by: { publish_at: desc }
			limit: $limit
			offset: $offset
		) {
			id
			title
			slug
			content
			publish_at
			tags
			updated_at
		}
	}
`;

export interface GetPostBySlugResult {
	posts: Post[];
}

export interface GetAllPostsResult {
	posts: Post[];
}

export interface SymbiontGraphQLClientOptions {
	headers?: Record<string, string>;
	fetch?: typeof fetch;
}

export function createSymbiontGraphQLClient(endpoint: string, options: SymbiontGraphQLClientOptions = {}) {
	const { headers, fetch: customFetch } = options;
	return new GraphQLClient(endpoint, { headers, fetch: customFetch });
}

export async function getPostBySlug(client: GraphQLClient, slug: string) {
	const { posts } = await client.request<GetPostBySlugResult>(GET_POST_BY_SLUG, { slug });
	return posts[0] ?? null;
}

export async function getAllPosts(
	client: GraphQLClient,
	options: { limit?: number; offset?: number; short_db_ID: string }
) {
	const { posts } = await client.request<GetAllPostsResult>(GET_ALL_POSTS, {
		limit: options.limit,
		offset: options.offset,
		short_db_ID: options.short_db_ID
	});
	return posts;
}

/**
 * High-level helper that loads the Symbiont config and fetches posts from the primary database.
 * This abstracts away the need to manually load config and extract source_id.
 * 
 * @param graphqlEndpoint - The GraphQL API endpoint
 * @param options - Optional fetch function for SSR and limit/offset for pagination
 * @returns Array of posts from the primary configured database
 */
export async function getPostsFromPrimarySource(
	graphqlEndpoint: string,
	options?: { fetch?: typeof fetch; limit?: number; offset?: number }
) {
	// Dynamic import to avoid bundling server code on client
	const { loadConfig } = await import('../server/config-loader.server.js');
	const config = await loadConfig();
	
	const primaryDatabase = config.databases[0];
	if (!primaryDatabase) {
		throw new Error('No database configured in symbiont.config.ts');
	}
	
	const client = createSymbiontGraphQLClient(graphqlEndpoint, { fetch: options?.fetch });
	return getAllPosts(client, {
		limit: options?.limit,
		offset: options?.offset,
		short_db_ID: primaryDatabase.short_db_ID
	});
}

/**
 * High-level helper that loads config and fetches posts from ALL configured databases.
 * Useful for generating complete sitemaps, feeds, etc.
 * 
 * @param graphqlEndpoint - The GraphQL API endpoint
 * @param options - Optional fetch function for SSR and limit/offset for pagination
 * @returns Array of posts from all configured databases
 */
export async function getPostsFromAllSources(
	graphqlEndpoint: string,
	options?: { fetch?: typeof fetch; limit?: number; offset?: number }
) {
	const { loadConfig } = await import('../server/config-loader.server.js');
	const config = await loadConfig();
	
	if (config.databases.length === 0) {
		throw new Error('No databases configured in symbiont.config.ts');
	}
	
	const client = createSymbiontGraphQLClient(graphqlEndpoint, { fetch: options?.fetch });
	
	// Fetch from all sources in parallel
	const allPostsArrays = await Promise.all(
		config.databases.map(db => 
			getAllPosts(client, {
				limit: options?.limit,
				offset: options?.offset,
				short_db_ID: db.short_db_ID
			})
		)
	);
	
	// Flatten and sort by publish date
	return allPostsArrays
		.flat()
		.sort((a, b) => {
			const dateA = a.publish_at ? new Date(a.publish_at).getTime() : 0;
			const dateB = b.publish_at ? new Date(b.publish_at).getTime() : 0;
			return dateB - dateA; // Most recent first
		});
}
