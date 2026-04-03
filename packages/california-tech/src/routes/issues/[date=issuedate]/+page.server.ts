import { redirect } from '@sveltejs/kit';
import { symbiont } from '$lib/symbiont';
import { symbiontToTechArticle } from '$lib/utils/post-converter';
import { sortByPublishDayThenLayoutWeightDesc } from '$lib/utils/post-sorting';
import {
	filterPostsFromIssueDate,
	findNearestIssueDate,
	getDistinctIssueDates,
	getIssueBoundedEndIndex,
	parsePositiveInt
} from '$lib/utils/post-pagination';

export const config = {
	maxage: 60,
	revalidate: 60
};

export const prerender = false;

const PAGE_BATCH_SIZE = 30;
const MAX_FETCH_LIMIT = 1000;

export async function load({ fetch, params, url, cookies }) {
	try {
		const requestedIssueDate = params.date;
		const query = url.searchParams.get('q')?.toLowerCase() || '';
		const tag = url.searchParams.get('tag') || '';
		const requestedCount = parsePositiveInt(url.searchParams.get('count'), PAGE_BATCH_SIZE);

		const postsFromDb = await symbiont.getAllPages({ fetch, limit: MAX_FETCH_LIMIT });
		const allPosts = postsFromDb
			.map((post) => symbiontToTechArticle(post))
			.sort(sortByPublishDayThenLayoutWeightDesc);

		const issueDates = getDistinctIssueDates(allPosts);
		const resolvedIssueDate = findNearestIssueDate(requestedIssueDate, issueDates);

		if (!resolvedIssueDate) {
			return {
				posts: [],
				query,
				tag,
				hasMore: false,
				shownCount: 0,
				nextCount: PAGE_BATCH_SIZE,
				batchSize: PAGE_BATCH_SIZE,
				totalCount: 0,
				issueDate: requestedIssueDate,
				theme: cookies.get('theme') || 'light'
			};
		}

		if (resolvedIssueDate !== requestedIssueDate) {
			const redirectTarget = new URL(`/issues/${resolvedIssueDate}`, url.origin);
			redirectTarget.search = url.search;
			throw redirect(302, `${redirectTarget.pathname}${redirectTarget.search}`);
		}

		let filteredPosts = filterPostsFromIssueDate(allPosts, resolvedIssueDate);

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

		const boundedCount = getIssueBoundedEndIndex(filteredPosts, requestedCount);
		const nextCount = getIssueBoundedEndIndex(filteredPosts, boundedCount + PAGE_BATCH_SIZE);
		const posts = filteredPosts.slice(0, boundedCount).map(({ content, html, ...post }) => post);

		return {
			posts,
			query,
			tag,
			hasMore: boundedCount < filteredPosts.length,
			shownCount: boundedCount,
			nextCount,
			batchSize: PAGE_BATCH_SIZE,
			totalCount: filteredPosts.length,
			issueDate: resolvedIssueDate,
			theme: cookies.get('theme') || 'light'
		};
	} catch (error) {
		if (typeof error === 'object' && error && 'status' in error && error.status === 302) {
			throw error;
		}
		console.error('[issues/[date]/+page.server.ts] Error loading issue page:', error);
		return {
			posts: [],
			query: '',
			tag: '',
			hasMore: false,
			shownCount: 0,
			nextCount: PAGE_BATCH_SIZE,
			batchSize: PAGE_BATCH_SIZE,
			totalCount: 0,
			issueDate: params.date,
			theme: cookies.get('theme') || 'light'
		};
	}
}
