import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../../database.types.js';
import type { WebsitePage } from '../../types.js';
import { createLogger } from '../utils/logger.js';

/**
 * Data transfer object for inserting/updating pages in the database
 */
export interface DatabasePage {
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
 * DatabasePageCRUD - Database CRUD operations via Supabase Postgres
 * 
 * Responsibilities:
 * - CRUD operations for pages table
 * - Slug uniqueness checks
 * - Batch operations (delete all for source)
 * 
 * Does NOT contain business logic - just database queries.
 */
export class DatabasePageCRUD {
	private logger = createLogger({ operation: 'database_page_crud' });
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
	 * Get page by Notion page ID
	 * Note: Page IDs are globally unique across Notion, no need to filter by datasource
	 */
	async getByNotionPageId(pageId: string): Promise<WebsitePage | null> {
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
			throw new Error(`Failed to get page by page ID: ${error.message}`);
		}

		return data as WebsitePage | null;
	}

	/**
	 * Get page by slug and datasource ID
	 */
	async getBySlug(slug: string, datasourceId: string): Promise<WebsitePage | null> {
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
			throw new Error(`Failed to get page by slug: ${error.message}`);
		}

		return data as WebsitePage | null;
	}

	/**
	 * Get all pages for a datasource
	 */
	async getAllForSource(datasourceId: string): Promise<WebsitePage[]> {
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
			throw new Error(`Failed to get pages for source: ${error.message}`);
		}

		return data as WebsitePage[];
	}

	/**
	 * Upsert (insert or update) a page
	 */
	async upsert(page: DatabasePage): Promise<void> {
		this.logger.debug({ 
			event: 'upsert_page', 
			datasourceId: page.datasource_id,
			slug: page.slug,
			pageId: page.page_id
		});

		const { error } = await this.supabase
			.from('pages')
			.upsert(page, {
				onConflict: 'page_id'
			});

		if (error) {
			this.logger.error({ 
				event: 'upsert_error', 
				error: error.message,
				page 
			});
			throw new Error(`Failed to upsert page: ${error.message}`);
		}
		
		this.logger.info({ 
			event: 'page_upserted', 
			datasourceId: page.datasource_id,
			slug: page.slug 
		});
	}

	/**
	 * Delete all pages for a datasource
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
			throw new Error(`Failed to delete pages: ${error.message}`);
		}

		const affectedRows = count ?? 0;

		this.logger.info({ 
			event: 'deleted_pages', 
			datasourceId,
			count: affectedRows 
		});

		return affectedRows;
	}
}