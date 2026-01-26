import type { PageObjectResponse } from '@notionhq/client';
import type { DatabaseBlueprint } from '../../types.js';
import type { PostData } from './post-repository.js';
import { createSlug } from '../utils/slug-helpers.js';
import { NotionAdapter } from '../notion/adapter.js';
import { PostRepository } from './post-repository.js';
import { createLogger } from '../utils/logger.js';
import { processMarkdownImages } from '../../image-processor.js';
import { uploadImage } from '../../image-upload.js';
import { markdownToNotionBlocks } from '../notion/markdown-to-notion.js';
import { requireEnvVar } from '../utils/env.server.js';

/**
 * PostBuilder - Business logic for transforming Notion pages into Post data
 * 
 * Responsibilities:
 * - Apply publishing rules (isPublicRule, publishDateRule)
 * - Extract metadata (title, tags, authors, custom metadata)
 * - Resolve slugs (handle conflicts, sync back to Notion)
 * - Orchestrate content fetching
 * 
 * This is where all the sync rules from DatabaseBlueprint are applied.
 */
export class PostBuilder {
	private logger: ReturnType<typeof createLogger>;

	constructor(
		private config: DatabaseBlueprint,
		private notionAdapter: NotionAdapter,
		private postRepository: PostRepository,
	) {
		this.logger = createLogger({
			operation: 'post_builder',
			alias: this.config.alias,
			dataSourceId: this.config.dataSourceId
		});
	}	/**
	 * Build a complete PostData object from a Notion page
	 * 
	 * Always syncs the post to the database, but sets publish_at to null
	 * if the post doesn't pass the isPublicRule. This allows the database
	 * to handle filtering of non-public posts.
	 * 
	 * For non-public posts, slug generation is skipped (slug set to null)
	 * since the post may not be finished yet (including title).
	 */
	async buildPost(page: PageObjectResponse): Promise<PostData | null> {
		this.logger.debug({
			event: 'build_post_started',
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
				const coverProp = page.properties[this.config.coverProperty] as any;
				
				// Handle files property (can be array of files)
				if (coverProp?.type === 'files' && coverProp.files?.length > 0) {
					const file = coverProp.files[0];
					
					// Extract URL based on file type (external vs Notion-hosted)
					if (file.type === 'file') {
						// Notion-hosted file - upload to Nhost (these URLs expire)
						const originalCoverUrl = file.file?.url;
						if (originalCoverUrl) {
							const result = await uploadImage(originalCoverUrl, {
								
								bucketId: 'default',
								pathPrefix: `${page.id}/`
							});
							coverUrl = result.newUrl;
							
							this.logger.info({
								event: 'cover_image_uploaded',
								pageId: page.id,
								originalUrl: originalCoverUrl,
								newUrl: coverUrl,
								fileId: result.fileId
							});
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
		let content = await this.notionAdapter.pageToMarkdown(page.id);

		// 6. Process images in content blocks (upload Notion CDN images to Nhost)
		if (content) {
			try {
				const { markdown: updatedMarkdown, uploaded, failed } = await processMarkdownImages(content, {
					
					bucketId: 'default',
					shouldUpload: (url) => url.includes('notion.so') // Only upload Notion CDN images
				});
				
				const hasImageChanges = updatedMarkdown !== content;
				content = updatedMarkdown;
				
				if (uploaded.length > 0) {
					this.logger.info({
						event: 'content_images_processed',
						pageId: page.id,
						uploadedCount: uploaded.length,
						failedCount: failed.length
					});
				}
				
				if (failed.length > 0) {
					this.logger.warn({
						event: 'some_images_failed',
						pageId: page.id,
						failed: failed.map(f => ({ url: f.originalUrl, error: f.error }))
					});
				}
				
				// Sync updated content back to Notion
				if (hasImageChanges) {
					try {
						const blocks = markdownToNotionBlocks(updatedMarkdown, {
							strictImageUrls: false,
							truncate: true
						});
						
						await this.notionAdapter.updatePageBlocks(page.id, blocks);
						
						this.logger.info({
							event: 'notion_content_synced',
							pageId: page.id,
							blockCount: blocks.length
						});
					} catch (syncError: any) {
						this.logger.warn({
							event: 'notion_sync_failed',
							pageId: page.id,
							error: syncError?.message
						});
						// Don't fail the whole sync if Notion update fails
					}
				}
			} catch (error: any) {
				this.logger.warn({
					event: 'content_image_processing_failed',
					pageId: page.id,
					error: error?.message
				});
			}
		}

		if (!isPublic) {
			this.logger.debug({
				event: 'post_marked_unpublished',
				pageId: page.id,
				title: meta.title
			});
		}

		// 7. Build post data
		// Extract custom metadata and merge with cover URL
		const customMeta = this.extractCustomMetadata(page);
		const metaWithCover = coverUrl 
			? { ...customMeta, cover: coverUrl }
			: customMeta;
		
		const postData: PostData = {
			page_id: page.id,
			datasource_id: this.config.dataSourceId,
			datasource_alias: this.config.alias,
			title: meta.title,
			slug,
			content,
			publish_at: publishDate,
			updated_at: page.last_edited_time, // Use Notion's last edited time
			tags: meta.tags.length > 0 ? meta.tags : null,
			authors: meta.authors.length > 0 ? meta.authors : null,
			meta: metaWithCover
		};

		this.logger.info({
			event: 'post_built',
			pageId: page.id,
			slug,
			title: meta.title,
			isPublic
		});

		return postData;
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
		const title = this.notionAdapter.getTitleProperty(page);

		// Extract tags (if configured)
		const tags = this.config.tagsProperty
			? this.notionAdapter.getPropertyValues(page, this.config.tagsProperty)
			: [];

		// Extract authors (if configured)
		const authors = this.config.authorsProperty
			? this.notionAdapter.getPropertyValues(page, this.config.authorsProperty)
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
		const existingPost = await this.postRepository.getByNotionPageId(
			page.id,
			this.config.dataSourceId
		);

		// 3. Determine final slug
		let slug: string;
		let slugChanged = false;

		if (existingPost && existingPost.slug) {
			// Existing post with slug - handle slug changes
			if (customSlug && customSlug !== existingPost.slug) {
				// User changed slug in Notion - validate uniqueness
				slug = await this.ensureUniqueSlug(customSlug, page.id);
				slugChanged = true;
				this.logger.info({
					event: 'slug_updated',
					pageId: page.id,
					oldSlug: existingPost.slug,
					newSlug: slug
				});
			} else {
				// No change - keep existing slug
				slug = existingPost.slug;
				slugChanged = false;
			}
		} else {
			// New post or existing post without slug - generate or use custom
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
				await this.notionAdapter.updateProperty(page.id, this.config.slugSyncProperty, slug);
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
		const existingPost = await this.postRepository.getBySlug(baseSlug, this.config.dataSourceId);

		// If no conflict, or conflict is with the same page, use base slug
		if (!existingPost || existingPost.page_id === excludePageId) {
			return baseSlug;
		}

		// Auto-resolve conflicts: try -2, -3, -4, etc.
		for (let i = 2; i <= 100; i++) {
			const numberedSlug = `${baseSlug}-${i}`;
			const conflict = await this.postRepository.getBySlug(numberedSlug, this.config.dataSourceId);

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