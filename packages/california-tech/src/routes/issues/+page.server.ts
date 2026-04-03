import { parsePositiveInt } from '$lib/utils/post-pagination';
import { buildIssueCards } from '$lib/utils/issues';

export const config = {
	maxage: 60,
	revalidate: 60
};

export const prerender = false;

const ISSUE_PAGE_BATCH_SIZE = 24;

export async function load({ fetch, cookies, url }) {
	try {
		const requestedCount = parsePositiveInt(url.searchParams.get('count'), ISSUE_PAGE_BATCH_SIZE);
		const issues = await buildIssueCards(fetch);

		const shownCount = Math.min(requestedCount, issues.length);
		const pagedIssues = issues.slice(0, shownCount);
		const nextCount = Math.min(shownCount + ISSUE_PAGE_BATCH_SIZE, issues.length);

		return {
			issues: pagedIssues,
			hasMore: shownCount < issues.length,
			shownCount,
			nextCount,
			batchSize: ISSUE_PAGE_BATCH_SIZE,
			totalCount: issues.length,
			theme: cookies.get('theme') || 'light'
		};
	} catch (error) {
		console.error('[issues/+page.server.ts] Error loading issue index:', error);
		return {
			issues: [],
			hasMore: false,
			shownCount: 0,
			nextCount: ISSUE_PAGE_BATCH_SIZE,
			batchSize: ISSUE_PAGE_BATCH_SIZE,
			totalCount: 0,
			theme: 'light'
		};
	}
}