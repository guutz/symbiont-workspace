import type { DatabaseBlueprint } from '../../types.js';
import type { NotionAdapter } from '../notion/adapter.js';
import type { PostRepository } from './post-repository.js';
import { markdownToNotionBlocks } from '../notion/markdown-to-notion.js';
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
 * Publish a post from the database to Notion
 * 
 * Reverse sync workflow (DB → Notion):
 * 1. Fetch post from database
 * 2. Convert markdown content to Notion blocks
 * 3. Find corresponding Notion page
 * 4. Update Notion page content
 * 
 * This is a simple orchestration function - all the heavy lifting
 * is done by NotionAdapter and markdown-to-notion utilities.
 * 
 * @param postId - UUID of post in database
 * @param config - Database blueprint for Notion connection
 * @param notionAdapter - Notion API adapter
 * @param postRepository - Database repository
 * @param options - Publishing options
 */
export async function publishPostToNotion(
	postId: string,
	config: DatabaseBlueprint,
	notionAdapter: NotionAdapter,
	postRepository: PostRepository,
	options: PublishToNotionOptions = {}
): Promise<void> {
	const logger = createLogger({ operation: 'publish_to_notion' });
	
	logger.info({ 
		event: 'publish_started',
		postId,
		alias: config.alias,
		dryRun: options.dryRun 
	});

	try {
		// 1. Fetch post from database by Notion page ID
		// (postId in this context is actually the Notion page UUID)
		const post = await postRepository.getByNotionPageId(postId, config.dataSourceId);
		
		if (!post) {
			throw new Error(`Post not found with notion_page_id: ${postId}`);
		}

		logger.debug({ 
			event: 'post_fetched',
			postId,
			slug: post.slug,
			title: post.title
		});

		// 2. Convert markdown to Notion blocks
		if (!post.content) {
			throw new Error(`Post ${postId} has no content - cannot sync to Notion`);
		}
		
		const blocks = markdownToNotionBlocks(post.content, {
			strictImageUrls: options.strictImageUrls,
			truncate: options.truncate,
		});

		logger.debug({ 
			event: 'markdown_converted',
			postId,
			blockCount: blocks.length 
		});

		// 3. Update Notion page
		if (options.dryRun) {
			logger.info({ 
				event: 'dry_run',
				postId,
				blockCount: blocks.length,
				message: 'Would update Notion page (dry run)'
			});
		} else {
			await notionAdapter.updatePageBlocks(postId, blocks);
			
			logger.info({ 
				event: 'publish_completed',
				postId,
				blockCount: blocks.length 
			});
		}

	} catch (error: any) {
		logger.error({ 
			event: 'publish_failed',
			postId,
			error: error?.message,
			stack: error?.stack 
		});
		throw error;
	}
}
