/**
 * SvelteKit server load functions for fetching and rendering posts
 * 
 * This module provides opinionated load functions for both:
 * - Single post by slug (with full HTML + TOC)
 * - List of posts (with optional summary HTML parsing)
 * 
 * Both functions support ISR caching when enabled in symbiont.config.ts.
 * 
 * For custom behavior, import the lower-level functions from '../client/queries.ts'
 * and './markdown-processor.ts' directly.
 */

import { error } from '@sveltejs/kit';
import { loadServerConfig } from './load-config.js';
import { parseMarkdown, parseSummary, type MarkdownResult } from './markdown-processor.js';
import { getPostBySlug, getAllPosts, type GetAllPostsOptions } from '../client/queries.js';
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
 * 
 * Use for single post pages: export { config } from 'symbiont-cms/server'
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

// ============================================================================
// POSTS LIST LOADING (Multiple Posts)
// ============================================================================

/**
 * Creates a posts loader with custom default options.
 * 
 * @param defaultOptions - Default options to apply to every call
 * @returns A postsLoad function with the defaults baked in
 * 
 * @example
 * // Create a loader with custom defaults
 * const myPostsLoad = createPostsLoad({ limit: 50, parseSummaries: true });
 * const posts = await myPostsLoad({ fetch });
 */
export function createPostsLoad(defaultOptions: Partial<GetAllPostsOptions & { parseSummaries?: boolean }> = {}) {
	return async (
		context: { fetch: typeof fetch },
		options: GetAllPostsOptions & { parseSummaries?: boolean } = {}
	): Promise<Post[]> => {
		const mergedOptions = { ...defaultOptions, ...options };
		return postsLoad(context, mergedOptions);
	};
}

/**
 * Fetches posts and optionally parses summary markdown to HTML.
 * 
 * This is the "spoon-feeding" approach: Symbiont handles all markdown processing
 * so the host application receives presentation-ready data.
 * 
 * @param context - Object containing fetch function from SvelteKit
 * @param options - Pagination and parsing options (extends GetAllPostsOptions)
 * @param options.parseSummaries - Whether to parse summaries to HTML (default: true)
 * @returns Array of posts with summary_html populated if parseSummaries is true
 * 
 * @example
 * // In +page.server.ts
 * import { postsLoad } from 'symbiont-cms/server';
 * 
 * export async function load({ fetch }) {
 *   const posts = await postsLoad({ fetch }, { limit: 20 });
 *   // posts[0].summary_html is ready to use with {@html}
 *   return { posts };
 * }
 * 
 * @example
 * // Disable summary parsing for performance
 * const posts = await postsLoad({ fetch }, { parseSummaries: false });
 */
export async function postsLoad(
	context: { fetch: typeof fetch },
	options: GetAllPostsOptions & { parseSummaries?: boolean } = {}
): Promise<Post[]> {
	const { 
		parseSummaries = true, 
		limit, 
		offset, 
		alias,
		fetch: customFetch 
	} = options;

	// Use context.fetch or custom fetch
	const fetchFn = customFetch ?? context.fetch;

	// Fetch posts from database
	const posts = await getAllPosts({ 
		fetch: fetchFn, 
		limit, 
		offset, 
		alias 
	});

	// If not parsing summaries, return as-is
	if (!parseSummaries) {
		return posts;
	}

	// Load config for markdown rendering
	const config = await loadServerConfig();

	// Parse summaries in parallel
	const postsWithHtml = await Promise.all(
		posts.map(async (post): Promise<Post> => {
			try {
				const sourceText = post.summary ?? post.content ?? '';
				const plainText = await parseSummary(sourceText);
				const summary_html = plainText.substring(0, 200);

				return {
					...post,
					summary_html
				};
			} catch (err) {
				// If parsing fails, return post without summary_html
				console.warn(`Failed to parse summary for post ${post.slug}:`, err);
				return post;
			}
		})
	);

	return postsWithHtml;
}

/**
 * Export ISR config for posts list pages.
 * 
 * Use for homepage/list pages: export { postsConfig as config } from 'symbiont-cms/server'
 * 
 * @example
 * // In +page.server.ts
 * import { postsLoad, postsConfig as config } from 'symbiont-cms/server';
 * export { config };
 * export const load = async ({ fetch }) => {
 *   const posts = await postsLoad({ fetch }, { limit: 20 });
 *   return { posts };
 * };
 */
export const postsConfig = (async () => {
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