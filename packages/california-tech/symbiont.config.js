// @ts-check
import { defineConfig } from 'symbiont-cms/config';

/**
 * The main configuration for the Symbiont CMS.
 * Using defineConfig() provides full TypeScript autocomplete and type checking.
 * 
 * @type {import('symbiont-cms').SymbiontConfig}
 */
const config = defineConfig({
	// PUBLIC: Supabase configuration for client-side access
	supabase: {
		url: 'https://xguzskbxiptvhbyggkpl.supabase.co',
		publishableKey: 'sb_publishable_6L-isfCogfHJxcnTT9WseA_U4GUHcAB',
	},

	markdown: {
		toc: {
			enabled: true,
			minHeadingLevel: 1,
			maxHeadingLevel: 4,
		}
	},
	
	databases: [
		{
			// PUBLIC: Human-readable identifier (used in routes/queries)
			alias: 'tech-article-staging',
			
			// PRIVATE: Notion database UUID (server-only, can use env var)
			dataSourceId: '6cc3888f-d9fa-4075-add9-b596e6fc44f3',
			
			// PRIVATE: Notion API token - can be env var name or actual token
			// Omit to use default NOTION_TOKEN env var
			notionToken: 'NOTION_TOKEN',
			
			// PRIVATE: Server-only function to determine if a page is published
			isPublicRule: (page) => {
				const status = page.properties.Status;
				const tags = page.properties.Tags;
				// @ts-ignore
				return status?.status?.name === 'Published' && !tags?.multi_select?.some(tag => tag.name === 'Print Only');
			},

			// PRIVATE: Server-only function to determine the publish date
			publishDateRule: (page) => {
				// @ts-ignore - Notion types are complex, this is safe at runtime
				const issueProperty = page.properties.Issue?.select?.name;
				
				if (!issueProperty) {
					return null; // No issue date = unpublished
				}
				
				try {
					// Parse "7 October 2025" format
					// Append time and timezone to ensure we get 7am Pacific
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
		
			// PRIVATE: Server-only property name to sync generated slugs back to Notion
			slugSyncProperty: "Website Slug",

			tagsProperty: "Tags",

			authorsProperty: "Authors",

			coverProperty: "Cover Photo",
			
			// PRIVATE: Server-only custom slug extraction logic
			slugRule: (page) => {
				// @ts-ignore - Notion types are complex, this is safe at runtime
				const slugProperty = page.properties["Website Slug"]?.rich_text;
				return slugProperty?.[0]?.plain_text?.trim() || null;
			},
		},
	],
});

export default config;
