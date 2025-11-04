import { GraphQLClient, gql } from 'graphql-request';
import type { Post } from '../../types.js';
import { createLogger } from '../../utils/logger.js';

/**
 * Data transfer object for inserting/updating posts
 */
export interface PostData {
	page_id: string;           // Notion page UUID (primary key)
	datasource_id: string;      // Notion database ID
	title: string;
	slug: string;
	content: string;
	publish_at: string | null;
	updated_at: string;         // ISO 8601 timestamp (from Notion or manual)
	tags?: any[] | null;       // JSONB array
	authors?: any[] | null;    // JSONB array
	meta?: Record<string, any> | null; // JSONB object
}

/**
 * PostRepository - Database operations via GraphQL
 * 
 * Responsibilities:
 * - CRUD operations for posts table
 * - Slug uniqueness checks
 * - Batch operations (delete all for source)
 * 
 * Does NOT contain business logic - just database queries.
 */
export class PostRepository {
	private logger = createLogger({ operation: 'post_repository' });

	constructor(private gqlClient: GraphQLClient) {}

	/**
	 * Get post by Notion page ID and datasource ID
	 */
	async getByNotionPageId(pageId: string, datasourceId: string): Promise<Post | null> {
		this.logger.debug({ 
			event: 'get_by_notion_page_id', 
			pageId, 
			datasourceId 
		});

		const query = gql`
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

		const result = await this.gqlClient.request<{ pages: Post[] }>(query, {
			datasourceId,
			pageId
		});

		return result.pages[0] || null;
	}

	/**
	 * Get post by slug and datasource ID
	 */
	async getBySlug(slug: string, datasourceId: string): Promise<Post | null> {
		this.logger.debug({ 
			event: 'get_by_slug', 
			slug, 
			datasourceId 
		});

		const query = gql`
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

		const result = await this.gqlClient.request<{ pages: Post[] }>(query, {
			datasourceId,
			slug
		});

		return result.pages[0] || null;
	}

	/**
	 * Get all posts for a datasource
	 */
	async getAllForSource(datasourceId: string): Promise<Post[]> {
		this.logger.debug({ 
			event: 'get_all_for_source', 
			datasourceId 
		});

		const query = gql`
			query GetAllForSource($datasourceId: String!) {
				pages(where: { datasource_id: { _eq: $datasourceId } }) {
					page_id
					slug
					title
				}
			}
		`;

		const result = await this.gqlClient.request<{ pages: Post[] }>(query, {
			datasourceId
		});

		return result.pages;
	}

	/**
	 * Upsert (insert or update) a post
	 */
	async upsert(post: PostData): Promise<void> {
		this.logger.debug({ 
			event: 'upsert_post', 
			datasourceId: post.datasource_id,
			slug: post.slug,
			pageId: post.page_id
		});

		const mutation = gql`
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

		await this.gqlClient.request(mutation, { page: post });
		
		this.logger.info({ 
			event: 'post_upserted', 
			datasourceId: post.datasource_id,
			slug: post.slug 
		});
	}

	/**
	 * Delete all posts for a datasource
	 */
	async deleteForSource(datasourceId: string): Promise<number> {
		this.logger.info({ 
			event: 'delete_for_source', 
			datasourceId 
		});

		const mutation = gql`
			mutation DeleteForSource($datasourceId: String!) {
				delete_pages(where: { datasource_id: { _eq: $datasourceId } }) {
					affected_rows
				}
			}
		`;

		const result = await this.gqlClient.request<{ delete_pages: { affected_rows: number } }>(
			mutation, 
			{ datasourceId }
		);

		this.logger.info({ 
			event: 'deleted_posts', 
			datasourceId,
			count: result.delete_pages.affected_rows 
		});

		return result.delete_pages.affected_rows;
	}
}