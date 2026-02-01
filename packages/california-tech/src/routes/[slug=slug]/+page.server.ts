/**
 * Server-side load function for post pages
 * 
 * This runs on the server during SSR and provides:
 * - Full post data from database
 * - Pre-rendered markdown HTML
 * - Table of contents
 * 
 * Used for:
 * - Initial page load (SSR)
 * - No-JS fallback
 * - SEO/crawlers
 */

import { symbiont } from '$lib/symbiont';
import { parseMarkdown } from 'symbiont-cms/server';
import { symbiontToQwerPost } from '$lib/utils/post-converter';
import { error } from '@sveltejs/kit';

// ISR config - enable SvelteKit's ISR caching
export const config = {
	maxage: 60,
	revalidate: 60
};

// Dynamic route - fetches posts from database at request time
export const prerender = false;

// Fetch post and render markdown
export const load = async (event: any) => {
	const post = await symbiont.getPostBySlug(event.params.slug, { fetch: event.fetch });
	
	if (!post || !post.content) {
		throw error(404, 'Post not found');
	}
	
	// Render markdown to HTML
	const { html, toc } = await parseMarkdown(post.content, symbiont.config.markdown);
	
	// Convert Symbiont post to QWER format
	const qwerPost = symbiontToQwerPost(post, html, toc);
	
	// Set cache headers for client-side navigation
	event.setHeaders({
		'cache-control': 'public, max-age=60, s-maxage=60',
	});
	
	return {
		post: qwerPost,
		html,
		toc,
	};
};
