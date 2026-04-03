import { compareStringDesc, getPacificDateKey, type SortablePostLike } from '$lib/utils/post-sorting';

export function parsePositiveInt(value: string | null, fallback: number): number {
	if (!value) return fallback;

	const parsed = Number.parseInt(value, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return fallback;
	}

	return parsed;
}

export function getIssueBoundedEndIndex<T extends SortablePostLike>(posts: T[], targetCount: number): number {
	if (posts.length === 0 || targetCount <= 0) {
		return 0;
	}

	if (targetCount >= posts.length) {
		return posts.length;
	}

	let boundedEnd = targetCount;
	const boundaryDate = getPacificDateKey(posts[targetCount - 1]?.published);

	if (!boundaryDate) {
		return boundedEnd;
	}

	while (boundedEnd < posts.length) {
		const nextDate = getPacificDateKey(posts[boundedEnd]?.published);
		if (nextDate !== boundaryDate) {
			break;
		}

		boundedEnd += 1;
	}

	return boundedEnd;
}

export function getDistinctIssueDates<T extends SortablePostLike>(posts: T[]): string[] {
	const dates = new Set<string>();
	for (const post of posts) {
		const dateKey = getPacificDateKey(post.published);
		if (dateKey) {
			dates.add(dateKey);
		}
	}

	return Array.from(dates).sort(compareStringDesc);
}

export function findNearestIssueDate(targetDate: string, availableDates: string[]): string | null {
	if (!targetDate || availableDates.length === 0) {
		return null;
	}

	if (availableDates.includes(targetDate)) {
		return targetDate;
	}

	const targetTime = new Date(`${targetDate}T00:00:00-08:00`).getTime();
	if (Number.isNaN(targetTime)) {
		return availableDates[0] ?? null;
	}

	let nearest = availableDates[0]!;
	let nearestDistance = Number.POSITIVE_INFINITY;

	for (const date of availableDates) {
		const time = new Date(`${date}T00:00:00-08:00`).getTime();
		if (Number.isNaN(time)) continue;

		const distance = Math.abs(time - targetTime);
		if (distance < nearestDistance) {
			nearest = date;
			nearestDistance = distance;
		}
	}

	return nearest;
}

export function filterPostsFromIssueDate<T extends SortablePostLike>(posts: T[], issueDate: string): T[] {
	if (!issueDate) {
		return posts;
	}

	return posts.filter((post) => {
		const dateKey = getPacificDateKey(post.published);
		return dateKey !== '' && dateKey <= issueDate;
	});
}
