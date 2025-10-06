import type { PageObjectResponse } from '@notionhq/client';
import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { requireEnvVar } from '../utils/env.js';
import { defaultSlugRule } from '../utils/notion-helpers.js';
import { loadConfig } from './load-config.js';

// Initialize Notion clients
const NOTION_API_KEY = requireEnvVar('NOTION_API_KEY', 'Set NOTION_API_KEY in your environment.');

export const notion = new Client({ auth: NOTION_API_KEY });
export const n2m = new NotionToMarkdown({ notionClient: notion });

/**
 * Syncs the slug to Notion if it differs from what's currently in the page property.
 * Always keeps Notion in sync with the database slug.
 */
export async function syncSlugToNotion(
	page: PageObjectResponse,
	databaseConfigId: string,
	finalSlug: string
): Promise<void> {

	const config = await loadConfig();
	const dbConfig = config.databases.find((db: any) => db.notionDatabaseId === databaseConfigId);
	
	if (!dbConfig) {
		console.warn(`[symbiont] Could not find database config '${databaseConfigId}' for slug sync`);
		return;
	}

	const slugPropertyName = dbConfig.slugPropertyName || 'Slug';
	const slugRule = dbConfig.slugRule || defaultSlugRule;
	const currentSlug = slugRule(page);

	// Only update if Notion slug differs from final slug
	if (currentSlug === finalSlug) {
		return;
	}

	try {
		await notion.pages.update({
			page_id: page.id,
			properties: {
				[slugPropertyName]: {
					rich_text: [
						{
							type: 'text',
							text: { content: finalSlug }
						}
					]
				}
			}
		});
		console.log(`[symbiont] Synced Notion page ${page.id} property '${slugPropertyName}': '${currentSlug || '(empty)'}' → '${finalSlug}'`);
	} catch (error) {
		console.warn(`[symbiont] Failed to sync slug to Notion page ${page.id}:`, error);
		// Don't throw - slug generation should continue even if Notion update fails
	}
}

/**
 * Convert Notion page content to markdown string
 */
export async function pageToMarkdown(pageId: string): Promise<string> {
	
	const mdblocks = await n2m.pageToMarkdown(pageId);
	const mdResult = n2m.toMarkdownString(mdblocks);
	return typeof mdResult === 'string' ? mdResult : mdResult?.parent ?? '';
}
