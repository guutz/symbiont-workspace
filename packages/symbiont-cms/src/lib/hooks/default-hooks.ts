import type { Hook } from './types.js';
import { createSlug } from '../server/utils/slug.js';

/**
 * Default hooks that implement Symbiont's opinionated behavior.
 * These are automatically registered unless overridden by user hooks.
 * 
 * **Extractor Pattern:**
 * - Hooks read from `ctx.page` and return values or `null`
 * - No `ctx.data`, no `ctx.skip()` - registry handles composition
 * - Return `null` to let next hook run (for primitives)
 * - Objects and arrays are auto-merged by registry
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
 * ```typescript
 * {
 *   name: 'custom:publish-check',
 *   event: 'publish:check',
 *   priority: 40,
 *   fn: async (ctx) => ctx.page.properties.Status?.status?.name === 'Published'
 * }
 * ```
 */
export const defaultPublishCheckHook: Hook<boolean> = {
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
 * ```typescript
 * {
 *   name: 'custom:publish-date',
 *   event: 'publish:date',
 *   priority: 40,
 *   fn: async (ctx) => {
 *     const dateStr = ctx.page.properties.PublishDate?.date?.start;
 *     return dateStr || null; // Falls through to default if null
 *   }
 * }
 * ```
 */
export const defaultPublishDateHook: Hook<string> = {
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
 * Returns null by default, allowing slug generation from title.
 * 
 * Priority: 50 (default)
 * 
 * @example Override to extract slug from Notion property
 * ```typescript
 * {
 *   name: 'custom:slug-extract',
 *   event: 'slug:extract',
 *   priority: 40,
 *   fn: async (ctx) => {
 *     const slugProp = ctx.page.properties.Slug?.rich_text;
 *     return slugProp?.[0]?.plain_text?.trim() || null;
 *   }
 * }
 * ```
 */
export const defaultSlugExtractHook: Hook<string | null> = {
	name: 'symbiont:slug:extract:default',
	event: 'slug:extract',
	priority: 50,
	fn: async (ctx) => {
		// By default, no custom slug - returns null
		return null;
	}
};

/**
 * Default hook for generating slug from title.
 * 
 * This hook expects that title has already been extracted elsewhere
 * (typically by NotionClient.getTitleProperty()).
 * 
 * Note: This hook is called AFTER slug:extract. If a custom slug was found,
 * this hook should use it. Otherwise, generate from title.
 * 
 * **MIGRATION NOTE**: In the new extractor pattern, this hook needs to
 * extract the title directly from ctx.page since there's no ctx.data.
 * The page transformer will need to be updated to handle this differently,
 * potentially splitting slug generation into a separate step.
 * 
 * Priority: 50 (default)
 */
export const defaultSlugGenerateHook: Hook<string> = {
	name: 'symbiont:slug:generate:default',
	event: 'slug:generate',
	priority: 50,
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
 * Default hook for extracting page title.
 * 
 * **MIGRATION NOTE**: In the old transformer pattern, title was extracted
 * before hooks ran and passed via ctx.data. In the new extractor pattern,
 * hooks extract directly from ctx.page.
 * 
 * Priority: 50 (default)
 */
export const defaultTitleExtractHook: Hook<string> = {
	name: 'symbiont:metadata:title:default',
	event: 'metadata:title',
	priority: 50,
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
 * Returns empty array if no tags configured.
 * 
 * **MIGRATION NOTE**: Tags are extracted from the property specified in
 * config.tagsProperty. The page transformer will need to pass this info
 * or hooks need to read from config directly.
 * 
 * Priority: 50 (default)
 */
export const defaultTagsExtractHook: Hook<string[]> = {
	name: 'symbiont:metadata:tags:default',
	event: 'metadata:tags',
	priority: 50,
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
 * Returns empty array if no authors configured.
 * 
 * Priority: 50 (default)
 */
export const defaultAuthorsExtractHook: Hook<string[]> = {
	name: 'symbiont:metadata:authors:default',
	event: 'metadata:authors',
	priority: 50,
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
 * Returns empty string if no summary configured.
 * 
 * Priority: 50 (default)
 */
export const defaultSummaryExtractHook: Hook<string> = {
	name: 'symbiont:metadata:summary:default',
	event: 'metadata:summary',
	priority: 50,
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
 * Priority: 50 (default)
 * 
 * @example Add custom metadata
 * ```typescript
 * {
 *   name: 'custom:metadata',
 *   event: 'metadata:custom',
 *   priority: 50,
 *   fn: async (ctx) => ({
 *     layout: ctx.page.properties.Layout?.select?.name || 'default',
 *     featured: ctx.page.properties.Featured?.checkbox || false
 *   })
 * }
 * ```
 */
export const defaultCustomMetadataHook: Hook<Record<string, any>> = {
	name: 'symbiont:metadata:custom:default',
	event: 'metadata:custom',
	priority: 50,
	fn: async (ctx) => {
		// Return empty object (other hooks can add fields, will be auto-merged)
		return {};
	}
};

/**
 * Default hook for excluding pages from sync.
 * By default, no pages are excluded.
 * 
 * Priority: 50 (default)
 * 
 * @example Exclude pages with specific tag
 * ```typescript
 * {
 *   name: 'custom:exclude',
 *   event: 'page:exclude',
 *   priority: 40,
 *   fn: async (ctx) => {
 *     const tags = ctx.page.properties.Tags?.multi_select;
 *     return tags?.some(tag => tag.name === 'Draft') || false;
 *   }
 * }
 * ```
 */
export const defaultPageExcludeHook: Hook<boolean> = {
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
