import type { Hook } from 'symbiont-cms';

/**
 * guutz-blog custom hooks for Symbiont CMS.
 * 
 * **Extractor Pattern:**
 * - Hooks read from `ctx.page` and return values or `null`
 * - No `ctx.data`, no `ctx.skip()` - registry handles composition
 * - Return `null` to let next hook run (for primitives like booleans)
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
export const publishCheckHook: Hook<boolean> = {
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
 * 
 * **Extractor Pattern:**
 * - Returns custom slug if found
 * - Returns `null` if not present (falls through to auto-generation)
 * 
 * Priority: 40 (before default)
 */
export const slugExtractHook: Hook<string | null> = {
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
		
		// No custom slug - return null to fall through to auto-generation
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
