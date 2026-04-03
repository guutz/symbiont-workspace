import type { Post } from '$lib/types/post';
import type { Issue } from '$lib/types/index';

export type PostPreviewPage = {
	posts: Post.Post[];
	nextOffset: number;
	hasMore: boolean;
};

export type IssueCardsPage = {
	issues: Issue.Card[];
	nextOffset: number;
	hasMore: boolean;
};

type FetchPostPreviewPageOptions = {
	offset: number;
	limit: number;
	query?: string;
	tag?: string;
	beforeDate?: string;
};

type FetchIssueCardsPageOptions = {
	offset: number;
	limit: number;
};

type BuildCountLoadMoreHrefOptions = {
	basePath: string;
	hasMore: boolean;
	searchParams: URLSearchParams;
	nextCountHint?: number;
	shownCount?: number;
	renderedCount: number;
	batchSize: number;
};

export async function fetchPostPreviewPage(
	fetchFn: typeof fetch,
	options: FetchPostPreviewPageOptions
): Promise<PostPreviewPage> {
	const params = new URLSearchParams();
	params.set('offset', String(options.offset));
	params.set('limit', String(options.limit));
	if (options.query) params.set('q', options.query);
	if (options.tag) params.set('tag', options.tag);
	if (options.beforeDate) params.set('beforeDate', options.beforeDate);

	const response = await fetchFn(`/api/posts/previews?${params.toString()}`);
	if (!response.ok) {
		throw new Error(`Pagination request failed with ${response.status}`);
	}

	const payload = await response.json();
	return {
		posts: payload.posts ?? [],
		nextOffset: payload.nextOffset ?? options.offset,
		hasMore: Boolean(payload.hasMore)
	};
}

export async function fetchIssueCardsPage(
	fetchFn: typeof fetch,
	options: FetchIssueCardsPageOptions
): Promise<IssueCardsPage> {
	const params = new URLSearchParams();
	params.set('offset', String(options.offset));
	params.set('limit', String(options.limit));

	const response = await fetchFn(`/api/issues/cards?${params.toString()}`);
	if (!response.ok) {
		throw new Error(`Issue pagination request failed with ${response.status}`);
	}

	const payload = await response.json();
	return {
		issues: payload.issues ?? [],
		nextOffset: payload.nextOffset ?? options.offset,
		hasMore: Boolean(payload.hasMore)
	};
}

export function buildCountLoadMoreHref(options: BuildCountLoadMoreHrefOptions): string {
	if (!options.hasMore) return '';

	const nextCount = options.nextCountHint
		?? ((options.shownCount ?? options.renderedCount) + options.batchSize);

	const params = new URLSearchParams(options.searchParams);
	params.set('count', String(nextCount));
	return `${options.basePath}?${params.toString()}`;
}

export function observeInfiniteScroll(
	target: Element,
	onIntersect: () => void,
	rootMargin = '320px 0px'
): () => void {
	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (entry.isIntersecting) {
					onIntersect();
				}
			}
		},
		{ rootMargin }
	);

	observer.observe(target);
	return () => observer.disconnect();
}

export function getActiveIssueDateFromRoot(
	root: HTMLElement,
	fallbackIssueDate: string,
	threshold = 96
): string {
	const sections = Array.from(root.querySelectorAll<HTMLElement>('.issue-section[data-issue-date]')).filter(
		(section) => section.dataset.issueDate
	);

	if (sections.length === 0) {
		return fallbackIssueDate;
	}

	let activeIssueDate = sections[0]!.dataset.issueDate || fallbackIssueDate;
	for (const section of sections) {
		if (section.getBoundingClientRect().top <= threshold) {
			activeIssueDate = section.dataset.issueDate || activeIssueDate;
		}
	}

	return activeIssueDate;
}
