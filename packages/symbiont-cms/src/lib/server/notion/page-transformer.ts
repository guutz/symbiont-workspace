import type { PageObjectResponse } from '@notionhq/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseBlueprint } from '../../types.js';
import type { DatabasePage } from '../../types.js';
import type { Database } from '../../database.types.js';
import { createSlug } from '../utils/slug.js';
import { NotionClient } from './client.js';
import { DatabasePageCRUD } from '../database/page-crud.js';
import { createLogger } from '../utils/logger.js';
import { uploadImageToSupabase, needsUploadToSupabase } from '../bucket/image-upload.js';
import { convertMarkdownToNotionBlocks } from './markdown-to-blocks.js';
import { HookRegistry } from '../../hooks/registry.js';
import { defaultHooks } from '../../hooks/default-hooks.js';

/**
 * NotionPageToDatabasePageTransformer - Business logic for transforming Notion pages into database page data
 * 
 * Responsibilities:
 * - Apply publishing rules via hooks
 * - Extract metadata (title, tags, authors, custom metadata)
 * - Resolve slugs (handle conflicts, sync back to Notion)
 * - Orchestrate content fetching
 * - Process and upload images to Supabase Storage
 * 
 * This is where all the sync rules from DatabaseBlueprint are applied.
 * 
 * Hook System:
 * - Registers default hooks + user hooks
 * - Executes hooks at appropriate lifecycle events
 * - Data flows through hooks: each hook receives data from previous hook
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
	 * Construct a complete DatabasePage object from a Notion page
	 * 
	 * Always syncs the page to the database, but sets publish_at to null
	 * if the page doesn't pass the publish:check hook. This allows the database
	 * to handle filtering of non-public pages.
	 * 
	 * For non-public pages, slug generation is skipped (slug set to null)
	 * since the page may not be finished yet (including title).
	 */
	async transformPage(page: PageObjectResponse): Promise<DatabasePage | null> {
		this.logger.debug({
			event: 'transform_page_started',
			pageId: page.id
		});

		// 0. Check if page should be excluded from sync
		const shouldExclude = await this.shouldExclude(page);
		if (shouldExclude) {
			this.logger.info({
				event: 'page_excluded',
				pageId: page.id
			});
			return null;
		}

		// 1. Extract core metadata (title, tags, authors, summary) - using hooks
		const coreMeta = await this.extractCoreMetadata(page);

		// 2. Check publishing rules
		const isPublic = await this.shouldPublish(page);
		const publishDate = isPublic ? await this.getPublishDate(page) : null;

		// 3. Resolve slug (only for public posts)
		const slug = isPublic ? await this.resolveSlug(page, coreMeta.title) : null;

		// 4. Process cover image (upload + sync back to Notion)
		// TODO: maybe combine this with metadata extraction and have some kind of flag in config that it is an image to be uploaded?
		const coverUrl = await this.processCoverImage(page);

		// 5. Get content and process inline images (upload + sync back to Notion)
		const processedContent = await this.processContentAndUploadImages(page);

		// 6. Build complete metadata object
		const meta = await this.buildMetadata(page, { coverUrl });

		// 7. Construct final page data
		const pageData: DatabasePage = {
			page_id: page.id,
			datasource_id: this.config.dataSourceId,
			datasource_alias: this.config.alias,
			title: coreMeta.title,
			slug,
			content: processedContent,
			summary: coreMeta.summary,
			publish_at: publishDate,
			updated_at: page.last_edited_time,
			tags: coreMeta.tags.length > 0 ? coreMeta.tags : null,
			authors: coreMeta.authors.length > 0 ? coreMeta.authors : null,
			meta
		};

		this.logger.info({
			event: 'page_transformed',
			pageId: page.id,
			slug,
			title: coreMeta.title,
			isPublic
		});

		return pageData;
	}

	/**
	 * Process cover image: extract URL and process it (upload, etc.)
	 * Falls back to extracting first image from content if no cover is set
	 */
	private async processCoverImage(page: PageObjectResponse): Promise<string | null> {
		try {
			// Extract cover URL using hook
			const rawCoverUrl = await this.hookRegistry.execute('cover:extract', page);
			
			// No cover found - try content fallback
			if (!rawCoverUrl) {
				return await this.extractCoverFromContent(page);
			}
			
			// Process cover URL using hook (upload, transform, etc.)
			const finalCoverUrl = await this.hookRegistry.execute('cover:process', page, rawCoverUrl);
			
			return finalCoverUrl;
		} catch (error: any) {
			this.logger.warn({
				event: 'cover_image_processing_failed',
				pageId: page.id,
				error: error?.message
			});
			return null;
		}
	}

	/**
	 * Extract first image from page content to use as cover
	 */
	private async extractCoverFromContent(page: PageObjectResponse): Promise<string | null> {
		try {
			// Get content as markdown
			const content = await this.notionClient.pageToMarkdown(page.id);
			
			// Find first image in content
			const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/;
			const match = content.match(imageRegex);
			
			if (!match) return null;
			
			const [, alt, url] = match;
			
			// Upload to Supabase if needed
			if (needsUploadToSupabase(url)) {
				const result = await uploadImageToSupabase(url, {
					supabaseUrl: this.supabaseUrl,
					serviceRoleKey: this.serviceRoleKey,
					pageId: page.id,
					altText: alt || undefined
				});
				
				this.logger.info({
					event: 'cover_image_extracted_from_content',
					pageId: page.id,
					originalUrl: url,
					newUrl: result.newUrl,
					filename: result.filename
				});
				
				return result.newUrl;
			}
			
			// Use URL as-is if already permanent
			this.logger.info({
				event: 'cover_image_extracted_from_content',
				pageId: page.id,
				coverUrl: url
			});
			return url;
		} catch (error: any) {
			this.logger.warn({
				event: 'cover_image_content_extraction_failed',
				pageId: page.id,
				error: error?.message
			});
			return null;
		}
	}

	/**
	 * Process content pipeline: fetch, transform, process images
	 * Uses content:transform and content:images hooks
	 */
	private async processContentAndUploadImages(page: PageObjectResponse): Promise<string> {
		// Fetch content as markdown (always from Notion)
		const rawContent = await this.notionClient.pageToMarkdown(page.id);
		
		// Transform content (user can strip/rewrite via hooks)
		const transformed = await this.hookRegistry.execute('content:transform', page, rawContent) ?? rawContent;
		
		// Process inline images (upload, transform URLs)
		const finalContent = await this.hookRegistry.execute('content:images', page, transformed) ?? transformed;
		
		// Sync updated content back to Notion if changed
		if (finalContent !== rawContent) {
			await this.hookRegistry.execute('sync:content', page, finalContent);
		}

		return finalContent;
	}

	/**
	 * Build complete metadata object from all sources
	 * 
	 * Merges:
	 * - System-managed fields (cover URL, etc.)
	 * - Custom user-extracted metadata (via metadata:custom hook)
	 * 
	 * This makes it easy to add more system fields in the future
	 * (e.g., processing status, image count, word count, etc.)
	 */
	private async buildMetadata(
		page: PageObjectResponse,
		systemFields: { coverUrl: string | null }
	): Promise<Record<string, any> | null> {
		// Start with system-managed fields
		const metadata: Record<string, any> = {};

		// Add cover URL if present
		if (systemFields.coverUrl) {
			metadata.cover = systemFields.coverUrl;
		}

		// Get custom metadata via hooks (auto-merged by registry)
		const customMeta = await this.hookRegistry.execute('metadata:custom', page);

		// Merge hook result with system fields
		if (customMeta) {
			Object.assign(metadata, customMeta);
		}

		// Return null if empty (cleaner than empty object in database)
		return Object.keys(metadata).length > 0 ? metadata : null;
	}

	/**
	 * Extract core metadata (title, tags, authors)
	 */
	private async extractCoreMetadata(page: PageObjectResponse): Promise<{
		title: string;
		tags: string[];
		authors: string[];
		summary: string;
	}> {
		// Use hooks for metadata extraction - simplified signature
		const title = await this.hookRegistry.execute('metadata:title', page) || 'Untitled';
		const tags = await this.hookRegistry.execute('metadata:tags', page) || [];
		const authors = await this.hookRegistry.execute('metadata:authors', page) || [];
		const summary = await this.hookRegistry.execute('metadata:summary', page) || '';

		return { title, tags, authors, summary };
	}

	/**
	 * Resolve slug with conflict handling and sync-back
	 * Uses slug:extract and slug:generate hooks
	 */
	private async resolveSlug(page: PageObjectResponse, title: string): Promise<string> {
		// 1. Extract custom slug via hooks
		const customSlug = await this.hookRegistry.execute('slug:extract', page);

		// 2. Check if page already exists in DB
		const existingPage = await this.pageCrud.getByNotionPageId(page.id);

		// 3. Determine final slug
		let slug: string;
		let slugChanged = false;

		if (existingPage && existingPage.slug) {
			// Existing page with slug - handle slug changes
			if (customSlug && customSlug !== existingPage.slug) {
				// User changed slug in Notion - validate uniqueness
				slug = await this.ensureUniqueSlug(customSlug, page.id);
				slugChanged = true;
				this.logger.info({
					event: 'slug_updated',
					pageId: page.id,
					oldSlug: existingPage.slug,
					newSlug: slug
				});
			} else {
				// No change - keep existing slug
				slug = existingPage.slug;
				slugChanged = false;
			}
		} else {
			// New page or existing page without slug - generate via hooks
			const baseSlug = await this.hookRegistry.execute('slug:generate', page);

			// If custom slug was extracted, use it instead of generated
			const finalBaseSlug = customSlug || baseSlug || 'untitled';
			slug = await this.ensureUniqueSlug(finalBaseSlug);
			slugChanged = true;
			this.logger.info({
				event: 'slug_generated',
				pageId: page.id,
				slug,
				customSlug: !!customSlug
			});
		}

		// 4. Sync back to Notion if slug changed
		if (slugChanged) {
			await this.hookRegistry.execute('sync:slug', page, slug);
		}

		return slug;
	}

	/**
	 * Ensure slug is unique by appending numbers if needed
	 */
	private async ensureUniqueSlug(baseSlug: string, excludePageId?: string): Promise<string> {
		const existingPage = await this.pageCrud.getBySlug(baseSlug, this.config.dataSourceId);

		// If no conflict, or conflict is with the same page, use base slug
		if (!existingPage || existingPage.page_id === excludePageId) {
			return baseSlug;
		}

		// Auto-resolve conflicts: try -2, -3, -4, etc.
		for (let i = 2; i <= 100; i++) {
			const numberedSlug = `${baseSlug}-${i}`;
			const conflict = await this.pageCrud.getBySlug(numberedSlug, this.config.dataSourceId);

			if (!conflict || conflict.page_id === excludePageId) {
				this.logger.warn({
					event: 'slug_conflict_resolved',
					requestedSlug: baseSlug,
					finalSlug: numberedSlug
				});
				return numberedSlug;
			}
		}

		// Fallback: use random string
		const randomSlug = `${baseSlug}-${Math.random().toString(36).substring(2, 8)}`;
		this.logger.warn({
			event: 'slug_conflict_random_fallback',
			requestedSlug: baseSlug,
			finalSlug: randomSlug
		});
		return randomSlug;
	}

	/**
	 * Check if page should be excluded from sync (apply page:exclude hook)
	 */
	private async shouldExclude(page: PageObjectResponse): Promise<boolean> {
		const shouldExclude = await this.hookRegistry.execute('page:exclude', page);
		return shouldExclude || false; // Default to false if no hooks return a value
	}

	/**
	 * Check if page should be published (apply publish:check hook)
	 */
	private async shouldPublish(page: PageObjectResponse): Promise<boolean> {
		const shouldPublish = await this.hookRegistry.execute('publish:check', page);
		return shouldPublish || false; // Default to false if no hooks return a value
	}

	/**
	 * Get publish date (apply publish:date hook)
	 */
	private async getPublishDate(page: PageObjectResponse): Promise<string | null> {
		const publishDate = await this.hookRegistry.execute('publish:date', page);
		return publishDate;
	}
}