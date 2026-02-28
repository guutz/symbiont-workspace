import type { Hook, HookContext } from 'symbiont-cms';
import { parseTechIssueDate, parseWebsitePublishDate } from './utils/date-parser.js';

/**
 * California Tech custom hooks for Symbiont CMS.
 * 
 * These hooks customize page processing for the California Tech newspaper:
 * - Exclude Print Only and Advertisement articles from sync
 * - Only publish articles with Status = "Published"
 * - Parse dates from Issue property with PST timezone
 * - Extract custom slug from Website Slug property
 */

/**
 * Exclude pages with "Print Only" or "Advertisement" tags from sync.
 * These articles should not appear on the website.
 * 
 * Uses page:should-sync event (AndAll strategy):
 * - Return false to exclude the page from sync
 * - Return true to allow sync
 * - Return null for no opinion
 */
export const excludePrintOnlyHook: Hook<boolean> = {
	name: 'tech:exclude:print-only',
	event: 'page:should-sync',
	priority: 'override',
	fn: async (ctx: HookContext) => {
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
			return false; // Don't sync this page
		}

		return true; // Allow sync
	}
};

/**
 * Check if page should be published based on Status property.
 * Only pages with Status = "Published" are public.
 * Also excludes Print Only and Advertisement articles.
 * 
 * Uses publish:check event (AndAll strategy):
 * - Return false to prevent publishing (page syncs but publish_at is null)
 * - Return true to allow publishing
 * - Return null for no opinion
 */
export const publishCheckHook: Hook<boolean> = {
	name: 'tech:publish:check',
	event: 'publish:check',
	priority: 'override',
	fn: async (ctx: HookContext) => {
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
 * Priority order:
 * 1. Issue property (e.g., "January 20, 2023") - parsed with PST timezone
 * 2. Website Publish Date property
 * 3. Return null → falls through to default (last_edited_time)
 */
export const publishDateHook: Hook<string | Date> = {
	name: 'tech:publish:date:issue-based',
	event: 'publish:date',
	priority: 'override',
	fn: async (ctx: HookContext) => {
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
 * Returns custom slug if found, otherwise null to allow auto-generation.
 */
export const slugExtractHook: Hook<string> = {
	name: 'tech:slug:extract',
	event: 'slug:extract',
	priority: 'override',
	fn: async (ctx: HookContext) => {
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
		priority: 'override',
		fn: async (ctx: HookContext) => {
			// Slug from date property (e.g. "2024-10-21")
			const dateSlug = (ctx.page.properties.date as any)?.date?.start;
			if (dateSlug) {
				// parse ISO 8601 and return YYYY-MM-DD slug
				const date = new Date(dateSlug);
				return date.toISOString().split('T')[0];
			}
			return null;
		}
	},
	{
		name: 'archives:metadata:resolver',
		event: 'metadata:custom',
		priority: 'override',
		fn: async (ctx: HookContext) => {
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
		event: 'page:should-sync',
		priority: 'override',
		fn: async (ctx: HookContext) => {
			const status = (ctx.page.properties.Status as any)?.select?.name;
			const shouldExclude = status === 'Draft';
			
			if (shouldExclude) {
				ctx.logger.info({
					event: 'page_excluded',
					pageId: ctx.page.id,
					title: (ctx.page.properties.Title as any)?.title?.[0]?.plain_text,
					reason: 'Status is Draft - not syncing'
				});
				return false; // Don't sync
			}
			
			return true; // Allow sync
		}
	},
	
	// "Not shown" pages: sync to DB but set published_at to null
	{
		name: 'pages:publish:not-shown',
		event: 'publish:check',
		priority: 'override',
		fn: async (ctx: HookContext) => {
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
	// Note: page:validate event no longer exists, using page:before for validation warnings
	{
		name: 'pages:validate:redirects',
		event: 'page:before',
		priority: 'override',
		fn: async (ctx: HookContext) => {
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
			
			// page:before hooks are RunAll, no return value needed
		}
	},
	
	// Extract custom metadata: type, status, redirectLink, file
	{
		name: 'pages:metadata:page-type',
		event: 'metadata:custom',
		priority: 'override',
		fn: async (ctx: HookContext) => {
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
