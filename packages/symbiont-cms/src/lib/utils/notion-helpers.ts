import type { PageObjectResponse } from '@notionhq/client';
import type { HydratedDatabaseConfig } from '../types.js';

/**
 * Extract page title from Notion page properties
 */
export const getTitle = (page: PageObjectResponse): string => 
	(page.properties.Name as any).title?.[0]?.plain_text ?? 'Untitled';

/**
 * Extract short ID from Notion page properties (with optional prefix)
 */
export const getShortId = (page: PageObjectResponse): string | null => {
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
 */
export const getPublishDate = (page: PageObjectResponse, config: HydratedDatabaseConfig): string | null => 
	config.isPublicRule(page) 
		? (page.properties['Publish Date'] as any)?.date?.start ?? new Date().toISOString()
		: null;

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
