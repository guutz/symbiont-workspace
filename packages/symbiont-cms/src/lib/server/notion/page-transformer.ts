import type { PageObjectResponse } from '@notionhq/client';
import type { DatabaseBlueprint } from '../../types.js';
import type { DatabasePage } from '../../types.js';
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
		private supabaseUrl: string,
		private serviceRoleKey: string
	) {
		this.logger = createLogger({
			operation: 'page_transformer',
			alias: this.config.alias,
			dataSourceId: this.config.dataSourceId
		});

		// Initialize hook registry
		this.hookRegistry = new HookRegistry(this.logger);

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
	 * Process cover image: upload to Supabase and sync URL back to Notion
	 * Falls back to extracting first image from content if no cover is set
	 */
	private async processCoverImage(page: PageObjectResponse): Promise<string | null> {
		if (!this.config.coverProperty) {
			return null;
		}

		try {
			const coverProp = page.properties[this.config.coverProperty];
			
			// No cover image in property - try to find one in content
			if (coverProp?.type !== 'files' || coverProp.files.length === 0) {
				return await this.extractCoverFromContent(page);
			}

			const file = coverProp.files[0];
			
			// Handle Notion-hosted files (need re-upload)
			if (file.type === 'file') {
				const originalUrl = file.file?.url;
				if (!originalUrl) return null;

				// Upload to Supabase if needed
				if (needsUploadToSupabase(originalUrl)) {
					const result = await uploadImageToSupabase(originalUrl, {
						supabaseUrl: this.supabaseUrl,
						serviceRoleKey: this.serviceRoleKey,
						pageId: page.id
					});
					
					this.logger.info({
						event: 'cover_image_uploaded',
						pageId: page.id,
						originalUrl,
						newUrl: result.newUrl,
						filename: result.filename
					});

					// Sync permanent URL back to Notion
					await this.notionClient.updateFileProperty(
						page.id,
						this.config.coverProperty,
						result.newUrl
					);

					return result.newUrl;
				}

				return originalUrl; // Already on Supabase
			}
			
			// Handle external files
			if (file.type === 'external') {
				const externalUrl = file.external?.url;
				if (!externalUrl) return null;

				// Check if external URL needs to be uploaded
				if (needsUploadToSupabase(externalUrl)) {
					const result = await uploadImageToSupabase(externalUrl, {
						supabaseUrl: this.supabaseUrl,
						serviceRoleKey: this.serviceRoleKey,
						pageId: page.id
					});
					
					this.logger.info({
						event: 'cover_image_external_uploaded',
						pageId: page.id,
						originalUrl: externalUrl,
						newUrl: result.newUrl,
						filename: result.filename
					});

					// Sync permanent URL back to Notion
					await this.notionClient.updateFileProperty(
						page.id,
						this.config.coverProperty,
						result.newUrl
					);

					return result.newUrl;
				}

				// Already a permanent URL
				this.logger.info({
					event: 'cover_image_external',
					pageId: page.id,
					coverUrl: externalUrl
				});
				return externalUrl;
			}

			return null;
		} catch (error: any) {
			this.logger.warn({
				event: 'cover_image_upload_failed',
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
	 * Process content and images: upload to Supabase and sync markdown back to Notion
	 */
	private async processContentAndUploadImages(page: PageObjectResponse): Promise<string> {
		// Get content as markdown
		const content = await this.notionClient.pageToMarkdown(page.id);
		
		// Find and process all images
		let processedContent = content;
		const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
		const imagePromises: Promise<void>[] = [];
		let match;

		while ((match = imageRegex.exec(content)) !== null) {
			const [fullMatch, alt, url] = match;
			
			if (needsUploadToSupabase(url)) {
				const imagePromise = uploadImageToSupabase(url, {
					supabaseUrl: this.supabaseUrl,
					serviceRoleKey: this.serviceRoleKey,
					pageId: page.id,
					altText: alt || undefined
				}).then((uploaded) => {
					processedContent = processedContent.replace(fullMatch, `![${alt}](${uploaded.newUrl})`);
					this.logger.info({
						event: 'content_image_uploaded',
						pageId: page.id,
						filename: uploaded.filename
					});
				}).catch((error) => {
					this.logger.warn({
						event: 'content_image_upload_failed',
						pageId: page.id,
						url,
						error: error.message
					});
				});
				
				imagePromises.push(imagePromise);
			}
		}

		// Wait for all uploads
		await Promise.all(imagePromises);

		// Sync updated content back to Notion if images changed
		// TODO: Decide if we want to keep images that are in Notion CDN, in Notion CDN -- or replace all images in Notion with Supabase URLs (current behavior)
		// As is, Martian convertMarkdownToNotionBlocks does not rebuild Notion internal image blocks correctly, so that would need to be fixed first
		if (processedContent !== content) {
			try {
				const blocks = convertMarkdownToNotionBlocks(processedContent, {
					strictImageUrls: false,
					truncate: true,
					onLimitExceeded: (err) => this.logger.warn({
						event: 'notion_content_limit_exceeded',
						pageId: page.id,
						error: err.message
					})
				});

				await this.notionClient.updatePageBlocks(page.id, blocks);
				
				this.logger.info({
					event: 'notion_content_images_synced',
					pageId: page.id,
					message: 'Updated Notion page with Supabase image URLs'
				});
			} catch (error: any) {
				this.logger.warn({
					event: 'notion_content_sync_failed',
					pageId: page.id,
					error: error?.message
				});
			}
		}

		return processedContent;
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
		const customMeta = await this.hookRegistry.execute<Record<string, any>>(
			'metadata:custom',
			{
				page,
				config: this.config,
				logger: this.logger
			}
		);

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
		// Use hooks for metadata extraction (Phase 1 migration)
		const hookContext = {
			page,
			config: this.config,
			logger: this.logger
		};

		const title = await this.hookRegistry.execute<string>('metadata:title', hookContext) || 'Untitled';
		const tags = await this.hookRegistry.execute<string[]>('metadata:tags', hookContext) || [];
		const authors = await this.hookRegistry.execute<string[]>('metadata:authors', hookContext) || [];
		const summary = await this.hookRegistry.execute<string>('metadata:summary', hookContext) || '';

		return { title, tags, authors, summary };
	}

	/**
	 * Resolve slug with conflict handling and sync-back
	 * Uses slug:extract and slug:generate hooks
	 */
	private async resolveSlug(page: PageObjectResponse, title: string): Promise<string> {
		// 1. Extract custom slug via hooks
		const customSlug = await this.hookRegistry.execute<string | null>('slug:extract', {
			page,
			config: this.config,
			logger: this.logger
		});

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
			// In the new extractor pattern, slug:generate extracts title directly from page
			const baseSlug = await this.hookRegistry.execute<string>(
				'slug:generate',
				{
					page,
					config: this.config,
					logger: this.logger
				}
			);

			// If custom slug was extracted, use it instead of generated
			const finalBaseSlug = customSlug || baseSlug;
			slug = await this.ensureUniqueSlug(finalBaseSlug);
			slugChanged = true;
			this.logger.info({
				event: 'slug_generated',
				pageId: page.id,
				slug,
				customSlug: !!customSlug
			});
		}

		// 4. Sync back to Notion ONLY if slug is new or changed
		if (this.config.slugSyncProperty && slugChanged) {
			// Also check if Notion already has the correct slug to avoid unnecessary updates
			if (customSlug !== slug) {
				await this.notionClient.updateProperty(page.id, this.config.slugSyncProperty, slug);
				this.logger.debug({
					event: 'slug_synced_to_notion',
					pageId: page.id,
					slug
				});
			}
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
		const shouldExclude = await this.hookRegistry.execute<boolean>('page:exclude', {
			page,
			config: this.config,
			logger: this.logger
		});
		return shouldExclude || false; // Default to false if no hooks return a value
	}

	/**
	 * Check if page should be published (apply publish:check hook)
	 */
	private async shouldPublish(page: PageObjectResponse): Promise<boolean> {
		const shouldPublish = await this.hookRegistry.execute<boolean>('publish:check', {
			page,
			config: this.config,
			logger: this.logger
		});
		return shouldPublish || false; // Default to false if no hooks return a value
	}

	/**
	 * Get publish date (apply publish:date hook)
	 */
	private async getPublishDate(page: PageObjectResponse): Promise<string | null> {
		const publishDate = await this.hookRegistry.execute<string>('publish:date', {
			page,
			config: this.config,
			logger: this.logger
		});
		return publishDate;
	}
}