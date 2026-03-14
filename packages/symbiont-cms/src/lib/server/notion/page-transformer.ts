import type { PageObjectResponse } from '@notionhq/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseBlueprint, DatabasePage } from '../../types.js';
import type { Database } from '../../database.types.js';
import { NotionClient } from './client.js';
import { DatabasePageCRUD } from '../database/page-crud.js';
import { createLogger } from '../utils/logger.js';
import { HookRegistry } from '../../hooks/registry.js';
import { defaultHooks } from '../../hooks/default-hooks.js';

/**
 * NotionPageToDatabasePageTransformer
 * 
 * Thin event sequencer that fires hooks in order and assembles DatabasePage.
 * Per design memo (2026-02-21-hook-events-design-memo.md).
 * 
 * Responsibilities:
 * 1. Maintain mutable output object (DatabasePage being assembled)
 * 2. Fire events in exact order from Event Ordering Contract
 * 3. Handle conditionals: page:should-sync, publish:check
 * 4. Bridge step: convert MdBlock[] to string after content:preprocess
 * 5. Perform final Supabase upsert
 * 
 * All business logic lives in hooks. This class just sequences events.
 */
export class NotionPageToDatabasePageTransformer {
	private logger: ReturnType<typeof createLogger>;
	private hookRegistry: HookRegistry;

	constructor(
		private config: DatabaseBlueprint,
		private notionClient: NotionClient,
		private pageCrud: DatabasePageCRUD,
		private supabase: SupabaseClient<Database>
	) {
		this.logger = createLogger({
			operation: 'page_transformer',
			alias: this.config.alias,
			dataSourceId: this.config.dataSourceId
		});

		// Initialize hook registry with config and services
		this.hookRegistry = new HookRegistry(
			this.logger,
			this.config,
			{
				notionClient: this.notionClient,
				supabase: this.supabase
			}
		);

		// Register default hooks
		this.hookRegistry.registerMany(defaultHooks);

		// Register user hooks
		if (this.config.hooks) {
			this.hookRegistry.registerMany(this.config.hooks);
		}

		this.logger.info({
			event: 'transformer_initialized',
			totalHooks: this.hookRegistry.getAllHooks().size,
			hasUserHooks: !!this.config.hooks?.length
		});
	}
	
	/**
	 * Transform a Notion page into a DatabasePage.
	 * Follows Event Ordering Contract from design memo.
	 * 
	 * @returns DatabasePage ready for upsert, or null if page should be skipped
	 */
	async transformPage(page: PageObjectResponse): Promise<DatabasePage | null> {
		this.logger.debug({
			event: 'transform_page_started',
			pageId: page.id
		});

		// Initialize mutable output with required fields
		const output: Partial<DatabasePage> = {
			page_id: page.id,
			datasource_id: this.config.dataSourceId,
			datasource_alias: this.config.alias,
			publish_at: null,
			updated_at: page.last_edited_time
		};

		// Reset per-page store so hooks can communicate across events
		this.hookRegistry.beginPage();

		try {
			// ── Page Lifecycle ─────────────────────────────────────────

			// page:before
			await this.hookRegistry.execute('page:before', output, page);

			// page:should-sync (flow control)
			const shouldSync = await this.hookRegistry.execute('page:should-sync', output, page);
			if (!shouldSync) {
				this.logger.info({
					event: 'page_skipped_should_not_sync',
					pageId: page.id
				});
				return null;
			}

			// ── Publishing ─────────────────────────────────────────────

			// publish:check (flow control)
			const publishable = await this.hookRegistry.execute('publish:check', output, page);

			// publish:date (only if publishable)
			if (publishable) {
				await this.hookRegistry.execute('publish:date', output, page);
			}
			// If not publishable, publish_at stays null (dark draft)

			// ── Slug Pipeline ──────────────────────────────────────────

			// slug:extract
			await this.hookRegistry.execute('slug:extract', output, page);

			// slug:generate
			await this.hookRegistry.execute('slug:generate', output, page);

			// slug:conflict (receives current slug as input, returns resolved slug)
			const candidateSlug = output.slug;
			if (candidateSlug) {
				await this.hookRegistry.execute('slug:conflict', output, page, candidateSlug);
			}

			// slug:sync
			await this.hookRegistry.execute('slug:sync', output, page);

			// ── Metadata Extraction ────────────────────────────────────

			// metadata:title
			await this.hookRegistry.execute('metadata:title', output, page);

			// metadata:tags
			await this.hookRegistry.execute('metadata:tags', output, page);

			// metadata:authors
			await this.hookRegistry.execute('metadata:authors', output, page);

			// metadata:summary
			await this.hookRegistry.execute('metadata:summary', output, page);

			// metadata:custom (merged into output.meta)
			await this.hookRegistry.execute('metadata:custom', output, page);

			// ── Content Pipeline ───────────────────────────────────────

			// content:preprocess — hook is responsible for fetching content (via pageToMarkdown)
			// Returns a markdown string directly.
			const rawMarkdown = (await this.hookRegistry.execute('content:preprocess', output, page) as string) ?? '';

			// content:text (Pipeline: transform raw markdown string)
			await this.hookRegistry.execute('content:text', output, page, rawMarkdown);

			// content:media (Pipeline: upload inline images, rewrite URLs)
			await this.hookRegistry.execute('content:media', output, page, output.content);

			// content:postprocess (Pipeline: final transforms)
			await this.hookRegistry.execute('content:postprocess', output, page, output.content);

			// content:sync (write final content back to Notion)
			await this.hookRegistry.execute('content:sync', output, page);

			// ── Cover Pipeline ─────────────────────────────────────────

			// cover:extract (falls back to content scan if no coverProperty)
			await this.hookRegistry.execute('cover:extract', output, page);

			// cover:process (Pipeline: upload cover image)
			if (output.cover) {
				await this.hookRegistry.execute('cover:process', output, page, output.cover);
			}

			// cover:sync (write cover back to Notion)
			await this.hookRegistry.execute('cover:sync', output, page);

			// ── Page Lifecycle End ─────────────────────────────────────

			// page:after
			await this.hookRegistry.execute('page:after', output, page);

			// ── Validation ─────────────────────────────────────────────

			// Validate required fields
			if (!output.title || !output.slug) {
				this.logger.warn({
					event: 'page_missing_required_fields',
					pageId: page.id,
					hasTitle: !!output.title,
					hasSlug: !!output.slug
				});
				return null;
			}

			// ── Persist ────────────────────────────────────────────────

			// Stamp the time we finished processing (after all Notion write-backs).
			// The skip check in processPage compares against this, not updated_at,
			// so our own write-backs (slug sync, PDF URL, etc.) don't cause a re-sync loop.
			output.last_synced_at = new Date().toISOString();

			// Upsert to Supabase
			await this.pageCrud.upsert(output as DatabasePage);

			this.logger.info({
				event: 'page_transformed',
				pageId: page.id,
				slug: output.slug,
				title: output.title,
				isPublic: !!output.publish_at
			});

			return output as DatabasePage;

		} catch (error: any) {
			this.logger.error({
				event: 'transform_page_failed',
				pageId: page.id,
				error: error?.message,
				stack: error?.stack
			});
			throw error;
		}
	}

}
