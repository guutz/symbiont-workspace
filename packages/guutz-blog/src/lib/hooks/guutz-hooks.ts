import type { Hook } from 'symbiont-cms';

/**
 * guutz-blog custom hooks for Symbiont CMS.
 * 
 * These hooks customize page processing for the guutz-blog:
 * - Only publish pages with "LIVE" tag
 * - Extract custom slug from Slug property
 */

/**
 * Check if page should be published based on LIVE tag.
 * Only pages tagged with "LIVE" are published.
 * 
 * Priority: 40 (before default)
 */
export const publishCheckHook: Hook<null, boolean> = {
	name: 'guutz:publish:check:live-tag',
	event: 'publish:check',
	priority: 40,
	fn: async (ctx) => {
		// @ts-ignore - Notion types are complex, this is safe at runtime
		const tags = ctx.page.properties.Tags?.multi_select;
		
		// Check if page has LIVE tag
		// @ts-ignore
		const hasLiveTag = tags?.some((tag: any) => tag.name === 'LIVE') ?? false;

		if (!hasLiveTag) {
			ctx.logger.debug({
				event: 'publish_check_failed',
				pageId: ctx.page.id,
				reason: 'Missing LIVE tag'
			});
		}

		return hasLiveTag;
	}
};

/**
 * Extract custom slug from Slug property.
 * If not present, fall back to auto-generation from title.
 * 
 * Priority: 40 (before default)
 */
export const slugExtractHook: Hook<null, string | null> = {
	name: 'guutz:slug:extract',
	event: 'slug:extract',
	priority: 40,
	fn: async (ctx) => {
		// @ts-ignore - Notion types are complex, this is safe at runtime
		const slugProperty = ctx.page.properties.Slug?.rich_text;
		
		if (slugProperty && slugProperty.length > 0) {
			const customSlug = slugProperty[0]?.plain_text?.trim() || null;
			
			if (customSlug) {
				ctx.logger.debug({
					event: 'slug_extracted_from_property',
					pageId: ctx.page.id,
					slug: customSlug
				});
			}
			
			return customSlug;
		}
		
		// No custom slug - fall through to auto-generation
		return null;
	}
};

/**
 * All guutz-blog hooks in one array.
 * Export this and register it in your symbiont.ts config.
 */
export const guutzHooks: Hook[] = [
	publishCheckHook,
	slugExtractHook
];
