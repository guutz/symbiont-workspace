/**
 * Param matcher for [slug] routes
 * Ensures slug doesn't match files with extensions (like .xml, .json, etc.)
 */
export function match(param: string): boolean {
	// Reject if it contains a file extension
	return !/\.[a-z0-9]+$/i.test(param);
}
