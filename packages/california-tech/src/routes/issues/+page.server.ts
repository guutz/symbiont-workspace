import { symbiont } from '$lib/symbiont';
import { symbiontToTechArticle } from '$lib/utils/post-converter';
import { sortByPublishDayThenLayoutWeightDesc } from '$lib/utils/post-sorting';

export const config = {
	maxage: 60,
	revalidate: 60
};

export const prerender = false;

export async function load({ fetch, url, cookies }) {
	try {
		const query = url.searchParams.get('q')?.toLowerCase() || '';
		const tag = url.searchParams.get('tag') || '';
		const initialLimit = query || tag ? 1000 : 30;
		const postsFromDb = await symbiont.getAllPages({
			fetch,
			limit: initialLimit,
			alias: 'tech-archives'
		});
		const allPosts = postsFromDb
			.map((post) => symbiontToTechArticle(post))
			.sort(sortByPublishDayThenLayoutWeightDesc);

		let filteredPosts = allPosts;

		if (tag) {
			filteredPosts = filteredPosts.filter((post) =>
				(post.tags ?? []).some((postTag) => {
					if (typeof postTag === 'string') return postTag === tag;
					if (typeof postTag === 'object' && postTag !== null) {
						return Object.values(postTag).flat().some((value) => String(value) === tag);
					}
					return false;
				})
			);
		}

		if (query) {
			filteredPosts = filteredPosts.filter((post) =>
				post.title.toLowerCase().includes(query) ||
				(post.summary ?? '').toLowerCase().includes(query)
			);
		}

		const posts = filteredPosts.slice(0, 30).map(({ content, html, ...post }) => post);

		return {
			posts,
			allTags: [],
			query,
			tag,
			hasMore: filteredPosts.length > 30,
			totalCount: filteredPosts.length,
			theme: cookies.get('theme') || 'light'
		};
	} catch (error) {
		console.error('[issues/+page.server.ts] Error loading issue index:', error);
		return { posts: [], allTags: [], query: '', tag: '', hasMore: false, totalCount: 0, theme: 'light' };
	}
}