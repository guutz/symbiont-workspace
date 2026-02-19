import { createSymbiontClient } from 'symbiont-cms';
import { techHooks } from './hooks/tech-hooks.js';

/**
 * Symbiont CMS client for California Tech
 * 
 * This is the central configuration for the CMS.
 * Import and use this client anywhere in your app (client or server).
 * 
 * Migrated to hook-based configuration for better composability and testability.
 */
export const symbiont = createSymbiontClient({
	supabase: {
		url: 'https://xguzskbxiptvhbyggkpl.supabase.co',
		publishableKey: 'sb_publishable_6L-isfCogfHJxcnTT9WseA_U4GUHcAB'
	},

	markdown: {
		toc: {
			enabled: true,
			minHeadingLevel: 1,
			maxHeadingLevel: 4
		}
	},

	databases: [
		{
			alias: 'tech-article-staging',
			dataSourceId: '6cc3888f-d9fa-4075-add9-b596e6fc44f3',

			// Hook-based configuration (new)
			hooks: techHooks,

			slugSyncProperty: 'Website Slug',
			tagsProperty: 'Tags',
			authorsProperty: 'Authors',
			coverProperty: 'Cover Photo',
			summaryProperty: 'Website Summary'
		},
		{
			alias: 'tech-archives',
			dataSourceId: '3061cbde-6d28-8093-96e0-000bc5d1741a',

			hooks: [
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
				}
			]
		},
		{
			alias: 'tech-website-pages',
			dataSourceId: '3061cbde-6d28-8081-8ddb-000bbc2f76e1',

			hooks: [
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
					},
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
			]
		}
	]
});
