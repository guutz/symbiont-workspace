import { GraphQLClient, gql } from 'graphql-request';
import { requireEnvVar, requirePublicEnvVar } from '../utils/env.js';

// Initialize GraphQL client
const NHOST_GRAPHQL_URL = requirePublicEnvVar('PUBLIC_NHOST_GRAPHQL_URL', 'Set PUBLIC_NHOST_GRAPHQL_URL to your Nhost endpoint.');
const NHOST_ADMIN_SECRET = requireEnvVar('NHOST_ADMIN_SECRET', 'Set NHOST_ADMIN_SECRET for admin access to Nhost.');

export const gqlClient = new GraphQLClient(NHOST_GRAPHQL_URL, {
	headers: { 'x-hasura-admin-secret': NHOST_ADMIN_SECRET }
});

// --- GraphQL Operations ---

export const UPSERT_POST_MUTATION = gql`
	mutation UpsertPost($post: posts_insert_input!) {
		insert_posts_one(
			object: $post
			on_conflict: {
				constraint: posts_source_id_notion_page_id_key
				update_columns: [title, content, slug, publish_at, tags, updated_at, notion_short_id]
			}
		) {
			id
		}
	}
`;

export const CHECK_SLUG_QUERY = gql`
	query CheckSlug($short_db_ID: String!, $slug: String!) {
		posts(where: { source_id: { _eq: $short_db_ID }, slug: { _eq: $slug } }) {
			id
			notion_page_id
		}
	}
`;

export const GET_EXISTING_POST_QUERY = gql`
	query GetExistingPost($short_db_ID: String!, $notion_page_id: String!) {
		posts(where: { source_id: { _eq: $short_db_ID }, notion_page_id: { _eq: $notion_page_id } }) {
			id
			slug
		}
	}
`;

export const GET_ALL_POSTS_FOR_DATABASE_QUERY = gql`
	query GetAllPostsForDatabase($short_db_ID: String!) {
		posts(where: { source_id: { _eq: $short_db_ID } }) {
			id
			notion_page_id
			slug
		}
	}
`;

export const DELETE_POSTS_BY_SOURCE_MUTATION = gql`
	mutation DeletePostsBySource($short_db_ID: String!) {
		delete_posts(where: { source_id: { _eq: $short_db_ID } }) {
			affected_rows
		}
	}
`;

// --- Response Types ---

export interface SlugCheckResponse {
	posts: Array<{
		id: string;
		notion_page_id: string;
	}>;
}

export interface ExistingPostResponse {
	posts: Array<{
		id: string;
		slug: string;
	}>;
}

export interface AllPostsResponse {
	posts: Array<{
		id: string;
		notion_page_id: string;
		slug: string;
	}>;
}

export interface DeletePostsResponse {
	delete_posts: {
		affected_rows: number;
	};
}
