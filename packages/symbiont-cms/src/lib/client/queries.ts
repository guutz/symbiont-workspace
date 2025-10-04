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
	query GetAllPosts($limit: Int, $offset: Int, $source_id: String) {
		posts(
			where: { source_id: { _eq: $source_id } }
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
	options?: { limit?: number; offset?: number; source_id?: string }
) {
	const { posts } = await client.request<GetAllPostsResult>(GET_ALL_POSTS, {
		limit: options?.limit,
		offset: options?.offset,
		source_id: options?.source_id
	});
	return posts;
}
