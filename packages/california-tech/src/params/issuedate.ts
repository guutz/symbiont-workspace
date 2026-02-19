/**
 * Param matcher for [date=issuedate] routes
 * Matches YYYY-MM-DD format (with optional .pdf extension)
 */
export function match(param: string): boolean {
	// Match YYYY-MM-DD or YYYY-MM-DD.pdf
	return /^\d{4}-\d{2}-\d{2}(\.pdf)?$/.test(param);
}
