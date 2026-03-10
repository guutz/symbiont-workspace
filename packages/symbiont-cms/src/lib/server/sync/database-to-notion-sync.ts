import type { DatabaseBlueprint } from '../../types.js';
import type { NotionClient } from '../notion/client.js';
import type { DatabasePageCRUD } from '../database/page-crud.js';
import { convertMarkdownToNotionBlocks } from '../notion-md/markdown-to-blocks.js';
import { createLogger } from '../utils/logger.js';

export interface PublishToNotionOptions {
	/** Only log what would happen, don't actually update Notion */
	dryRun?: boolean;
	/** Convert invalid image URLs to text instead of failing (default: false) */
	strictImageUrls?: boolean;
	/** Auto-truncate when exceeding Notion limits (default: true) */
	truncate?: boolean;
}

/**
 * Publish a page from the database to Notion
 * 
 * Reverse sync workflow (DB → Notion):
 * 1. Fetch page from database
 * 2. Convert markdown content to Notion blocks
 * 3. Find corresponding Notion page
 * 4. Update Notion page content
 * 
 * This is a simple orchestration function - all the heavy lifting
 * is done by NotionClient and markdown-to-blocks utilities.
 * 
 * @param pageId - UUID of page in database
 * @param config - Database blueprint for Notion connection
 * @param notionClient - Notion API client
 * @param pageCrud - Database page CRUD operations
 * @param options - Publishing options
 */
export async function publishPostToNotion(
	pageId: string,
	config: DatabaseBlueprint,
	notionClient: NotionClient,
	databaseCrud: DatabasePageCRUD,
	options: PublishToNotionOptions = {}
): Promise<void> {
	const logger = createLogger({ operation: 'publish_page_to_notion' });
	
	logger.info({ 
		event: 'publish_started',
		pageId,
		alias: config.alias,
		dryRun: options.dryRun 
	});

	try {
		// 1. Fetch page from database by Notion page ID
		// (pageId in this context is actually the Notion page UUID)
		const page = await databaseCrud.getByNotionPageId(pageId);
		
		if (!page) {
			throw new Error(`Page not found with notion_page_id: ${pageId}`);
		}

		logger.debug({ 
			event: 'page_fetched',
			pageId,
			slug: page.slug,
			title: page.title
		});

		// 2. Convert markdown to Notion blocks (or use empty blocks if no content)
		// Allow syncing without content to update metadata on unwritten posts
		const blocks = page.content 
			? convertMarkdownToNotionBlocks(page.content, {
					strictImageUrls: options.strictImageUrls,
					truncate: options.truncate,
				})
			: [];

		logger.debug({ 
			event: 'markdown_converted',
			pageId,
			blockCount: blocks.length,
			hasContent: !!page.content
		});

		// 3. Update Notion page
		if (options.dryRun) {
			logger.info({ 
				event: 'dry_run',
				pageId,
				blockCount: blocks.length,
				message: 'Would update Notion page (dry run)'
			});
		} else {
			await notionClient.updatePageBlocks(pageId, blocks);
			
			logger.info({ 
				event: 'publish_completed',
				pageId,
				blockCount: blocks.length 
			});
		}

	} catch (error: any) {
		logger.error({ 
			event: 'publish_failed',
			pageId,
			error: error?.message,
			stack: error?.stack 
		});
		throw error;
	}
}
