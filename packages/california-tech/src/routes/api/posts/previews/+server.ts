// packages/california-tech/src/routes/api/posts/previews/+server.ts
import { json } from '@sveltejs/kit';
import { symbiont } from '$lib/symbiont';
import { symbiontToTechArticle } from '$lib/utils/post-converter';
import { getPacificDateKey, sortByPublishDayThenLayoutWeightDesc } from '$lib/utils/post-sorting';
import { getIssueBoundedEndIndex, parsePositiveInt } from '$lib/utils/post-pagination';

const DEFAULT_BATCH_SIZE = 30;
const MAX_FETCH_LIMIT = 1000;

function flattenTags(tags: unknown[] | undefined): string[] {
	return (tags ?? []).flatMap((tag) => {
		if (typeof tag === 'string') return [tag];
		if (typeof tag === 'object' && tag !== null) {
			return Object.values(tag).flat().map((value) => String(value));
		}
		return [];
	});
}

export const config = {
	maxage: 300, // Cache for 5 minutes
	revalidate: 300
};

export async function GET({ fetch, url }) {
	try {
		const alias = url.searchParams.get('alias') || undefined;
		const query = (url.searchParams.get('q') || '').toLowerCase();
		const tag = url.searchParams.get('tag') || '';
		const beforeDate = url.searchParams.get('beforeDate') || '';
		const offset = Math.max(0, parsePositiveInt(url.searchParams.get('offset'), 0));
		const batchSize = parsePositiveInt(url.searchParams.get('limit'), DEFAULT_BATCH_SIZE);

		const postsFromDb = await symbiont.getAllPages({ fetch, limit: MAX_FETCH_LIMIT, alias });
		const allPosts = postsFromDb
			.map((post) => symbiontToTechArticle(post))
			.sort(sortByPublishDayThenLayoutWeightDesc);

		let filteredPosts = allPosts;
		if (tag) {
			filteredPosts = filteredPosts.filter((post) => flattenTags(post.tags as unknown[]).includes(tag));
		}

		if (query) {
			filteredPosts = filteredPosts.filter((post) =>
				(post.title?.toLowerCase() || '').includes(query) ||
				(post.summary?.toLowerCase() || '').includes(query)
			);
		}

		if (beforeDate) {
			filteredPosts = filteredPosts.filter((post) => {
				const issueDate = getPacificDateKey(post.published);
				return issueDate !== '' && issueDate <= beforeDate;
			});
		}

		const boundedEnd = getIssueBoundedEndIndex(filteredPosts, offset + batchSize);
		const pagedPosts = filteredPosts.slice(offset, boundedEnd);

		// Return only essential fields for filtering and display
		const previews = pagedPosts.map((post) => {
			const flattenedTags = flattenTags(post.tags as unknown[]);

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

		return json({
			posts: previews,
			offset,
			nextOffset: boundedEnd,
			hasMore: boundedEnd < filteredPosts.length,
			totalCount: filteredPosts.length,
			beforeDate: beforeDate || null
		});
	} catch (error) {
		console.error('[/api/posts/previews] Error fetching previews:', error);
		return json({ error: 'Failed to fetch previews' }, { status: 500 });
	}
}
