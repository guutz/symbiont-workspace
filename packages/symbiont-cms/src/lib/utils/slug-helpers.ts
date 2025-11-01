import slugify from 'slugify';

/**
 * Create a URL-safe slug from text
 */
export const createSlug = (text: string): string => 
	slugify.default?.(text, { lower: true, strict: true }) ?? 
	(slugify as any)(text, { lower: true, strict: true });

