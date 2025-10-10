import { getAllPosts } from 'symbiont-cms/server';
import { symbiontToQwerPost } from '$lib/utils/post-converter';

export const load = async ({ fetch }: { fetch: typeof globalThis.fetch }) => {
	try {
		// Fetch posts using the new simple API - config loaded automatically!
		const postsFromDb = await getAllPosts({ fetch, limit: 100 });

		// Transform Symbiont posts to QWER Post format using shared converter
		const qwerPosts = postsFromDb.map((post) => symbiontToQwerPost(post));

		return {
			posts: qwerPosts
		};
	} catch (error) {
		console.error('[+page.server] Error fetching posts from database:', error);
		return {
			posts: []
		};
	}
};
