import { symbiont } from '$lib/symbiont';
import { symbiontToTechArticle } from '$lib/utils/post-converter';
import { compareStringDesc, getPacificDateKey, sortByPublishDayThenLayoutWeightDesc } from '$lib/utils/post-sorting';
import type { Issue } from '$lib/types/index';

export const FETCH_BATCH_SIZE = 1000;
export const WEBSITE_ALIAS = 'tech-article-staging';
export const ARCHIVE_ALIAS = 'tech-archives';
const MIN_WEBSITE_ARTICLES_PER_ISSUE = 2;

export function normalizeIssueDateFromSlug(rawSlug: string): string {
	const normalized = rawSlug.trim().replace(/^\/+|\/+$/g, '');
	const match = normalized.match(/\d{4}-\d{2}-\d{2}/);
	return match?.[0] ?? '';
}

export function formatIssueLabel(issueDate: string): string {
	const parsed = new Date(`${issueDate}T12:00:00-08:00`);
	if (Number.isNaN(parsed.getTime())) {
		return issueDate;
	}

	return parsed.toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'long',
		day: 'numeric',
		timeZone: 'America/Los_Angeles'
	});
}

function getStoredIssueCover(page: { cover?: unknown; meta?: Record<string, unknown> | null }): string | undefined {
	if (typeof page.cover === 'string' && page.cover) {
		return page.cover;
	}

	const metadata = page.meta;
	if (metadata && typeof metadata.cover === 'string' && metadata.cover) {
		return metadata.cover;
	}

	return undefined;
}

function indexWebsiteIssuesByDate(websitePosts: Awaited<ReturnType<typeof symbiontToTechArticle>>[]): Map<string, { articleCount: number }> {
	const issueMap = new Map<string, { articleCount: number }>();
	for (const post of websitePosts) {
		const issueDate = getPacificDateKey(post.published);
		if (!issueDate) continue;

		const existing = issueMap.get(issueDate);
		if (existing) {
			existing.articleCount += 1;
			continue;
		}

		issueMap.set(issueDate, { articleCount: 1 });
	}
	return issueMap;
}

function indexArchiveIssuesByDate(
	archivePosts: Awaited<ReturnType<typeof symbiont.getAllPages>>
): Map<string, { title: string; cover?: string; hasPdf: boolean }> {
	const issueMap = new Map<string, { title: string; cover?: string; hasPdf: boolean }>();

	for (const post of archivePosts) {
		const issueDate = normalizeIssueDateFromSlug(String(post.slug ?? ''));
		if (!issueDate || issueMap.has(issueDate)) continue;

		const metadata = post.meta && typeof post.meta === 'object' ? (post.meta as Record<string, unknown>) : {};
		const resolverUrl = typeof metadata.resolver_url === 'string' ? metadata.resolver_url : undefined;

		issueMap.set(issueDate, {
			title: post.title ?? `Issue ${issueDate}`,
			cover: getStoredIssueCover({ cover: post.cover, meta: metadata }),
			hasPdf: Boolean(resolverUrl?.endsWith('.pdf'))
		});
	}

	return issueMap;
}

export async function fetchAllPagesByAlias(
	fetchFn: typeof fetch,
	alias: string
): Promise<Awaited<ReturnType<typeof symbiont.getAllPages>>> {
	const allPages: Awaited<ReturnType<typeof symbiont.getAllPages>> = [];
	let offset = 0;

	while (true) {
		const batch = await symbiont.getAllPages({
			fetch: fetchFn,
			alias,
			limit: FETCH_BATCH_SIZE,
			offset
		});

		if (batch.length === 0) {
			break;
		}

		allPages.push(...batch);

		if (batch.length < FETCH_BATCH_SIZE) {
			break;
		}

		offset += FETCH_BATCH_SIZE;
	}

	return allPages;
}

export async function buildIssueCards(fetchFn: typeof fetch): Promise<Issue.Card[]> {
	const [websitePosts, archivePosts] = await Promise.all([
		fetchAllPagesByAlias(fetchFn, WEBSITE_ALIAS),
		fetchAllPagesByAlias(fetchFn, ARCHIVE_ALIAS)
	]);

	const websiteByDate = indexWebsiteIssuesByDate(
		websitePosts.map((post) => symbiontToTechArticle(post)).sort(sortByPublishDayThenLayoutWeightDesc)
	);
	const archiveByDate = indexArchiveIssuesByDate(archivePosts);
	const inferredWebsiteIssueDates = Array.from(websiteByDate.entries())
		.filter(([, details]) => details.articleCount >= MIN_WEBSITE_ARTICLES_PER_ISSUE)
		.map(([issueDate]) => issueDate);

	const allIssueDates = Array.from(new Set([...inferredWebsiteIssueDates, ...archiveByDate.keys()])).sort(compareStringDesc);

	return allIssueDates.map((issueDate) => {
		const websiteIssue = websiteByDate.get(issueDate);
		const archiveIssue = archiveByDate.get(issueDate);

		return {
			date: issueDate,
			label: formatIssueLabel(issueDate),
			cover: archiveIssue?.cover,
			hasWebsite: Boolean(websiteIssue),
			hasPdf: Boolean(archiveIssue?.hasPdf)
		};
	});
}
