import type { Hook } from './types.js';
import { createSlug } from '../server/utils/slug.js';
import { uploadImageToSupabase, needsUploadToSupabase } from '../server/bucket/image-upload.js';
import { convertMarkdownToNotionBlocks } from '../server/notion/markdown-to-blocks.js';

/**
 * Default hooks that implement Symbiont's opinionated behavior.
 * 
 * Hooks use named priorities:
 * - No priority: Default level (runs with Symbiont's built-in hooks)
 * - 'override': Runs before defaults (wins for first-wins events)
 * - 'fallback': Runs after defaults (only if defaults return null)
 * 
 * Registry composes results based on event's composition strategy.
 */

/**
 * Default hook for excluding pages from sync.
 * By default, no pages are excluded.
 * 
 * Composition: or-all (exclude if any hook returns true)
 */
export const defaultPageExcludeHook: Hook<boolean> = {
	name: 'symbiont:page:exclude:default',
	event: 'page:exclude',
	fn: async (ctx) => {
		// By default, don't exclude any pages
		return false;
	}
};

/**
 * Default hook for validating page data.
 * By default, all pages are considered valid.
 * 
 * Composition: and-all (valid only if all hooks pass)
 */
export const defaultPageValidateHook: Hook<boolean> = {
	name: 'symbiont:page:validate:default',
	event: 'page:validate',
	fn: async (ctx) => {
		// By default, all pages are valid
		return true;
	}
};

/**
 * Default hook for extracting page title.
 * 
 * Composition: first-wins
 */
export const defaultTitleExtractHook: Hook<string> = {
	name: 'symbiont:metadata:title:default',
	event: 'metadata:title',
	fn: async (ctx) => {
		// Extract title from Notion page
		const titleProp = ctx.page.properties.Title || ctx.page.properties.Name;
		
		if (titleProp && 'title' in titleProp) {
			// @ts-ignore - Notion types are complex
			return titleProp.title?.[0]?.plain_text || 'Untitled';
		}
		
		return 'Untitled';
	}
};

/**
 * Default hook for extracting tags from Notion.
 * 
 * Composition: collect (arrays concatenated)
 */
export const defaultTagsExtractHook: Hook<string[]> = {
	name: 'symbiont:metadata:tags:default',
	event: 'metadata:tags',
	fn: async (ctx) => {
		// Extract tags from configured property
		const tagsProperty = ctx.config.tagsProperty;
		if (!tagsProperty) {
			return [];
		}
		
		const tagsProp = ctx.page.properties[tagsProperty];
		if (tagsProp && 'multi_select' in tagsProp) {
			// @ts-ignore - Notion types are complex
			return tagsProp.multi_select?.map((tag: any) => tag.name) || [];
		}
		
		return [];
	}
};

/**
 * Default hook for extracting authors from Notion.
 * 
 * Composition: collect (arrays concatenated)
 */
export const defaultAuthorsExtractHook: Hook<string[]> = {
	name: 'symbiont:metadata:authors:default',
	event: 'metadata:authors',
	fn: async (ctx) => {
		// Extract authors from configured property
		const authorsProperty = ctx.config.authorsProperty;
		if (!authorsProperty) {
			return [];
		}
		
		const authorsProp = ctx.page.properties[authorsProperty];
		
		// Handle people property
		if (authorsProp && 'people' in authorsProp) {
			// @ts-ignore - Notion types are complex
			return authorsProp.people?.map((person: any) => person.name || person.id) || [];
		}
		
		// Handle multi_select property
		if (authorsProp && 'multi_select' in authorsProp) {
			// @ts-ignore - Notion types are complex
			return authorsProp.multi_select?.map((tag: any) => tag.name) || [];
		}
		
		return [];
	}
};

/**
 * Default hook for extracting summary from Notion.
 * 
 * Composition: first-wins
 */
export const defaultSummaryExtractHook: Hook<string> = {
	name: 'symbiont:metadata:summary:default',
	event: 'metadata:summary',
	fn: async (ctx) => {
		// Extract summary from configured property
		const summaryProperty = ctx.config.summaryProperty;
		if (!summaryProperty) {
			return '';
		}
		
		const summaryProp = ctx.page.properties[summaryProperty];
		
		// Handle rich_text property
		if (summaryProp && 'rich_text' in summaryProp) {
			// @ts-ignore - Notion types are complex
			const richText = summaryProp.rich_text;
			return richText?.map((rt: any) => rt.plain_text).join('') || '';
		}
		
		return '';
	}
};

/**
 * Default hook for extracting custom metadata.
 * Returns empty object by default.
 * 
 * Composition: collect (objects merged)
 */
export const defaultCustomMetadataHook: Hook<Record<string, any>> = {
	name: 'symbiont:metadata:custom:default',
	event: 'metadata:custom',
	fn: async (ctx) => {
		// Return empty object (other hooks can add fields, will be auto-merged)
		return {};
	}
};

/**
 * Default hook for checking if a page should be published.
 * By default, all pages are publishable.
 * 
 * Composition: and-all (publish only if all hooks agree)
 */
export const defaultPublishCheckHook: Hook<boolean> = {
	name: 'symbiont:publish:check:default',
	event: 'publish:check',
	fn: async (ctx) => {
		// By default, all pages are publishable
		return true;
	}
};

/**
 * Default hook for determining publish date.
 * Uses Notion's last_edited_time as the publish date.
 * 
 * Composition: first-wins
 */
export const defaultPublishDateHook: Hook<string> = {
	name: 'symbiont:publish:date:default',
	event: 'publish:date',
	fn: async (ctx) => {
		// Use last edited time as publish date
		return ctx.page.last_edited_time;
	}
};

/**
 * Default hook for extracting custom slug from Notion.
 * Returns null by default, allowing slug generation from title.
 * 
 * Composition: first-wins
 */
export const defaultSlugExtractHook: Hook<string | null> = {
	name: 'symbiont:slug:extract:default',
	event: 'slug:extract',
	fn: async (ctx) => {
		// By default, no custom slug - returns null
		return null;
	}
};

/**
 * Default hook for generating slug from title.
 * 
 * Composition: first-wins
 */
export const defaultSlugGenerateHook: Hook<string> = {
	name: 'symbiont:slug:generate:default',
	event: 'slug:generate',
	fn: async (ctx) => {
		// Extract title from Notion page
		// Title property is typically 'Title' or 'Name'
		const titleProp = ctx.page.properties.Title || ctx.page.properties.Name;
		
		let title = 'untitled';
		if (titleProp && 'title' in titleProp) {
			// @ts-ignore - Notion types are complex
			title = titleProp.title?.[0]?.plain_text || 'untitled';
		}
		
		return createSlug(title);
	}
};

/**
 * Default hook for validating slug uniqueness.
 * By default, returns true (no validation).
 * 
 * Composition: and-all
 * 
 * Note: Slug uniqueness validation is currently handled in transformer's
 * ensureUniqueSlug() method. This hook is for additional custom validation.
 */
export const defaultSlugValidateHook: Hook<boolean> = {
	name: 'symbiont:slug:validate:default',
	event: 'slug:validate',
	fn: async (ctx) => {
		// No additional validation by default
		return true;
	}
};

/**
 * Default hook for transforming/sanitizing slugs.
 * By default, returns null (no transformation).
 * 
 * Composition: first-wins
 */
export const defaultSlugTransformHook: Hook<string | null> = {
	name: 'symbiont:slug:transform:default',
	event: 'slug:transform',
	fn: async (ctx) => {
		// No additional transformation
		return null;
	}
};

/**
 * Default hook for fetching page content.
 * By default, returns null (content fetched by transformer via NotionClient).
 * 
 * Composition: first-wins
 */
export const defaultContentFetchHook: Hook<string | null> = {
	name: 'symbiont:content:fetch:default',
	event: 'content:fetch',
	fn: async (ctx) => {
		// Content is fetched by transformer; this is a placeholder for custom sources
		return null;
	}
};

/**
 * Default hook for transforming content.
 * Returns input as-is (pass-through).
 * 
 * Composition: first-wins
 * 
 * Users can add 'override' hooks to strip/rewrite content.
 */
export const defaultContentTransformHook: Hook<string> = {
	name: 'symbiont:content:transform:default',
	event: 'content:transform',
	fn: async (ctx) => {
		return (ctx.input as string) || '';
	}
};

/**
 * Default hook for processing inline images in content.
 * Finds image URLs in markdown, uploads to Supabase, returns updated markdown.
 * 
 * Composition: run-all
 */
export const defaultContentImagesHook: Hook<string> = {
	name: 'symbiont:content:images:default',
	event: 'content:images',
	fn: async (ctx) => {
		const content = (ctx.input as string) || '';
		if (!ctx.services.supabase || !content) return content;

		let processed = content;
		const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
		const uploads: Promise<void>[] = [];
		let match: RegExpExecArray | null;

		while ((match = imageRegex.exec(content)) !== null) {
			const [full, alt, url] = match;
			if (!needsUploadToSupabase(url)) continue;

			uploads.push(
				uploadImageToSupabase(url, { 
					supabase: ctx.services.supabase, 
					pageId: ctx.page.id, 
					altText: alt 
				})
					.then(({ newUrl }) => { 
						processed = processed.replace(full, `![${alt}](${newUrl})`); 
					})
					.catch((err) => ctx.logger.warn({ 
						event: 'content_image_upload_failed', 
						url, 
						error: err.message 
					}))
			);
		}

		await Promise.all(uploads);
		return processed;
	}
};

/**
 * Default hook for extracting cover image URL.
 * Checks the configured cover property for file/external URLs.
 * 
 * Composition: first-wins
 */
export const defaultCoverExtractHook: Hook<string | null> = {
	name: 'symbiont:cover:extract:default',
	event: 'cover:extract',
	fn: async (ctx) => {
		// No cover property configured
		if (!ctx.config.coverProperty) {
			return null;
		}

		const coverProp = ctx.page.properties[ctx.config.coverProperty];
		
		// No cover image in property
		if (coverProp?.type !== 'files' || coverProp.files.length === 0) {
			return null;
		}

		const file = coverProp.files[0];
		
		// Handle Notion-hosted files
		if (file.type === 'file') {
			return file.file?.url || null;
		}
		
		// Handle external files
		if (file.type === 'external') {
			return file.external?.url || null;
		}

		return null;
	}
};

/**
 * Default hook for processing cover image.
 * Uploads cover URL to Supabase, returns permanent URL.
 * 
 * Composition: run-all
 * 
 * ctx.input is the raw URL returned by cover:extract
 */
export const defaultCoverProcessHook: Hook<string | null> = {
	name: 'symbiont:cover:process:default',
	event: 'cover:process',
	fn: async (ctx) => {
		const url = ctx.input as string | null;
		if (!url || !ctx.services.supabase) return url;
		if (!needsUploadToSupabase(url)) return url;

		const { newUrl } = await uploadImageToSupabase(url, {
			supabase: ctx.services.supabase,
			pageId: ctx.page.id
		});

		// Sync permanent URL back to Notion
		if (ctx.config.coverProperty && ctx.services.notionClient) {
			await ctx.services.notionClient.updateFileProperty(
				ctx.page.id, 
				ctx.config.coverProperty, 
				newUrl
			);
		}

		return newUrl;
	}
};

/**
 * Default hook for syncing slug back to Notion.
 * Writes final slug to the configured Notion property.
 * 
 * Composition: run-all
 */
export const defaultSyncSlugHook: Hook<void> = {
	name: 'symbiont:sync:slug:default',
	event: 'sync:slug',
	fn: async (ctx) => {
		const slug = ctx.input as string;
		if (!ctx.services.notionClient || !ctx.config.slugSyncProperty || !slug) return;
		
		await ctx.services.notionClient.updateProperty(
			ctx.page.id, 
			ctx.config.slugSyncProperty, 
			slug
		);
	}
};

/**
 * Default hook for syncing content back to Notion.
 * Writes Supabase-URL-replaced markdown back to Notion as blocks.
 * 
 * Composition: run-all
 */
export const defaultSyncContentHook: Hook<void> = {
	name: 'symbiont:sync:content:default',
	event: 'sync:content',
	fn: async (ctx) => {
		const content = ctx.input as string;
		if (!ctx.services.notionClient || !content) return;

		const blocks = convertMarkdownToNotionBlocks(content, {
			strictImageUrls: false,
			truncate: true,
			onLimitExceeded: (err) => ctx.logger.warn({ 
				event: 'notion_content_limit_exceeded', 
				error: err.message 
			})
		});
		
		await ctx.services.notionClient.updatePageBlocks(ctx.page.id, blocks);
	}
};

/**
 * Default hook for syncing image URLs back to Notion.
 * No-op by default (covered by sync:content for inline images and cover:process for cover).
 * 
 * Composition: run-all
 * 
 * Keeping the event for user extensibility (e.g., syncing image captions).
 */
export const defaultSyncImagesHook: Hook<void> = {
	name: 'symbiont:sync:images:default',
	event: 'sync:images',
	fn: async (_ctx) => {
		// No-op - images are synced via content:images and cover:process
	}
};

/**
 * All default hooks in one array for easy registration.
 */
export const defaultHooks: Hook[] = [
	defaultPageExcludeHook,
	defaultPageValidateHook,
	defaultTitleExtractHook,
	defaultTagsExtractHook,
	defaultAuthorsExtractHook,
	defaultSummaryExtractHook,
	defaultCustomMetadataHook,
	defaultPublishCheckHook,
	defaultPublishDateHook,
	defaultSlugExtractHook,
	defaultSlugGenerateHook,
	defaultSlugValidateHook,
	defaultSlugTransformHook,
	defaultContentFetchHook,
	defaultContentTransformHook,
	defaultContentImagesHook,
	defaultCoverExtractHook,
	defaultCoverProcessHook,
	defaultSyncSlugHook,
	defaultSyncContentHook,
	defaultSyncImagesHook
];
