/**
 * JSON API endpoint for post data
 * 
 * Used by +page.ts for client-side navigation.
 */

import { json, error } from '@sveltejs/kit';
import { getPostBySlug, parseMarkdown, loadConfig } from 'symbiont-cms/server';
import { symbiontToQwerPost } from '$lib/utils/post-converter';

export const GET = async ({ params, fetch, setHeaders }: {
	params: { slug: string };
	fetch: typeof globalThis.fetch;
	setHeaders: (headers: Record<string, string>) => void;
}) => {
	try {
		// Fetch post from database
		const post = await getPostBySlug(params.slug, { fetch });

		if (!post) {
			throw error(404, 'Post not found');
		}

		// Load config and render markdown
		const config = await loadConfig();
		const { html, toc } = await parseMarkdown(post.content || '', {
			config: config.markdown,
			features: post.features,
		});

		// Convert to QWER format
		const qwerPost = symbiontToQwerPost(post, html, toc);

		// Set cache headers
		setHeaders({
			'cache-control': 'public, max-age=60, s-maxage=60',
		});

		return json({
			post: qwerPost,
			html,
			toc,
		});
	} catch (err: any) {
		if (err?.status) throw err;
		console.error('[API] Failed to load post:', err);
		throw error(500, 'Failed to load post');
	}
};
