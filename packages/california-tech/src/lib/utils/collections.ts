export function mergeUniqueBy<T>(existingItems: T[], incomingItems: T[], getKey: (item: T) => string): T[] {
	const existingKeys = new Set(existingItems.map(getKey));
	const uniqueIncoming = incomingItems.filter((item) => !existingKeys.has(getKey(item)));
	return [...existingItems, ...uniqueIncoming];
}
