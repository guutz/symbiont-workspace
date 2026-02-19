/**
 * Date parsing utilities for California Tech's issue-based dates.
 * 
 * California Tech publishes articles with dates in a specific format:
 * "January 20, 2023" or similar date strings in the Issue property.
 */

/**
 * Parse a California Tech issue date string into an ISO timestamp.
 * 
 * The Issue property contains dates like "January 20, 2023".
 * This function parses them and sets the time to 7:00 AM PST (14:00 UTC).
 * 
 * @param issueString - The issue date string (e.g., "January 20, 2023")
 * @returns ISO timestamp string or null if parsing fails
 * 
 * @example
 * parseTechIssueDate("January 20, 2023")
 * // Returns: "2023-01-20T14:00:00.000Z"
 */
export function parseTechIssueDate(issueString: string): string | null {
	if (!issueString || typeof issueString !== 'string') {
		return null;
	}

	try {
		// Append time and timezone to make parsing consistent
		// 07:00:00 GMT-0700 = 7 AM PST
		const dateString = `${issueString} 07:00:00 GMT-0700`;
		const date = new Date(dateString);

		if (isNaN(date.getTime())) {
			console.warn(`[tech.caltech.edu] Invalid date format in Issue property: "${issueString}"`);
			return null;
		}

		return date.toISOString();
	} catch (error) {
		console.error(`[tech.caltech.edu] Error parsing Issue property "${issueString}":`, error);
		return null;
	}
}

/**
 * Parse a website publish date from Notion's date property.
 * 
 * @param dateString - ISO date string from Notion
 * @returns ISO timestamp string or null if parsing fails
 * 
 * @example
 * parseWebsitePublishDate("2023-01-20")
 * // Returns: "2023-01-20T00:00:00.000Z"
 */
export function parseWebsitePublishDate(dateString: string): string | null {
	if (!dateString || typeof dateString !== 'string') {
		return null;
	}

	try {
		const date = new Date(dateString);

		if (isNaN(date.getTime())) {
			console.warn(`[tech.caltech.edu] Invalid date format in Website Publish Date: "${dateString}"`);
			return null;
		}

		return date.toISOString();
	} catch (error) {
		console.error(`[tech.caltech.edu] Error parsing Website Publish Date "${dateString}":`, error);
		return null;
	}
}
