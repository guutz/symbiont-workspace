import type { PageObjectResponse } from '@notionhq/client';
import type { HydratedDatabaseConfig, Post } from '../../types.js';
import { createSlug } from '../../utils/slug-helpers.js';
import { NotionAdapter } from '../notion/adapter.js';
import { PostRepository } from '../sync/post-repository.js';

export class PostBuilder {
    constructor(
        private config: HydratedDatabaseConfig,
        private notionAdapter: NotionAdapter,
        private postRepository: PostRepository
    ) { }

    async buildPost(page: PageObjectResponse): Promise<Post | null> {
        // 1. Check publishing rules
        if (!this.shouldPublish(page)) return null; // FIXME: Is this intended behavior?

        // 2. Extract metadata
        const meta = this.extractMetadata(page);

        // 3. Resolve slug (handles conflicts, sync-back)
        const slug = await this.resolveSlug(page, meta.title);

        // 4. Get content
        const content = await this.notionAdapter.pageToMarkdown(page.id);

        // 5. Build post data
        return {
            notion_page_id: page.id,
            source_id: this.config.sourceId,
            title: meta.title,
            slug,
            content,
            publish_at: this.getPublishDate(page),
            tags: meta.tags,
            authors: meta.authors,
            metadata: this.extractCustomMetadata(page)
        };
    }

    private shouldPublish(page: PageObjectResponse): boolean {
        return this.config.isPublicRule?.(page) ?? true;
    }

    private extractMetadata(page: PageObjectResponse): { title: string; tags: string[]; authors: string[] } {
        const title = page.properties['Title']?.title?.[0]?.plain_text ?? 'Untitled';  // FIXME: Auto-detect title property
        const tags = this.config.tagsProperty ? this.notionAdapter.getPropertyValues(page, this.config.tagsProperty) : [];
        const authors = this.config.authorsProperty ? this.notionAdapter.getPropertyValues(page, this.config.authorsProperty) : [];
        return { title, tags, authors };
    }

    private async resolveSlug(page: PageObjectResponse, title: string): Promise<string> {
        // 1. Check for custom slug from Notion
        const customSlug = this.config.slugRule?.(page) ?? null;

        // 2. Check if page already exists in DB
        const existingPost = await this.postRepository.getByNotionPageId(
            page.id,
            this.config.sourceId
        );

        // 3. Determine final slug
        let slug: string;

        if (existingPost) {
            // Existing post - handle slug changes
            if (customSlug && customSlug !== existingPost.slug) {
                slug = await this.ensureUniqueSlug(customSlug);
            } else {
                slug = existingPost.slug; // Keep existing
            }
        } else {
            // New post - generate or use custom
            const baseSlug = customSlug || createSlug(title);
            slug = await this.ensureUniqueSlug(baseSlug);
        }

        // 4. Sync back to Notion if configured
        if (this.config.slugSyncProperty) {
            await this.notionAdapter.updateProperty(page.id, this.config.slugSyncProperty, slug);
        }

        return slug;
    }

    private async ensureUniqueSlug(baseSlug: string): Promise<string> {
        const existingPost = await this.postRepository.getBySlug(baseSlug, this.config.sourceId);

        if (!existingPost) return baseSlug;

        // Auto-resolve conflicts: try -2, -3, -4, etc.
        for (let i = 2; i <= 100; i++) {
            const numberedSlug = `${baseSlug}-${i}`;
            const conflict = await this.postRepository.getBySlug(numberedSlug, this.config.sourceId);
            if (!conflict) return numberedSlug;
        }

        // Fallback: use random string
        return `${baseSlug}-${Math.random().toString(36).substring(2, 8)}`;
    }

    private getPublishDate(page: PageObjectResponse): string | null { }
    private extractCustomMetadata(page: PageObjectResponse): Record<string, any> { }
}