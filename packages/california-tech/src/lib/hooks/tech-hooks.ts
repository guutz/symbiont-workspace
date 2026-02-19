import type { Hook } from 'symbiont-cms';
import { parseTechIssueDate, parseWebsitePublishDate } from './utils/date-parser.js';

/**
 * California Tech custom hooks for Symbiont CMS.
 * 
 * **Extractor Pattern:**
 * - Hooks read from `ctx.page` and return values or `null`
 * - No `ctx.data`, no `ctx.skip()` - registry handles composition
 * - Return `null` to let next hook run (for primitives like dates)
 * - Objects are auto-merged by registry
 * 
 * These hooks customize page processing for the California Tech newspaper:
 * - Exclude Print Only and Advertisement articles
 * - Only publish articles with Status = "Published"
 * - Parse dates from Issue property with PST timezone
 * - Extract custom slug from Website Slug property
 */

/**
 * Exclude pages with "Print Only" or "Advertisement" tags from sync.
 * These articles should not appear on the website.
 * 
 * Priority: 40 (before default)
 */
export const excludePrintOnlyHook: Hook<boolean> = {
	name: 'tech:exclude:print-only',
	event: 'page:exclude',
	priority: 40,
	fn: async (ctx) => {
		const tags = ctx.page.properties.Tags;
		// @ts-ignore - Notion types are complex, this is safe at runtime
		const shouldExclude = tags?.multi_select?.some(
			(tag: any) => tag.name === 'Print Only' || tag.name === 'Advertisement'
		) ?? false;

		if (shouldExclude) {
			ctx.logger.info({
				event: 'page_excluded',
				pageId: ctx.page.id,
				reason: 'Print Only or Advertisement tag'
			});
		}

		return shouldExclude;
	}
};

/**
 * Check if page should be published based on Status property.
 * Only pages with Status = "Published" are public.
 * Also excludes Print Only and Advertisement articles.
 * 
 * Priority: 40 (before default)
 */
export const publishCheckHook: Hook<boolean> = {
	name: 'tech:publish:check',
	event: 'publish:check',
	priority: 40,
	fn: async (ctx) => {
		const status = ctx.page.properties.Status;
		const tags = ctx.page.properties.Tags;

		// @ts-ignore - Notion types are complex, this is safe at runtime
		const isPublished = status?.status?.name === 'Published';

		// @ts-ignore
		const hasPrintOnlyTag = tags?.multi_select?.some(
			(tag: any) => tag.name === 'Print Only' || tag.name === 'Advertisement'
		) ?? false;

		const shouldPublish = isPublished && !hasPrintOnlyTag;

		if (!shouldPublish) {
			ctx.logger.debug({
				event: 'publish_check_failed',
				pageId: ctx.page.id,
				// @ts-ignore - Notion types are complex
				status: status?.status?.name,
				hasPrintOnlyTag
			});
		}

		return shouldPublish;
	}
};

/**
 * Parse publish date from Issue property or Website Publish Date.
 * 
 * **Extractor Pattern:**
 * - Returns parsed date if found
 * - Returns `null` if no custom date (falls through to default hook)
 * 
 * Priority order:
 * 1. Issue property (e.g., "January 20, 2023") - parsed with PST timezone
 * 2. Website Publish Date property
 * 3. Return null → falls through to default (last_edited_time)
 * 
 * Priority: 40 (before default)
 */
export const publishDateHook: Hook<string | null> = {
	name: 'tech:publish:date:issue-based',
	event: 'publish:date',
	priority: 40,
	fn: async (ctx) => {
		// @ts-ignore
		const issueProperty = ctx.page.properties.Issue?.select?.name;

		// Try Issue property first
		if (issueProperty) {
			const parsed = parseTechIssueDate(issueProperty);
			if (parsed) {
				ctx.logger.debug({
					event: 'publish_date_from_issue',
					pageId: ctx.page.id,
					issue: issueProperty,
					date: parsed
				});
				return parsed;
			}
		}

		// Try Website Publish Date property
		// @ts-ignore
		const websiteDate = ctx.page.properties['Website Publish Date']?.date?.start;
		if (websiteDate) {
			const parsed = parseWebsitePublishDate(websiteDate);
			if (parsed) {
				ctx.logger.debug({
					event: 'publish_date_from_website_property',
					pageId: ctx.page.id,
					date: parsed
				});
				return parsed;
			}
		}

		// Return null to fall through to default hook (last_edited_time)
		ctx.logger.debug({
			event: 'publish_date_fallback_to_default',
			pageId: ctx.page.id
		});
		return null;
	}
};

/**
 * Extract custom slug from Website Slug property.
 * 
 * **Extractor Pattern:**
 * - Returns custom slug if found
 * - Returns `null` if not present (falls through to auto-generation)
 * 
 * Priority: 40 (before default)
 */
export const slugExtractHook: Hook<string | null> = {
	name: 'tech:slug:extract',
	event: 'slug:extract',
	priority: 40,
	fn: async (ctx) => {
		// @ts-ignore
		const slugProperty = ctx.page.properties['Website Slug']?.rich_text;
		const customSlug = slugProperty?.[0]?.plain_text?.trim() || null;

		if (customSlug) {
			ctx.logger.debug({
				event: 'slug_extracted_from_property',
				pageId: ctx.page.id,
				slug: customSlug
			});
		}

		return customSlug;
	}
};

/**
 * All California Tech hooks in one array.
 * Export this and register it in your symbiont.ts config.
 */
export const techHooks: Hook[] = [
	excludePrintOnlyHook,
	publishCheckHook,
	publishDateHook,
	slugExtractHook
];
