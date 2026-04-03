export type SortablePostLike = {
	published?: string;
	layoutWeight?: number;
};

export function compareStringDesc(a: string, b: string): number {
	return b.localeCompare(a);
}

export function getPacificDateKey(isoDateString?: string): string {
	const date = new Date(isoDateString ?? '');
	if (Number.isNaN(date.getTime())) {
		return '';
	}

	return date.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
}

export function sortByPublishDayThenLayoutWeightDesc<T extends SortablePostLike>(a: T, b: T): number {
	const dateKeyA = getPacificDateKey(a.published);
	const dateKeyB = getPacificDateKey(b.published);
	if (dateKeyA !== dateKeyB) {
		return compareStringDesc(dateKeyA, dateKeyB);
	}

	const weightA = a.layoutWeight ?? 0;
	const weightB = b.layoutWeight ?? 0;
	if (weightA !== weightB) {
		return weightB - weightA;
	}

	const publishedA = new Date(a.published ?? '').getTime();
	const publishedB = new Date(b.published ?? '').getTime();
	return publishedB - publishedA;
}
