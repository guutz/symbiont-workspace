import { PUBLIC_NHOST_GRAPHQL_URL } from '$env/static/public';
import { error } from '@sveltejs/kit';
import type { GraphQLClient } from 'graphql-request';
import { createSymbiontGraphQLClient, getPostBySlug } from '../blog-client';
import type { Post } from '../types';

type BlogLoadEvent = {
	params: { slug: string };
	fetch: typeof fetch;
};

export interface BlogLoadOptions<Event extends BlogLoadEvent = BlogLoadEvent> {
	graphqlEndpoint?: string;
	createClient?: (endpoint: string, event: Event) => GraphQLClient;
	fetchPost?: (client: GraphQLClient, slug: string, event: Event) => Promise<Post | null>;
}

const defaultCreateClient = (endpoint: string, event: BlogLoadEvent) =>
	createSymbiontGraphQLClient(endpoint, { fetch: event.fetch });

const defaultFetchPost = (client: GraphQLClient, slug: string) => getPostBySlug(client, slug);

export type BlogServerLoad<Event extends BlogLoadEvent = BlogLoadEvent> = (
	event: Event
) => Promise<{ post: Post }>;

export function createBlogLoad<Event extends BlogLoadEvent = BlogLoadEvent>(
	options: BlogLoadOptions<Event> = {}
): BlogServerLoad<Event> {
	const graphqlEndpoint = options.graphqlEndpoint ?? PUBLIC_NHOST_GRAPHQL_URL;
	const createClient = options.createClient ?? ((endpoint: string, event: Event) => defaultCreateClient(endpoint, event));
	const fetchPost = options.fetchPost ?? ((client: GraphQLClient, slug: string, event: Event) => defaultFetchPost(client, slug));

	return async (event) => {
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

export const load = createBlogLoad();
