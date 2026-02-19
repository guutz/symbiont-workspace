/**
 * Hook composition utilities.
 * 
 * Handles the logic for composing multiple hook results based on return type.
 */

/**
 * Determines the type category of a value for composition purposes.
 */
export type ResultType = 'primitive' | 'object' | 'array' | null;

/**
 * Determine the result type category for composition.
 * 
 * @param value - The value to categorize
 * @returns The result type category
 */
export function getResultType(value: any): ResultType {
	if (value === null || value === undefined) {
		return null;
	}

	if (Array.isArray(value)) {
		return 'array';
	}

	if (typeof value === 'object' && value !== null) {
		return 'object';
	}

	return 'primitive';
}

/**
 * Compose two values based on their type.
 * 
 * **Composition Rules:**
 * - Primitives: First non-null wins
 * - Objects: Deep merge
 * - Arrays: Concatenate
 * 
 * @param current - Current accumulated result
 * @param next - Next value to compose
 * @param currentType - Type of current result
 * @returns Composed result
 */
export function composeResults(
	current: any,
	next: any,
	currentType: ResultType
): any {
	if (currentType === 'primitive') {
		// First non-null wins for primitives
		return current ?? next;
	}

	if (currentType === 'object') {
		// Merge objects
		return { ...current, ...next };
	}

	if (currentType === 'array') {
		// Concatenate arrays
		return current === null ? next : [...current, ...next];
	}

	return current;
}

/**
 * Check if composition should stop early.
 * 
 * For primitives, stop after first non-null result.
 * For objects and arrays, continue to accumulate.
 * 
 * @param resultType - The type of result being composed
 * @returns True if should stop early
 */
export function shouldStopEarly(resultType: ResultType): boolean {
	return resultType === 'primitive';
}
