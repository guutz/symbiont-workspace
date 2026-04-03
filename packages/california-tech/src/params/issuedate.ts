/**
 * Param matcher for [date=issuedate] routes
 * Matches YYYY-MM-DD format
 */
export function match(param: string): boolean {
	return /^\d{4}-\d{2}-\d{2}$/.test(param);
}
