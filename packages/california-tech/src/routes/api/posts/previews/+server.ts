// packages/california-tech/src/routes/api/posts/previews/+server.ts
import { json } from '@sveltejs/kit';
import { symbiont } from '$lib/symbiont';
import { symbiontToTechArticle } from '$lib/utils/post-converter';
import { sortByPublishDayThenLayoutWeightDesc } from '$lib/utils/post-sorting';

export const config = {
	maxage: 300, // Cache for 5 minutes
	revalidate: 300
};

export async function GET({ fetch, url }) {
	try {
		const alias = url.searchParams.get('alias') || undefined;
		const postsFromDb = await symbiont.getAllPages({ fetch, limit: 1000, alias });
		const allPosts = postsFromDb
			.map((post) => symbiontToTechArticle(post))
			.sort(sortByPublishDayThenLayoutWeightDesc);

		// Return only essential fields for filtering and display
		const previews = allPosts.map((post) => {
			const flattenedTags = (post.tags ?? []).flatMap((tag) => {
				if (typeof tag === 'string') return [tag];
				if (typeof tag === 'object' && tag !== null) {
					return Object.values(tag).flat().map((value) => String(value));
				}
				return [];
			});

			return {
				slug: post.slug,
				title: post.title,
				summary: post.summary?.slice(0, 150),
				summary_html: post.summary_html,
				showPreviewSummary: post.showPreviewSummary,
				previewLayout: post.previewLayout,
				layoutWeight: post.layoutWeight,
				authors: post.authors,
				tags: Array.from(new Set(flattenedTags)),
				published: post.published,
				cover: post.cover,
				coverStyle: post.coverStyle,
			};
		});

		return json(previews);
	} catch (error) {
		console.error('[/api/posts/previews] Error fetching previews:', error);
		return json({ error: 'Failed to fetch previews' }, { status: 500 });
	}
}
