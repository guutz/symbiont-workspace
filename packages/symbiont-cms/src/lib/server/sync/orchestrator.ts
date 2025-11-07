import type { PageObjectResponse } from '@notionhq/client';
import type { DatabaseBlueprint } from '../../types.js';
import { NotionAdapter } from '../notion/adapter.js';
import { PostRepository } from './post-repository.js';
import { PostBuilder } from './post-builder.js';
import { createLogger } from '../utils/logger.js';

export interface SyncOptions {
	/** Only sync pages modified since this timestamp */
	since?: string | null;
	
	/** Sync all pages regardless of last_edited_time */
	syncAll?: boolean;
	
	/** Delete all existing posts before syncing */
	wipe?: boolean;
}

export interface SyncSummary {
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
 * SyncOrchestrator - High-level sync coordination
 * 
 * Responsibilities:
 * - Coordinate full database sync (query → transform → upsert)
 * - Handle pagination (Notion returns max 100 pages per query)
 * - Process individual pages (webhook handler)
 * - Collect metrics and errors
 * - Wipe operations (delete all posts for a source)
 * 
 * This is the entry point for all sync operations.
 */
export class SyncOrchestrator {
	private logger = createLogger({ operation: 'sync_orchestrator' });

	constructor(
		private notionAdapter: NotionAdapter,
		private postBuilder: PostBuilder,
		private postRepository: PostRepository,
		private config: DatabaseBlueprint
	) {}

	/**
	 * Sync entire database from Notion
	 */
	async syncDataSource(options: SyncOptions = {}): Promise<SyncSummary> {
		const startTime = Date.now();
		
		this.logger.info({ 
			event: 'sync_started',
			alias: this.config.alias,
			dataSourceId: this.config.dataSourceId,
			options 
		});

		try {
			// 1. Wipe existing posts if requested
			if (options.wipe) {
				const deletedCount = await this.postRepository.deleteForSource(this.config.dataSourceId);
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
			const result = await this.notionAdapter.queryDataSource(
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
		} while (cursor);			this.logger.info({ 
				event: 'all_pages_fetched',
				totalPages: allPages.length 
			});

			// 4. Process each page
			let processed = 0;
			let skipped = 0;
			let failed = 0;
			
			for (const page of allPages) {
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

		// 1. Build post data (applies all business logic)
		const postData = await this.postBuilder.buildPost(page);

		// 2. Skip if not publishable
		if (!postData) {
			this.logger.debug({ 
				event: 'page_skipped',
				pageId: page.id 
			});
			return false;
		}

		// 3. Upsert to database
		await this.postRepository.upsert(postData);

		this.logger.info({ 
			event: 'page_processed',
			pageId: page.id,
			slug: postData.slug,
			title: postData.title 
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