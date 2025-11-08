import { GraphQLClient } from 'graphql-request';
import type { Post } from '../../types.js';
import { createLogger } from '../utils/logger.js';
import {
	getPostByPageIdQuery,
	getPostBySlugQuery,
	getAllPostsForSourceQuery,
	getUpsertPostMutation,
	getDeletePostsForSourceMutation
} from '../queries.js';

/**
 * Data transfer object for inserting/updating posts
 */
export interface PostData {
	page_id: string;           // Notion page UUID (primary key)
	datasource_id: string;      // Notion database ID
	title: string;
	slug: string | null;        // Nullable - only generated for public posts
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

		const query = getPostByPageIdQuery();
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

		const query = getPostBySlugQuery();
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

		const query = getAllPostsForSourceQuery();
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

		const mutation = getUpsertPostMutation();
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

		const mutation = getDeletePostsForSourceMutation();
		const result = await this.gqlClient.request<{ delete_pages: { affected_rows: number } }>(
			mutation, 
			{ datasourceId }
		);

		const affectedRows = result.delete_pages.affected_rows;

		this.logger.info({ 
			event: 'deleted_posts', 
			datasourceId,
			count: affectedRows 
		});

		return affectedRows;
	}
}