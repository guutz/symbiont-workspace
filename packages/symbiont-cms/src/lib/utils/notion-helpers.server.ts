import type { PageObjectResponse } from '@notionhq/client';
import type { HydratedDatabaseConfig } from '../types.js';

export const getMeta = (page: PageObjectResponse, config: HydratedDatabaseConfig): 
	{ 
		tags: string[]; 
		authors: string[];
		title: string;
		coverImageURI: string | null;
		shortPostID: string | null;
		publishDate: string | null;
	} => {
	const tagsPropertyName = config.tagsPropertyName || 'Tags';
	const tagsProperty = page.properties[tagsPropertyName] as any;

	const authorsPropertyName = config.authorsPropertyName || 'Authors';
	const authorsProperty = page.properties[authorsPropertyName] as any;

	const titlePropertyName = config.titlePropertyName || 'Name';
	const titleProperty = page.properties[titlePropertyName] as any;

	const coverImagePropertyName = config.coverImagePropertyName || 'Cover Image';
	const coverImageProperty = page.properties[coverImagePropertyName] as any;

	return {
		authors: authorsProperty && Array.isArray(authorsProperty.multi_select)
			? authorsProperty.multi_select.map((tag: { name: string }) => tag.name)
			: [],
		tags: tagsProperty && Array.isArray(tagsProperty.multi_select)
			? tagsProperty.multi_select.map((tag: { name: string }) => tag.name)
			: [],
		title: titleProperty?.title?.[0]?.plain_text ?? 'Untitled',
		coverImageURI: coverImageProperty?.files?.[0]?.file?.url || null,
		shortPostID: getShortPostID(page),
		publishDate: getPublishDate(page, config)
	};
}


/**
 * Extract page title from Notion page properties
 */
export const getTitle = (page: PageObjectResponse): string => 
	(page.properties.Name as any).title?.[0]?.plain_text ?? 'Untitled';

/**
 * Extract authors from Notion page properties
 */
export const getAuthors = (page: PageObjectResponse): string[] => {
	const authorsProperty = page.properties.Authors as any;
	if (!authorsProperty || !Array.isArray(authorsProperty.multi_select)) {
		return [];
	}
	return authorsProperty.multi_select.map((tag: { name: string }) => tag.name);
};

/**
 * Extract short ID from Notion page properties (with optional prefix)
 */
export const getShortPostID = (page: PageObjectResponse): string | null => {
	const { prefix, number } = (page.properties['ID'] as any)?.unique_id || {};
	return prefix ? `${prefix}-${number}` : number ? String(number) : null;
};

/**
 * Extract tags from Notion page properties
 */
export const getTags = (page: PageObjectResponse): string[] => 
	((page.properties.Tags as any)?.multi_select ?? []).map((tag: { name: string }) => tag.name);

/**
 * Get publish date based on config rules
 * 
 * Uses complementary rules that work together:
 * 1. isPublicRule (optional): Boolean gate - must return true to publish
 *    - Default: () => true (all pages pass)
 * 2. publishDateRule (optional): Date extraction - provides the publish date
 *    - Default: uses page.last_edited_time (always present in Notion)
 * 
 * Both rules must pass for a page to be published:
 * - isPublicRule must return true (or be undefined = default true)
 * - publishDateRule must return non-null date (or be undefined = use default)
 */
export const getPublishDate = (page: PageObjectResponse, config: HydratedDatabaseConfig): string | null => {
	// Step 1: Check the boolean gate (default: allow all)
	const isPublic = config.isPublicRule ? config.isPublicRule(page) : true;
	
	// If the gate is closed, don't publish
	if (!isPublic) {
		return null;
	}
	
	// Step 2: Extract the publish date (default: page.last_edited_time)
	if (config.publishDateRule) {
		return config.publishDateRule(page);
	}
	
	// Default date extraction: use Notion's last_edited_time (always present)
	return page.last_edited_time;
};

/**
 * Default slug rule function that reads from the Slug property
 */
export const defaultSlugRule = (page: PageObjectResponse): string | null => 
	(page.properties.Slug as any)?.rich_text?.[0]?.plain_text?.trim() || null;

/**
 * Build lookup maps from posts array for efficient slug/page checking
 */
export const buildPostLookups = (posts: Array<{ id: string; notion_page_id: string; slug: string }>) => {
	const byPageId = new Map(posts.map(p => [p.notion_page_id, { id: p.id, slug: p.slug }]));
	const slugs = new Set(posts.map(p => p.slug));
	return { byPageId, slugs };
};
