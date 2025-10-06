import { error } from '@sveltejs/kit';
import type { GraphQLClient } from 'graphql-request';
import { createSymbiontGraphQLClient, getPostBySlug } from '../client/queries.js';
import { loadConfig } from './load-config.js';
import type { Post } from '../types.js';

type PostLoadEvent = {
	params: { slug: string };
	fetch: typeof fetch;
};

export interface PostLoadOptions<Event extends PostLoadEvent = PostLoadEvent> {
	graphqlEndpoint?: string;
	createClient?: (endpoint: string, event: Event) => GraphQLClient;
	fetchPost?: (client: GraphQLClient, slug: string, event: Event) => Promise<Post | null>;
}

const defaultCreateClient = (endpoint: string, event: PostLoadEvent) =>
	createSymbiontGraphQLClient(endpoint, { fetch: event.fetch });

const defaultFetchPost = (client: GraphQLClient, slug: string) => getPostBySlug(client, slug);

export type PostServerLoad<Event extends PostLoadEvent = PostLoadEvent> = (
	event: Event
) => Promise<{ post: Post }>;

/**
 * Creates a SvelteKit server load function for fetching a single post by slug.
 * Automatically loads the GraphQL endpoint from symbiont.config.ts.
 * 
 * @param options - Optional overrides for endpoint, client, or fetch logic
 * @returns A SvelteKit load function that fetches and returns a post
 * 
 * @example
 * // In [slug]/+page.server.ts
 * export const load = createPostLoad();
 * 
 * @example
 * // With custom options
 * export const load = createPostLoad({
 *   fetchPost: async (client, slug) => {
 *     // Custom fetching logic
 *     return await customGetPost(slug);
 *   }
 * });
 */
export function createPostLoad<Event extends PostLoadEvent = PostLoadEvent>(
	options: PostLoadOptions<Event> = {}
): PostServerLoad<Event> {
	
	return async (event) => {
		// Load config to get graphqlEndpoint if not provided
		const config = await loadConfig();
		const graphqlEndpoint = options.graphqlEndpoint ?? config.graphqlEndpoint;
		const createClient = options.createClient ?? ((endpoint: string, event: Event) => defaultCreateClient(endpoint, event));
		const fetchPost = options.fetchPost ?? ((client: GraphQLClient, slug: string, event: Event) => defaultFetchPost(client, slug));
		
		const client = createClient(graphqlEndpoint, event);
		try {
			const post = await fetchPost(client, event.params.slug, event);

			if (!post) {
				throw error(404, 'Post not found');
			}

			return { post };
		} catch (err) {
			console.error('Error fetching post:', err);
			throw error(500, 'Failed to load post');
		}
	};
}

/**
 * Default export for convenience.
 * 
 * @example
 * // In [slug]/+page.server.ts
 * export { load } from 'symbiont-cms/server';
 */
export const load = createPostLoad();
