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
 * Archive issue hooks for tech-archives database.
 * Handles date-based slugs and resolver URLs.
 */
export const archiveIssueHooks: Hook[] = [
	{
		name: 'archives:date',
		event: 'slug:extract',
		priority: 40,
		fn: async (ctx) => {
			// Slug from date property (e.g. "2024-10-21")
			const dateSlug = (ctx.page.properties.date as any)?.date?.start;
			if (dateSlug) {
				// parse ISO 8601 and return YYYY-MM-DD slug
				const date = new Date(dateSlug);
				return date.toISOString().split('T')[0];
			}
		}
	},
	{
		name: 'archives:metadata:resolver',
		event: 'metadata:custom',
		priority: 40,
		fn: async (ctx) => {
			// Extract resolver URL for Caltech archives
			const resolverUrl = (ctx.page.properties.resolver_url as any)?.url;
			
			return {
				resolver_url: resolverUrl || null
			};
		}
	}
];

/**
 * Website pages hooks for tech-website-pages database.
 * Handles static pages, redirects, and page status (Live/Draft/Not shown).
 */
export const websitePagesHooks: Hook[] = [
	// Exclude "Draft" pages - don't sync at all, keeps previous live version
	{
		name: 'pages:exclude:draft',
		event: 'page:exclude',
		priority: 40,
		fn: async (ctx) => {
			const status = (ctx.page.properties.Status as any)?.select?.name;
			const shouldExclude = status === 'Draft';
			
			if (shouldExclude) {
				ctx.logger.info({
					event: 'page_excluded',
					pageId: ctx.page.id,
					title: (ctx.page.properties.Title as any)?.title?.[0]?.plain_text,
					reason: 'Status is Draft - not syncing'
				});
			}
			
			return shouldExclude;
		}
	},
	
	// "Not shown" pages: sync to DB but set published_at to null
	{
		name: 'pages:publish:not-shown',
		event: 'publish:check',
		priority: 40,
		fn: async (ctx) => {
			const status = (ctx.page.properties.Status as any)?.select?.name;
			
			if (status === 'Not shown') {
				ctx.logger.info({
					event: 'page_unpublished',
					pageId: ctx.page.id,
					title: (ctx.page.properties.Title as any)?.title?.[0]?.plain_text,
					reason: 'Status is Not shown - setting published_at to null'
				});
				return false; // published_at will be null
			}
			
			// Live pages are published
			return status === 'Live';
		}
	},
	
	// Validate that Redirect pages have either a redirect link or file
	{
		name: 'pages:validate:redirects',
		event: 'page:validate',
		priority: 40,
		fn: async (ctx) => {
			const type = (ctx.page.properties.Type as any)?.select?.name;
			
			if (type === 'Redirect') {
				const redirectLink = (ctx.page.properties['Redirect Link'] as any)?.url;
				const file = (ctx.page.properties.File as any)?.files?.[0];
				
				if (!redirectLink && !file) {
					ctx.logger.warn({
						event: 'validation_warning',
						pageId: ctx.page.id,
						title: (ctx.page.properties.Title as any)?.title?.[0]?.plain_text,
						issue: 'Redirect type page has no Redirect Link or File'
					});
				}
			}
			
			// Validation hooks don't exclude, just warn
			return null;
		}
	},
	
	// Extract custom metadata: type, status, redirectLink, file
	{
		name: 'pages:metadata:page-type',
		event: 'metadata:custom',
		priority: 40,
		fn: async (ctx) => {
			const type = (ctx.page.properties.Type as any)?.select?.name || 'Content';
			const status = (ctx.page.properties.Status as any)?.select?.name || 'Live';
			const redirectLink = (ctx.page.properties['Redirect Link'] as any)?.url;
			const file = (ctx.page.properties.File as any)?.files?.[0];
			
			return {
				pageType: type,
				pageStatus: status,
				...(redirectLink && { redirectLink }),
				...(file && {
					file: {
						name: file.name,
						url: file.type === 'external' ? file.external?.url : file.file?.url,
						type: file.type
					}
				})
			};
		}
	}
];

/**
 * Article hooks for tech-article-staging database.
 * Exported as default export for backwards compatibility.
 */
export const techHooks: Hook[] = [
	excludePrintOnlyHook,
	publishCheckHook,
	publishDateHook,
	slugExtractHook
];
