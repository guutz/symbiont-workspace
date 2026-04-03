import { json } from '@sveltejs/kit';
import { parsePositiveInt } from '$lib/utils/post-pagination';
import { buildIssueCards } from '$lib/utils/issues';

const ISSUE_PAGE_BATCH_SIZE = 24;

export const config = {
	maxage: 60,
	revalidate: 60
};

export async function GET({ fetch, url }) {
	try {
		const offset = Math.max(0, parsePositiveInt(url.searchParams.get('offset'), 0));
		const limit = parsePositiveInt(url.searchParams.get('limit'), ISSUE_PAGE_BATCH_SIZE);
		const issues = await buildIssueCards(fetch);
		const end = Math.min(offset + limit, issues.length);
		const page = issues.slice(offset, end);

		return json({
			issues: page,
			offset,
			nextOffset: end,
			hasMore: end < issues.length,
			totalCount: issues.length
		});
	} catch (error) {
		console.error('[/api/issues/cards] Error fetching issues cards:', error);
		return json({ error: 'Failed to fetch issues cards' }, { status: 500 });
	}
}
