import type { PageObjectResponse } from '@notionhq/client';
import type { DatabaseBlueprint } from '../../types.js';
import { NotionClient } from '../notion/client.js';
import { DatabasePageCRUD } from '../database/page-crud.js';
import { NotionPageToDatabasePageTransformer } from '../notion/page-transformer.js';
import { createLogger } from '../utils/logger.js';

export interface SyncOptions {
	/** Only sync pages modified since this timestamp */
	since?: string | null;
	
	/** Sync all pages regardless of last_edited_time */
	syncAll?: boolean;
	
	/** Delete all existing pages before syncing */
	wipe?: boolean;
	
	/** Maximum number of pages to process (stops early if reached) */
	limit?: number;
}

export interface SyncResult {
	alias: string;
	dataSourceId: string;
	processed: number;
	skipped: number;
	failed: number;
	status: 'success' | 'error';
	details?: string;
	duration_ms?: number;
}

/**
 * NotionToDatabaseSync - High-level sync coordination
 * 
 * Responsibilities:
 * - Coordinate full database sync (query → transform → upsert)
 * - Handle pagination (Notion returns max 100 pages per query)
 * - Process individual pages (webhook handler)
 * - Collect metrics and errors
 * - Wipe operations (delete all pages for a source)
 * 
 * This is the entry point for all sync operations.
 */
export class NotionToDatabaseSync {
	private logger = createLogger({ operation: 'notion_to_database_sync' });

	constructor(
		private notionClient: NotionClient,
		private pageTransformer: NotionPageToDatabasePageTransformer,
		private pageCrud: DatabasePageCRUD,
		private config: DatabaseBlueprint
	) {}

	/**
	 * Sync entire database from Notion
	 */
	async syncDataSource(options: SyncOptions = {}): Promise<SyncResult> {
		const startTime = Date.now();
		
		this.logger.info({ 
			event: 'sync_started',
			alias: this.config.alias,
			dataSourceId: this.config.dataSourceId,
			options 
		});

		try {
			// 0. Call onBeforeSync lifecycle callback
			if (this.config.onBeforeSync) {
				this.logger.debug({ event: 'calling_onBeforeSync' });
				await this.config.onBeforeSync();
			}

			// 1. Wipe existing pages if requested
			if (options.wipe) {
				const deletedCount = await this.pageCrud.deleteForSource(this.config.dataSourceId);
				this.logger.info({ 
					event: 'wipe_completed',
					alias: this.config.alias,
					dataSourceId: this.config.dataSourceId,
					deleted: deletedCount 
				});
			}

			// 2. Build filter for incremental sync
			const filter = this.buildSyncFilter(options);

			// 3. Fetch all pages with pagination
			const allPages: PageObjectResponse[] = [];
			let cursor: string | null | undefined = undefined;
			
			do {
				const result = await this.notionClient.queryDataSource(
					this.config.dataSourceId,
					filter,
					cursor
				);
				
				allPages.push(...result.pages);
				cursor = result.nextCursor;
				
				this.logger.debug({ 
					event: 'pages_fetched',
					count: result.pages.length,
					totalSoFar: allPages.length,
					hasMore: !!cursor 
				});
			} while (cursor);
			
			this.logger.info({ 
				event: 'all_pages_fetched',
				totalPages: allPages.length 
			});

			// 4. Process each page (with optional limit)
			let processed = 0;
			let skipped = 0;
			let failed = 0;
			const pagesToProcess = options.limit ? allPages.slice(0, options.limit) : allPages;
			
			if (options.limit && allPages.length > options.limit) {
				this.logger.info({ 
					event: 'applying_limit',
					limit: options.limit,
					totalPages: allPages.length,
					willProcess: pagesToProcess.length
				});
			}
			
			for (const page of pagesToProcess) {
				try {
					const wasProcessed = await this.processPage(page);
					if (wasProcessed) {
						processed++;
					} else {
						skipped++;
					}
				} catch (error: any) {
					this.logger.error({ 
						event: 'page_processing_failed',
						pageId: page.id,
						error: error?.message,
						stack: error?.stack 
					});
					failed++;
				}
			}

			// 5. Call onAfterSync lifecycle callback
			if (this.config.onAfterSync) {
				this.logger.debug({ event: 'calling_onAfterSync' });
				await this.config.onAfterSync();
			}

			const duration = Date.now() - startTime;
			
			this.logger.info({ 
				event: 'sync_completed',
				alias: this.config.alias,
				dataSourceId: this.config.dataSourceId,
				processed,
				skipped,
				failed,
				duration_ms: duration 
			});

			return {
				alias: this.config.alias,
				dataSourceId: this.config.dataSourceId,
				processed,
				skipped,
				failed,
				status: 'success',
			duration_ms: duration
		};

	} catch (error: any) {
		const duration = Date.now() - startTime;
		
		this.logger.error({ 
			event: 'sync_failed',
			alias: this.config.alias,
			dataSourceId: this.config.dataSourceId,
			error: error?.message,
			stack: error?.stack,
			duration_ms: duration 
		});

		return {
			alias: this.config.alias,
			dataSourceId: this.config.dataSourceId,
			processed: 0,
			skipped: 0,
			failed: 0,
			status: 'error',
			details: error?.message,
			duration_ms: duration
		};
	}
}	/**
	 * Process a single page (used by webhook handler)
	 * Returns true if page was processed, false if skipped
	 */
	async processPage(page: PageObjectResponse): Promise<boolean> {
		this.logger.debug({ 
			event: 'process_page_started',
			pageId: page.id 
		});

		// 1. Check if page needs updating (compare timestamps)
		const existingPage = await this.pageCrud.getByNotionPageId(page.id);

		if (existingPage && existingPage.updated_at) {
			const notionTime = new Date(page.last_edited_time).getTime();
			// Use last_synced_at when available: it's stamped after all Notion write-backs
			// complete, so it's always >= any last_edited_time bump we caused ourselves.
			const syncRef = (existingPage as any).last_synced_at ?? existingPage.updated_at;
			const dbTime = new Date(syncRef).getTime();
			const diff = notionTime - dbTime;

			this.logger.info({ 
				event: 'timestamp_comparison',
				pageId: page.id,
				notionTime: page.last_edited_time,
				dbTime: syncRef,
				notionTimeMs: notionTime,
				dbTimeMs: dbTime,
				diffMs: diff,
				willSkip: dbTime >= notionTime - 10000
			});

			// Skip if DB is up to date (allowing 10 second tolerance for clock drift)
			if (dbTime >= notionTime - 10000) {
				this.logger.info({ 
					event: 'page_already_up_to_date',
					pageId: page.id,
					notionTime: page.last_edited_time,
					dbTime: existingPage.updated_at
				});
				return false; // Skipped
			}
		}

		// 2. Build page data (applies all business logic including exclusion via hooks)
		const pageData = await this.pageTransformer.transformPage(page);

		// 3. Skip if excluded or not publishable
		if (!pageData) {
			this.logger.debug({ 
				event: 'page_skipped',
				pageId: page.id 
			});
			return false;
		}

		// 4. Upsert to database
		await this.pageCrud.upsert(pageData);

		this.logger.info({ 
			event: 'page_processed',
			pageId: page.id,
			slug: pageData.slug,
			title: pageData.title 
		});
		
		return true;
	}

	/**
	 * Build Notion API filter for incremental sync
	 */
	private buildSyncFilter(options: SyncOptions): any | undefined {
		if (options.syncAll) {
			return undefined; // No filter - fetch everything
		}

		if (options.since) {
			return {
				timestamp: 'last_edited_time',
				last_edited_time: { after: options.since }
			};
		}

		return undefined;
	}
}