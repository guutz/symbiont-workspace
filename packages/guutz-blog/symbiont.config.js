// @ts-check
import { defineConfig } from 'symbiont-cms/config';

/**
 * Symbiont CMS configuration for guutz-blog.
 * Using defineConfig() provides full TypeScript autocomplete via JSDoc.
 * 
 * Environment variables:
 * - GRAPHQL_ENDPOINT: Your Nhost GraphQL endpoint
 * - NOTION_BLOG_DB_ID: Your Notion database UUID
 * - NOTION_BLOG_TOKEN: Your Notion integration token
 * 
 * @type {import('symbiont-cms').SymbiontConfig}
 */
const config = defineConfig({
	// PUBLIC: GraphQL endpoint (not secret, just a URL)
	// Replace with your actual endpoint or set GRAPHQL_ENDPOINT env var
	graphqlEndpoint: 'https://ygsdnfrbruuhtxczekur.graphql.us-west-2.nhost.run/v1',
	
	databases: [
		{
			// PUBLIC: Human-readable identifier (used in routes/queries)
			alias: 'guutz-blog',
			
			// PRIVATE: Notion database UUID (server-only, can use env var)
			dataSourceId: '24a96d70-9f22-8066-897b-000b3b946090',
			
			// PRIVATE: Notion API integration token (server-only, MUST use env var)
			notionToken: process.env.NOTION_BLOG_TOKEN || '',
			
		// PRIVATE: Server-only function to determine if a page is published
		isPublicRule: (page) => {
			// @ts-ignore - Notion types are complex, this is safe at runtime
			const tags = page.properties.Tags;
			// @ts-ignore - multi_select exists on Tags property
			return tags?.multi_select?.some((/** @type {any} */ tag) => tag.name === 'LIVE') ?? false;
		},
		
		// PRIVATE: Server-only property name to sync generated slugs back to Notion
		slugSyncProperty: 'Slug',			// PRIVATE: Server-only custom slug extraction logic
			slugRule: (page) => {
				// @ts-ignore - Notion types are complex, this is safe at runtime
				const slugProperty = page.properties.Slug?.rich_text;
				if (slugProperty && slugProperty.length > 0) {
					return slugProperty[0]?.plain_text?.trim() || null;
				}
				
				return null; // Auto-generate from title
			},
		},
	],
});

export default config;
