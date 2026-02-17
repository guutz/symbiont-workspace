import type { Hook } from './types.js';
import { createSlug } from '../server/utils/slug.js';

/**
 * Default hooks that implement Symbiont's opinionated behavior.
 * These are automatically registered unless overridden by user hooks.
 * 
 * Users can:
 * - Run hooks before defaults (priority < 50)
 * - Replace defaults (priority = 50, different implementation)
 * - Run hooks after defaults (priority > 50)
 */

/**
 * Default hook for checking if a page should be published.
 * By default, all pages are considered publishable.
 * 
 * Priority: 50 (default)
 * 
 * @example Override to only publish pages with specific status
 * {
 *   name: 'custom:publish-check',
 *   event: 'publish:check',
 *   priority: 40,
 *   fn: async (ctx) => ctx.page.properties.Status?.status?.name === 'Published'
 * }
 */
export const defaultPublishCheckHook: Hook<null, boolean> = {
	name: 'symbiont:publish:check:default',
	event: 'publish:check',
	priority: 50,
	fn: async (ctx) => {
		// By default, all pages are publishable
		return true;
	}
};

/**
 * Default hook for determining publish date.
 * Uses Notion's last_edited_time as the publish date.
 * 
 * Priority: 50 (default)
 * 
 * @example Override to use a custom date property
 * {
 *   name: 'custom:publish-date',
 *   event: 'publish:date',
 *   priority: 40,
 *   fn: async (ctx) => {
 *     const dateStr = ctx.page.properties.PublishDate?.date?.start;
 *     return dateStr || ctx.page.last_edited_time;
 *   }
 * }
 */
export const defaultPublishDateHook: Hook<null, string> = {
	name: 'symbiont:publish:date:default',
	event: 'publish:date',
	priority: 50,
	fn: async (ctx) => {
		// Use last edited time as publish date
		return ctx.page.last_edited_time;
	}
};

/**
 * Default hook for extracting custom slug from Notion.
 * Returns null, allowing slug generation from title.
 * 
 * Priority: 50 (default)
 * 
 * @example Override to extract slug from Notion property
 * {
 *   name: 'custom:slug-extract',
 *   event: 'slug:extract',
 *   priority: 40,
 *   fn: async (ctx) => {
 *     const slugProp = ctx.page.properties.Slug?.rich_text;
 *     return slugProp?.[0]?.plain_text?.trim() || null;
 *   }
 * }
 */
export const defaultSlugExtractHook: Hook<null, string | null> = {
	name: 'symbiont:slug:extract:default',
	event: 'slug:extract',
	priority: 50,
	fn: async (ctx) => {
		// By default, no custom slug - will fall through to generation
		return null;
	}
};

/**
 * Default hook for generating slug from title.
 * Uses the createSlug utility to sanitize and format the title.
 * 
 * Priority: 50 (default)
 * 
 * Input: { title: string, customSlug: string | null }
 * Output: string (generated or custom slug)
 */
export const defaultSlugGenerateHook: Hook<
	{ title: string; customSlug: string | null },
	string
> = {
	name: 'symbiont:slug:generate:default',
	event: 'slug:generate',
	priority: 50,
	fn: async (ctx) => {
		// Use custom slug if provided, otherwise generate from title
		if (ctx.data.customSlug) {
			return ctx.data.customSlug;
		}
		return createSlug(ctx.data.title);
	}
};

/**
 * Default hook for extracting page title.
 * This relies on NotionClient.getTitleProperty() which is called
 * externally before hooks are executed.
 * 
 * Priority: 50 (default)
 * 
 * Note: This hook exists for consistency but typically won't be overridden
 * since title extraction is straightforward and handled by NotionClient.
 */
export const defaultTitleExtractHook: Hook<string, string> = {
	name: 'symbiont:metadata:title:default',
	event: 'metadata:title',
	priority: 50,
	fn: async (ctx) => {
		// Title is already extracted - pass through
		return ctx.data;
	}
};

/**
 * Default hook for extracting tags from Notion.
 * Returns empty array if no tags property is configured.
 * 
 * Priority: 50 (default)
 * 
 * Note: Tag extraction is handled by property mapping (tagsProperty).
 * This hook exists for consistency and potential future customization.
 */
export const defaultTagsExtractHook: Hook<string[], string[]> = {
	name: 'symbiont:metadata:tags:default',
	event: 'metadata:tags',
	priority: 50,
	fn: async (ctx) => {
		// Tags are already extracted - pass through
		return ctx.data;
	}
};

/**
 * Default hook for extracting authors from Notion.
 * Returns empty array if no authors property is configured.
 * 
 * Priority: 50 (default)
 * 
 * Note: Author extraction is handled by property mapping (authorsProperty).
 * This hook exists for consistency and potential future customization.
 */
export const defaultAuthorsExtractHook: Hook<string[], string[]> = {
	name: 'symbiont:metadata:authors:default',
	event: 'metadata:authors',
	priority: 50,
	fn: async (ctx) => {
		// Authors are already extracted - pass through
		return ctx.data;
	}
};

/**
 * Default hook for extracting summary from Notion.
 * Returns empty string if no summary property is configured.
 * 
 * Priority: 50 (default)
 * 
 * Note: Summary extraction is handled by property mapping (summaryProperty).
 * This hook exists for consistency and potential future customization.
 */
export const defaultSummaryExtractHook: Hook<string, string> = {
	name: 'symbiont:metadata:summary:default',
	event: 'metadata:summary',
	priority: 50,
	fn: async (ctx) => {
		// Summary is already extracted - pass through
		return ctx.data;
	}
};

/**
 * Default hook for extracting custom metadata.
 * Returns empty object by default.
 * 
 * Priority: 50 (default)
 * 
 * @example Add custom metadata
 * {
 *   name: 'custom:metadata',
 *   event: 'metadata:custom',
 *   priority: 50,
 *   fn: async (ctx) => ({
 *     ...ctx.data,
 *     layout: ctx.page.properties.Layout?.select?.name || 'default',
 *     featured: ctx.page.properties.Featured?.checkbox || false
 *   })
 * }
 */
export const defaultCustomMetadataHook: Hook<Record<string, any>, Record<string, any>> = {
	name: 'symbiont:metadata:custom:default',
	event: 'metadata:custom',
	priority: 50,
	fn: async (ctx) => {
		// Return current data (allows composition with other hooks)
		return ctx.data || {};
	}
};

/**
 * Default hook for excluding pages from sync.
 * By default, no pages are excluded.
 * 
 * Priority: 50 (default)
 * 
 * @example Exclude pages with specific tag
 * {
 *   name: 'custom:exclude',
 *   event: 'page:exclude',
 *   priority: 40,
 *   fn: async (ctx) => {
 *     const tags = ctx.page.properties.Tags?.multi_select;
 *     return tags?.some(tag => tag.name === 'Draft') || false;
 *   }
 * }
 */
export const defaultPageExcludeHook: Hook<null, boolean> = {
	name: 'symbiont:page:exclude:default',
	event: 'page:exclude',
	priority: 50,
	fn: async (ctx) => {
		// By default, don't exclude any pages
		return false;
	}
};

/**
 * All default hooks in one array for easy registration.
 * These are automatically registered when creating a Symbiont client.
 */
export const defaultHooks: Hook[] = [
	defaultPublishCheckHook,
	defaultPublishDateHook,
	defaultSlugExtractHook,
	defaultSlugGenerateHook,
	defaultTitleExtractHook,
	defaultTagsExtractHook,
	defaultAuthorsExtractHook,
	defaultSummaryExtractHook,
	defaultCustomMetadataHook,
	defaultPageExcludeHook
];
