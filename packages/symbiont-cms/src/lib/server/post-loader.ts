/**
 * SvelteKit server load function for fetching and rendering posts
 * 
 * This module provides a simple, opinionated load function that:
 * 1. Fetches a post by slug from the database
 * 2. Renders markdown to HTML with TOC
 * 3. Returns everything needed for the page
 * 
 * For custom behavior, import the lower-level functions from '../client/queries.ts'
 * and './markdown-processor.ts' directly.
 */

import { error } from '@sveltejs/kit';
import { loadServerConfig } from './load-config.js';
import { parseMarkdown, type MarkdownResult } from './markdown-processor.js';
import { getPostBySlug } from '../client/queries.js';
import type { Post } from '../types.js';
import { createLogger } from './utils/logger.js';

type PostLoadEvent = {
	params: { slug: string };
	fetch: typeof fetch;
};

export interface PostLoadResult {
	post: Post;
	html: string;
	toc: MarkdownResult['toc'];
}

export type PostServerLoad<Event extends PostLoadEvent = PostLoadEvent> = (
	event: Event
) => Promise<PostLoadResult>;

/**
 * Creates a SvelteKit server load function for fetching a single post by slug.
 * 
 * This function automatically:
 * - Loads config from symbiont.config.ts
 * - Fetches the post from the database
 * - Renders markdown to HTML with TOC
 * - Returns 404 if post not found
 * - Logs errors for debugging
 * 
 * @returns A SvelteKit load function that fetches and renders a post
 * 
 * @example
 * // In [slug]/+page.server.ts
 * import { createPostLoad } from 'symbiont-cms/server';
 * export const load = createPostLoad();
 * 
 * @example
 * // Or use the default export
 * export { load } from 'symbiont-cms/server';
 */
export function createPostLoad<Event extends PostLoadEvent = PostLoadEvent>(): PostServerLoad<Event> {
	return async (event) => {
		const logger = createLogger({ operation: 'load_post', slug: event.params.slug });
		
		try {
			// Fetch post from database
			const post = await getPostBySlug(event.params.slug, { fetch: event.fetch });

			if (!post) {
				throw error(404, 'Post not found');
			}

			// Load config for markdown rendering
			const config = await loadServerConfig();

			// Render markdown to HTML with TOC
			const markdownContent = post.content || '';
			const { html, toc } = await parseMarkdown(markdownContent, config.markdown);

			return { post, html, toc };
		} catch (err: any) {
			// Re-throw SvelteKit errors (like 404)
			if (err?.status) {
				throw err;
			}
			
			// Log and wrap unexpected errors
			logger.error({ 
				event: 'post_load_failed', 
				error: err?.message,
				stack: err?.stack
			});
			throw error(500, 'Failed to load post');
		}
	};
}

/**
 * Default export for convenience.
 * 
 * @example
 * // In [slug]/+page.server.ts
 * export { load } from 'symbiont-cms/server';
 */
export const load = createPostLoad();

/**
 * Export ISR config if enabled in symbiont.config.ts
 * 
 * This allows SvelteKit/Vercel to cache rendered pages with
 * incremental static regeneration.
 */
export const config = (async () => {
	const symbiontConfig = await loadServerConfig();
  
	if (symbiontConfig.caching?.isr?.enabled) {
		return {
			isr: {
				expiration: symbiontConfig.caching.isr.revalidate,
			},
		};
	}
  
	return {};
})();