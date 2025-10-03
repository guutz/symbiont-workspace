import slugify from 'slugify';

/**
 * Create a URL-safe slug from text
 */
export const createSlug = (text: string): string => 
	slugify.default?.(text, { lower: true, strict: true }) ?? 
	(slugify as any)(text, { lower: true, strict: true });

/**
 * Generate a unique slug using pre-fetched data (synchronous, fast)
 * Used for batch operations where all slugs are known upfront
 */
export function generateUniqueSlugSync(
	baseSlug: string,
	usedSlugs: Set<string>,
	currentPageId: string
): string {
	if (!usedSlugs.has(baseSlug)) return baseSlug;

	// Try appending numbers until we find a unique slug
	for (let i = 2; i <= 100; i++) {
		const candidate = `${baseSlug}-${i}`;
		if (!usedSlugs.has(candidate)) return candidate;
	}

	// Fallback: use page ID for absolute uniqueness
	return `${baseSlug}-${currentPageId.slice(-8)}`;
}
