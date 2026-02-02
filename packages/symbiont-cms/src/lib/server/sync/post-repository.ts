import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../database.types.js';
import type { Post } from '../../types.js';
import { createLogger } from '../utils/logger.js';

/**
 * Data transfer object for inserting/updating posts
 */
export interface PostData {
	page_id: string;           // Notion page UUID (primary key)
	datasource_id: string;      // Notion database ID
	datasource_alias: string; // Non-secret datasource alias for public queries
	title: string;
	slug: string | null;        // Nullable - only generated for public posts
	content: string;
	publish_at: string | null;
	updated_at: string;         // ISO 8601 timestamp (from Notion or manual)
	tags?: any[] | null;       // JSONB array
	authors?: any[] | null;    // JSONB array
	meta?: Record<string, any> | null; // JSONB object (includes cover: string in meta.cover)
}

/**
 * PostRepository - Database operations via Supabase
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
	private supabase: SupabaseClient<Database>;

	constructor(supabaseUrl: string, supabaseServiceRoleKey: string) {
		// Create admin Supabase client with service role key for mutations
		this.supabase = createClient<Database>(supabaseUrl, supabaseServiceRoleKey, {
			auth: {
				autoRefreshToken: false,
				persistSession: false,
				detectSessionInUrl: false
			}
		});
	}

	/**
	 * Get post by Notion page ID
	 * Note: Page IDs are globally unique across Notion, no need to filter by datasource
	 */
	async getByNotionPageId(pageId: string): Promise<Post | null> {
		this.logger.debug({ 
			event: 'get_by_notion_page_id', 
			pageId
		});

		const { data, error } = await this.supabase
			.from('pages')
			.select('*')
			.eq('page_id', pageId)
			.maybeSingle();

		if (error) {
			this.logger.error({ event: 'query_error', error: error.message });
			throw new Error(`Failed to get post by page ID: ${error.message}`);
		}

		return data as Post | null;
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

		const { data, error } = await this.supabase
			.from('pages')
			.select('page_id, slug')
			.eq('datasource_id', datasourceId)
			.eq('slug', slug)
			.maybeSingle();

		if (error) {
			this.logger.error({ event: 'query_error', error: error.message });
			throw new Error(`Failed to get post by slug: ${error.message}`);
		}

		return data as Post | null;
	}

	/**
	 * Get all posts for a datasource
	 */
	async getAllForSource(datasourceId: string): Promise<Post[]> {
		this.logger.debug({ 
			event: 'get_all_for_source', 
			datasourceId 
		});

		const { data, error } = await this.supabase
			.from('pages')
			.select('page_id, slug, title')
			.eq('datasource_id', datasourceId);

		if (error) {
			this.logger.error({ event: 'query_error', error: error.message });
			throw new Error(`Failed to get posts for source: ${error.message}`);
		}

		return data as Post[];
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

		const { error } = await this.supabase
			.from('pages')
			.upsert(post, {
				onConflict: 'page_id'
			});

		if (error) {
			this.logger.error({ 
				event: 'upsert_error', 
				error: error.message,
				post 
			});
			throw new Error(`Failed to upsert post: ${error.message}`);
		}
		
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

		const { count, error } = await this.supabase
			.from('pages')
			.delete({ count: 'exact' })
			.eq('datasource_id', datasourceId);

		if (error) {
			this.logger.error({ event: 'delete_error', error: error.message });
			throw new Error(`Failed to delete posts: ${error.message}`);
		}

		const affectedRows = count ?? 0;

		this.logger.info({ 
			event: 'deleted_posts', 
			datasourceId,
			count: affectedRows 
		});

		return affectedRows;
	}
}