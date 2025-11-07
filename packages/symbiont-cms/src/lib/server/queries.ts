/**
 * Server-side GraphQL client and query definitions
 * 
 * This module contains:
 * - gqlAdminClient: Authenticated GraphQL client for admin operations
 * - Query generator functions: Create GraphQL queries/mutations with configurable table names
 */

import { GraphQLClient } from 'graphql-request';
import { requireEnvVar } from './utils/env.server.js';
import { loadServerConfig } from './load-config.js';

// Initialize admin secret immediately (will throw if missing)
const NHOST_ADMIN_SECRET = requireEnvVar('NHOST_ADMIN_SECRET', 'Set NHOST_ADMIN_SECRET for admin access to Nhost.');

// Lazy-initialized GraphQL client
let _adminGqlClient: GraphQLClient | null = null;

/**
 * Get the Admin GraphQL client (initializes on first call with config)
 */
async function getAdminGqlClient(): Promise<GraphQLClient> {
	if (!_adminGqlClient) {
		const config = await loadServerConfig();
		_adminGqlClient = new GraphQLClient(config.graphqlEndpoint, {
			headers: { 'x-hasura-admin-secret': NHOST_ADMIN_SECRET }
		});
	}
	return _adminGqlClient;
}

/**
 * GraphQL client wrapper that auto-initializes from config on first use.
 * Lazily loads symbiont.config.js to get the graphqlEndpoint.
 * 
 * @example
 * const result = await gqlAdminClient.request<MyType>(QUERY, variables);
 */
export const gqlAdminClient = {
	async request<T = any>(document: any, variables?: any): Promise<T> {
		const client = await getAdminGqlClient();
		return client.request<T>(document, variables);
	}
};

// ============================================================================
// QUERY GENERATORS
// All queries use the 'pages' table defined in the database schema
// ============================================================================

/**
 * Generate query to get post by Notion page ID
 */
export function getPostByPageIdQuery(): string {
	return `
		query GetByPageId($datasourceId: String!, $pageId: String!) {
			pages(where: { 
				datasource_id: { _eq: $datasourceId }, 
				page_id: { _eq: $pageId } 
			}) {
				page_id
				datasource_id
				title
				slug
				content
				publish_at
				tags
				authors
				meta
				updated_at
			}
		}
	`;
}

/**
 * Generate query to get post by slug
 */
export function getPostBySlugQuery(): string {
	return `
		query GetBySlug($datasourceId: String!, $slug: String!) {
			pages(where: { 
				datasource_id: { _eq: $datasourceId }, 
				slug: { _eq: $slug } 
			}) {
				page_id
				slug
			}
		}
	`;
}

/**
 * Generate query to get all posts for a datasource
 */
export function getAllPostsForSourceQuery(): string {
	return `
		query GetAllForSource($datasourceId: String!) {
			pages(where: { datasource_id: { _eq: $datasourceId } }) {
				page_id
				slug
				title
			}
		}
	`;
}

/**
 * Generate mutation to upsert a post
 */
export function getUpsertPostMutation(): string {
	return `
		mutation UpsertPage($page: pages_insert_input!) {
			insert_pages_one(
				object: $page
				on_conflict: {
					constraint: pages_datasource_id_slug_key
					update_columns: [
						title, 
						content, 
						publish_at, 
						tags, 
						authors,
						meta,
						updated_at
					]
				}
			) {
				page_id
				slug
			}
		}
	`;
}

/**
 * Generate mutation to delete all posts for a datasource
 */
export function getDeletePostsForSourceMutation(): string {
	return `
		mutation DeleteForSource($datasourceId: String!) {
			delete_pages(where: { datasource_id: { _eq: $datasourceId } }) {
				affected_rows
			}
		}
	`;
}
