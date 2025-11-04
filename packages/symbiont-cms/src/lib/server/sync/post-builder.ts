import type { PageObjectResponse } from '@notionhq/client';
import type { DatabaseBlueprint } from '../../types.js';
import type { PostData } from './post-repository.js';
import { createSlug } from '../../utils/slug-helpers.js';
import { NotionAdapter } from '../notion/adapter.js';
import { PostRepository } from './post-repository.js';
import { createLogger } from '../../utils/logger.js';

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
	private postRepository: PostRepository
) {
	this.logger = createLogger({ 
		operation: 'post_builder',
		alias: this.config.alias,
		dataSourceId: this.config.dataSourceId 
	});
}	/**
	 * Build a complete PostData object from a Notion page
	 * Returns null if the page should not be published
	 */
	async buildPost(page: PageObjectResponse): Promise<PostData | null> {
		this.logger.debug({ 
			event: 'build_post_started', 
			pageId: page.id 
		});

		// 1. Check publishing rules
		if (!this.shouldPublish(page)) {
			this.logger.debug({ 
				event: 'post_skipped_not_public', 
				pageId: page.id 
			});
			return null;
		}

		// 2. Extract metadata
		const meta = this.extractMetadata(page);

		// 3. Resolve slug (handles conflicts, sync-back)
		const slug = await this.resolveSlug(page, meta.title);

		// 4. Get content
		const content = await this.notionAdapter.pageToMarkdown(page.id);

		// 5. Build post data
		const postData: PostData = {
			page_id: page.id,
			datasource_id: this.config.dataSourceId,
			title: meta.title,
			slug,
			content,
			publish_at: this.getPublishDate(page),
			updated_at: page.last_edited_time, // Use Notion's last edited time
			tags: meta.tags.length > 0 ? meta.tags : null,
			authors: meta.authors.length > 0 ? meta.authors : null,
			meta: this.extractCustomMetadata(page)
		};

		this.logger.info({ 
			event: 'post_built', 
			pageId: page.id,
			slug,
			title: meta.title 
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
	);		// 3. Determine final slug
		let slug: string;

		if (existingPost) {
			// Existing post - handle slug changes
			if (customSlug && customSlug !== existingPost.slug) {
				// User changed slug in Notion - validate uniqueness
				slug = await this.ensureUniqueSlug(customSlug, page.id);
				this.logger.info({ 
					event: 'slug_updated', 
					pageId: page.id,
					oldSlug: existingPost.slug,
					newSlug: slug 
				});
			} else {
				// No change - keep existing slug
				slug = existingPost.slug;
			}
		} else {
			// New post - generate or use custom
			const baseSlug = customSlug || createSlug(title);
			slug = await this.ensureUniqueSlug(baseSlug);
			this.logger.info({ 
				event: 'slug_generated', 
				pageId: page.id,
				slug 
			});
		}

		// 4. Sync back to Notion if configured
		if (this.config.slugSyncProperty) {
			await this.notionAdapter.updateProperty(page.id, this.config.slugSyncProperty, slug);
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