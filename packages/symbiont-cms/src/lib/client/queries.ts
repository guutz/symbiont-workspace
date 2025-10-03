import { GraphQLClient, gql } from 'graphql-request';
import type { Post } from './types.ts';

export const GET_POST_BY_SLUG = gql`
	query GetPostBySlug($slug: String!) {
		posts(where: { slug: { _eq: $slug } }) {
			id
			title
			content
			publish_at
		}
	}
`;

export interface GetPostBySlugResult {
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
