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
import { renderMarkdownToHtml } from 'symbiont-cms/server';
import { symbiontToTechArticle } from '$lib/utils/post-converter';
import { error, redirect } from '@sveltejs/kit';

// ISR config - enable SvelteKit's ISR caching
export const config = {
	maxage: 60,
	revalidate: 60
};

// Dynamic route - fetches posts from database at request time
export const prerender = false;

// Fetch post and render markdown
export const load = async (event: any) => {
	// Priority order: website pages first, then articles
	// This allows both datasources to share the same [slug] route
	let post = await symbiont.getPageBySlug(event.params.slug, { 
		fetch: event.fetch,
		alias: 'tech-website-pages'
	});
	
	// If not found in website pages, try articles
	if (!post) {
		post = await symbiont.getPageBySlug(event.params.slug, { 
			fetch: event.fetch,
			alias: 'tech-article-staging'
		});
	}
	
	if (!post) {
		throw error(404, 'Post not found');
	}

	const metadata = post.meta ?? {};
	
	// Handle redirect-type pages
	if (metadata.pageType === 'Redirect') {
		// Redirect to external link if available
		if (metadata.redirectLink) {
			throw redirect(302, metadata.redirectLink as string);
		}
		
		// Serve file if available
		if ((metadata.file as { url?: string } | undefined)?.url) {
			throw redirect(302, (metadata.file as { url: string }).url);
		}
		
		// No redirect target configured
		throw error(500, 'Redirect page has no target configured');
	}
	
	// Content pages must have content
	if (!post.content) {
		throw error(404, 'Post has no content');
	}
	
	// Render markdown to HTML
	const { html, toc } = await renderMarkdownToHtml(post.content, symbiont.config.markdown);
	
	// Convert Symbiont post to QWER format
	const qwerPost = symbiontToTechArticle(post, html, toc);
	
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
