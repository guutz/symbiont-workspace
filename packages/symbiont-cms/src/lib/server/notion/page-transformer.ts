import type { PageObjectResponse } from '@notionhq/client';
import type { DatabaseBlueprint } from '../../types.js';
import type { DatabasePage } from '../../types.js';
import { createSlug } from '../utils/slug.js';
import { NotionClient } from './client.js';
import { DatabasePageCRUD } from '../database/page-crud.js';
import { createLogger } from '../utils/logger.js';
import { uploadImageToSupabase, needsUploadToSupabase } from '../bucket/image-upload.js';
import { convertMarkdownToNotionBlocks } from './markdown-to-blocks.js';

/**
 * NotionPageToDatabasePageTransformer - Business logic for transforming Notion pages into database page data
 * 
 * Responsibilities:
 * - Apply publishing rules (isPublicRule, publishDateRule)
 * - Extract metadata (title, tags, authors, custom metadata)
 * - Resolve slugs (handle conflicts, sync back to Notion)
 * - Orchestrate content fetching
 * - Process and upload images to Supabase Storage
 * 
 * This is where all the sync rules from DatabaseBlueprint are applied.
 */
export class NotionPageToDatabasePageTransformer {
	private logger: ReturnType<typeof createLogger>;

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
	}
	
	/**
	 * Construct a complete DatabasePage object from a Notion page
	 * 
	 * Always syncs the page to the database, but sets publish_at to null
	 * if the page doesn't pass the isPublicRule. This allows the database
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

		// 1. Extract core metadata (title, tags, authors)
		const coreMeta = this.extractCoreMetadata(page);

		// 2. Check publishing rules
		const isPublic = this.shouldPublish(page);
		const publishDate = isPublic ? this.getPublishDate(page) : null;

		// 3. Resolve slug (only for public posts)
		const slug = isPublic ? await this.resolveSlug(page, coreMeta.title) : null;

		// 4. Process cover image (upload + sync back to Notion)
		// TODO: maybe combine this with metadata extraction and have some kind of flag in config that it is an image to be uploaded?
		const coverUrl = await this.processCoverImage(page);

		// 5. Get content and process inline images (upload + sync back to Notion)
		const processedContent = await this.processContentAndUploadImages(page);

		// 6. Build complete metadata object
		const meta = this.buildMetadata(page, { coverUrl });

		// 7. Construct final page data
		const pageData: DatabasePage = {
			page_id: page.id,
			datasource_id: this.config.dataSourceId,
			datasource_alias: this.config.alias,
			title: coreMeta.title,
			slug,
			content: processedContent,
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
	 */
	private async processCoverImage(page: PageObjectResponse): Promise<string | null> {
		if (!this.config.coverProperty) {
			return null;
		}

		try {
			const coverProp = page.properties[this.config.coverProperty];
			
			if (coverProp?.type !== 'files' || coverProp.files.length === 0) {
				return null;
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
			
			// Handle external files (use as-is)
			if (file.type === 'external') {
				const externalUrl = file.external?.url || null;
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
		// TODO: Decide if we want to keep images that are in Notion CDN, in Notion CDN -- or replace all images in Notion with Supabase URLs
		// As is, not sure if Martian convertMarkdownToNotionBlocks rebuilds Notion internal image blocks correctly
		// Probably want to move away from Martian at some point anyway since it's a black box and it's unclear how it deals with api limits
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
	 * - Custom user-extracted metadata
	 * 
	 * This makes it easy to add more system fields in the future
	 * (e.g., processing status, image count, word count, etc.)
	 */
	private buildMetadata(
		page: PageObjectResponse,
		systemFields: { coverUrl: string | null }
	): Record<string, any> | null {
		// Start with system-managed fields
		const metadata: Record<string, any> = {};

		// Add cover URL if present
		if (systemFields.coverUrl) {
			metadata.cover = systemFields.coverUrl;
		}

		// Merge custom metadata from user's extractor
		const customMeta = this.config.metadataExtractor?.(page);
		if (customMeta) {
			Object.assign(metadata, customMeta);
		}

		// Return null if empty (cleaner than empty object in database)
		return Object.keys(metadata).length > 0 ? metadata : null;
	}

	/**
	 * Extract core metadata (title, tags, authors)
	 */
	private extractCoreMetadata(page: PageObjectResponse): {
		title: string;
		tags: string[];
		authors: string[];
	} {
		const title = this.notionClient.getTitleProperty(page);

		const tags = this.config.tagsProperty
			? this.notionClient.getPropertyValues(page, this.config.tagsProperty)
			: [];

		const authors = this.config.authorsProperty
			? this.notionClient.getPropertyValues(page, this.config.authorsProperty)
			: [];

		return { title, tags, authors };
	}

	/**
	 * Resolve slug with conflict handling and sync-back
	 */
	private async resolveSlug(page: PageObjectResponse, title: string): Promise<string> {
		// 1. Check for custom slug from Notion
		const customSlug = this.config.slugRule?.(page) ?? null;

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
			// New page or existing page without slug - generate or use custom
			const baseSlug = customSlug || createSlug(title);
			slug = await this.ensureUniqueSlug(baseSlug);
			slugChanged = true;
			this.logger.info({
				event: 'slug_generated',
				pageId: page.id,
				slug
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
	 * Check if page should be published (apply isPublicRule)
	 */
	private shouldPublish(page: PageObjectResponse): boolean {
		return this.config.isPublicRule?.(page) ?? true;
	}

	/**
	 * Get publish date (apply publishDateRule)
	 */
	private getPublishDate(page: PageObjectResponse): string | null {
		if (this.config.publishDateRule) {
			return this.config.publishDateRule(page);
		}
		return page.last_edited_time;
	}
}