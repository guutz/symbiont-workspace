import type { PageObjectResponse } from '@notionhq/client';
import type { DatabaseBlueprint } from '../../types.js';
import type { DatabasePage } from '../database/page-crud.js';
import { createSlug } from '../utils/slug.js';
import { NotionClient } from './client.js';
import { DatabasePageCRUD } from '../database/page-crud.js';
import { createLogger } from '../utils/logger.js';
import { uploadImageToSupabase, needsUploadToSupabase } from '../bucket/image-upload.js';
import { convertMarkdownToNotionBlocks } from './markdown-to-blocks.js';

/**
 * NotionPageToWebsitePageTransformer - Business logic for transforming Notion pages into website page data
 * 
 * Responsibilities:
 * - Apply publishing rules (isPublicRule, publishDateRule)
 * - Extract metadata (title, tags, authors, custom metadata)
 * - Resolve slugs (handle conflicts, sync back to Notion)
 * - Orchestrate content fetching
 * 
 * This is where all the sync rules from DatabaseBlueprint are applied.
 */
export class NotionPageToWebsitePageTransformer {
	private logger: ReturnType<typeof createLogger>;

	constructor(
		private config: DatabaseBlueprint,
		private notionClient: NotionClient,
		private pageCrud: DatabasePageCRUD,
	) {
		this.logger = createLogger({
			operation: 'page_transformer',
			alias: this.config.alias,
			dataSourceId: this.config.dataSourceId
		});
	}
	
	/**
	 * Transform a complete DatabasePage object from a Notion page
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

		// 1. Extract metadata
		const meta = this.extractMetadata(page);

		// 2. Check publishing rules first
		const isPublic = this.shouldPublish(page);
		const publishDate = isPublic ? this.getPublishDate(page) : null;

		// 3. Resolve slug only for public posts (non-public posts may not be finished)
		const slug = isPublic ? await this.resolveSlug(page, meta.title) : null;

		// 4. Process cover image from database property (if configured)
		let coverUrl: string | null = null;
		if (this.config.coverProperty) {
			try {
				const coverProp = page.properties[this.config.coverProperty];
				
				// Handle files property (TypeScript will narrow the union type)
				if (coverProp?.type === 'files' && coverProp.files.length > 0) {
					const file = coverProp.files[0];
					
					// Extract URL based on file type (external vs Notion-hosted)
					if (file.type === 'file') {
						// Notion-hosted file - these URLs expire, so we need to re-upload to storage bucket
						const originalCoverUrl = file.file?.url;
						if (originalCoverUrl && needsUploadToSupabase(originalCoverUrl)) {
							const result = await uploadImageToSupabase(originalCoverUrl, {
								supabaseUrl: this.config.supabase.url,
								serviceRoleKey: this.config.supabase.serviceRoleKey,
								pageId: page.id
							});
							coverUrl = result.newUrl;
							
							this.logger.info({
								event: 'cover_image_uploaded',
								pageId: page.id,
								originalUrl: originalCoverUrl,
								newUrl: coverUrl,
								filename: result.filename
							});
						} else if (originalCoverUrl) {
							coverUrl = originalCoverUrl; // Already on Supabase or external
						}
					} else if (file.type === 'external') {
						// External URL - use as-is (already permanent)
						coverUrl = file.external?.url || null;
						
						this.logger.info({
							event: 'cover_image_external',
							pageId: page.id,
							coverUrl
						});
					}
				}
			} catch (error: any) {
				this.logger.warn({
					event: 'cover_image_upload_failed',
					pageId: page.id,
					error: error?.message
				});
			}
		}

		// 5. Get content as markdown
		const content = await this.notionClient.pageToMarkdown(page.id);

		// 6. Process images in content
		let processedContent = content;
		const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
		let match;
		const imagePromises: Promise<void>[] = [];

		while ((match = imageRegex.exec(content)) !== null) {
			const [fullMatch, alt, url] = match;
			
			if (needsUploadToSupabase(url)) {
				const imagePromise = uploadImageToSupabase(url, {
					supabaseUrl: this.config.supabase.url,
					serviceRoleKey: this.config.supabase.serviceRoleKey,
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

		// Wait for all image uploads to complete
		await Promise.all(imagePromises);

		if (!isPublic) {
			this.logger.debug({
				event: 'page_marked_unpublished',
				pageId: page.id,
				title: meta.title
			});
		}

		// 7. Build page data
		// Extract custom metadata and merge with cover URL
		const customMeta = this.extractCustomMetadata(page);
		const metaWithCover = coverUrl 
			? { ...customMeta, cover: coverUrl }
			: customMeta;
		
		const pageData: DatabasePage = {
			page_id: page.id,
			datasource_id: this.config.dataSourceId,
			datasource_alias: this.config.alias,
			title: meta.title,
			slug,
			content: processedContent,
			publish_at: publishDate,
			updated_at: page.last_edited_time, // Use Notion's last edited time
			tags: meta.tags.length > 0 ? meta.tags : null,
			authors: meta.authors.length > 0 ? meta.authors : null,
			meta: metaWithCover
		};

		this.logger.info({
			event: 'page_transformed',
			pageId: page.id,
			slug,
			title: meta.title,
			isPublic
		});

		return pageData;
	}

	/**
	 * Check if page should be published (apply isPublicRule)
	 */
	private shouldPublish(page: PageObjectResponse): boolean {
		return this.config.isPublicRule?.(page) ?? true;
	}

	/**
	 * Extract standard metadata (title, tags, authors)
	 */
	private extractMetadata(page: PageObjectResponse): {
		title: string;
		tags: string[];
		authors: string[];
	} {
		// Auto-detect title (type: 'title')
		const title = this.notionClient.getTitleProperty(page);

		// Extract tags (if configured)
		const tags = this.config.tagsProperty
			? this.notionClient.getPropertyValues(page, this.config.tagsProperty)
			: [];

		// Extract authors (if configured)
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
	 * Get publish date (apply publishDateRule)
	 */
	private getPublishDate(page: PageObjectResponse): string | null {
		if (this.config.publishDateRule) {
			return this.config.publishDateRule(page);
		}
		// Default: use last_edited_time
		return page.last_edited_time;
	}

	/**
	 * Extract custom metadata via metadataExtractor
	 */
	private extractCustomMetadata(page: PageObjectResponse): Record<string, any> | null {
		if (!this.config.metadataExtractor) {
			return null;
		}

		try {
			return this.config.metadataExtractor(page);
		} catch (error: any) {
			this.logger.warn({
				event: 'metadata_extractor_failed',
				pageId: page.id,
				error: error?.message
			});
			return null;
		}
	}
}