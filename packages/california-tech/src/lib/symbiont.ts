import { createSymbiontClient, type PageObjectResponse } from 'symbiont-cms';

/**
 * Symbiont CMS client for California Tech
 * 
 * This is the central configuration for the CMS.
 * Import and use this client anywhere in your app (client or server).
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

			// Conceivably once we get the web editor working, we might want to be able to edit Print Only articles
			// from the web interface -- but for now, just exclude them from the sync entirely.
			// Also this currently doesn't remove existing Print Only articles from the database,
			// so that would be an issue if an article was synced automatically before the tag was added.
			excludeRule: (page: PageObjectResponse) => {
				const tags = page.properties.Tags; // @ts-ignore
				return tags?.multi_select?.some((tag: any) => 
					tag.name === 'Print Only' || tag.name === 'Advertisement'
				) ?? false;
			},

			isPublicRule: (page: PageObjectResponse) => {
				const status = page.properties.Status;
				const tags = page.properties.Tags;
				return ( // @ts-ignore
					status?.status?.name === 'Published' && // @ts-ignore
					!tags?.multi_select?.some((tag: any) => tag.name === 'Print Only' || tag.name === 'Advertisement')
				);
			},

			publishDateRule: (page: PageObjectResponse) => {
				// @ts-ignore
				const issueProperty = page.properties.Issue?.select?.name;

				if (!issueProperty) {
					return null;
				}

				try {
					const dateString = `${issueProperty} 07:00:00 GMT-0700`;
					const date = new Date(dateString);

					if (isNaN(date.getTime())) {
						console.warn(`Invalid date format in Issue property: "${issueProperty}"`);
						return null;
					}

					return date.toISOString();
				} catch (error) {
					console.error(`Error parsing Issue property "${issueProperty}":`, error);
					return null;
				}
			},

			slugSyncProperty: 'Website Slug',
			tagsProperty: 'Tags',
			authorsProperty: 'Authors',
			coverProperty: 'Cover Photo',

			slugRule: (page: PageObjectResponse) => {
				// @ts-ignore
				const slugProperty = page.properties['Website Slug']?.rich_text;
				return slugProperty?.[0]?.plain_text?.trim() || null;
			}
		}
	]
});
