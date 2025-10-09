import type { PageObjectResponse } from '@notionhq/client';
import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { requireEnvVar } from '../utils/env.js';
import { defaultSlugRule } from '../utils/notion-helpers.js';
import { loadConfig } from './load-config.js';
import { createLogger } from '../utils/logger.js';

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
	const logger = createLogger({ 
		operation: 'sync_slug_to_notion',
		pageId: page.id 
	});

	const config = await loadConfig();
	const dbConfig = config.databases.find((db: any) => db.notionDatabaseId === databaseConfigId);
	
	if (!dbConfig) {
		logger.warn({ 
			event: 'database_config_not_found', 
			databaseConfigId 
		});
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
		logger.debug({ 
			event: 'slug_synced_to_notion', 
			property: slugPropertyName,
			old_slug: currentSlug || null,
			new_slug: finalSlug 
		});
	} catch (error: any) {
		logger.warn({ 
			event: 'slug_sync_failed', 
			error: error?.message,
			property: slugPropertyName 
		});
		// Don't throw - slug generation should continue even if Notion update fails
	}
}

/**
 * Convert Notion page content to markdown string
 * 
 * TODO: This needs to become more sophisticated for markdown compatibility:
 * - Handle Notion-specific features (callouts, toggles, databases, etc.)
 * - Normalize markdown to match database schema expectations
 * - Extract and process embedded media (images, files, videos)
 * - Detect content features for database storage (syntax highlighting languages, math, etc.)
 * - Transform Notion URLs to internal slugs/references
 * - Handle custom transformations per database config
 * 
 * See:
 * - `.docs/markdown-compatibility.md` for syntax requirements
 * - `.docs/feature-detection-architecture.md` for feature extraction strategy
 * - `.docs/image-optimization-strategy.md` for media handling (Phase 2)
 */
export async function pageToMarkdown(pageId: string): Promise<string> {
	
	const mdblocks = await n2m.pageToMarkdown(pageId);
	const mdResult = n2m.toMarkdownString(mdblocks);
	return typeof mdResult === 'string' ? mdResult : mdResult?.parent ?? '';
}
