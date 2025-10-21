// packages/california-tech/src/routes/categories/+page.server.ts
import { getAllPosts } from 'symbiont-cms/server';
import { symbiontToQwerPost } from '$lib/utils/post-converter';
import type { Tags } from '$lib/types/tags';

export const prerender = false;

export async function load({ fetch }) {
	try {
		const postsFromDb = await getAllPosts({ fetch, limit: 1000 });
		const allPosts = postsFromDb.map((post) => symbiontToQwerPost(post));

		// Build tag statistics
		const tagCounts = new Map<string, number>();
		
		for (const post of allPosts) {
			if (post.tags && Array.isArray(post.tags)) {
				for (const tag of post.tags) {
					if (typeof tag === 'string') {
						tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
					}
				}
			}
		}

		// Convert to sorted array
		const allTags = Array.from(tagCounts.entries())
			.map(([name, count]) => ({ name, count }))
			.sort((a, b) => b.count - a.count); // Sort by count descending

		return { allTags };
	} catch (error) {
		console.error('[categories/+page.server] Error loading categories:', error);
		return { allTags: [] };
	}
}