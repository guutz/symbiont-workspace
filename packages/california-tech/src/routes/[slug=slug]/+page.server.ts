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

import { postLoad } from 'symbiont-cms/server';
import { symbiontToQwerPost } from '$lib/utils/post-converter';

// Dynamic route - fetches posts from database at request time
export const prerender = false;

// Wrap the symbiont post loader and convert to QWER format
export const load = async (event: any) => {
	const data = await postLoad(event);
	
	// Convert Symbiont post to QWER format
	const qwerPost = symbiontToQwerPost(data.post, data.html, data.toc);
	
	// Set cache headers for client-side navigation
	event.setHeaders({
		'cache-control': 'public, max-age=60, s-maxage=60',
	});
	
	return {
		post: qwerPost,
		html: data.html,
		toc: data.toc,
	};
};
