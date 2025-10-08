// @ts-check
import { defineConfig } from 'symbiont-cms/config';

/**
 * Symbiont CMS configuration for guutz-blog.
 * Using defineConfig() provides full TypeScript autocomplete via JSDoc.
 * 
 * Environment variables:
 * - GRAPHQL_ENDPOINT: Your Nhost GraphQL endpoint
 * - NOTION_BLOG_DATABASE_ID: Your Notion database ID
 * 
 * @type {import('symbiont-cms').SymbiontConfig}
 */
const config = defineConfig({
	// PUBLIC: GraphQL endpoint (not secret, just a URL)
	// Replace with your actual endpoint or set GRAPHQL_ENDPOINT env var
	graphqlEndpoint: 'https://ygsdnfrbruuhtxczekur.graphql.us-west-2.nhost.run/v1',
	
	databases: [
		{
			// PUBLIC: Unique identifier for GraphQL queries
			short_db_ID: 'guutz-blog',
			
			// PUBLIC: Notion database ID (not secret, just an identifier)
			// Replace with your actual Notion database ID
			notionDatabaseId: '24a96d70-9f22-8066-897b-000b3b946090',
			
			// PRIVATE: Server-only function to determine if a page is published
			isPublicRule: (page) => {
				// @ts-ignore - Notion types are complex, this is safe at runtime
				const tags = page.properties.Tags;
				// @ts-ignore - multi_select exists on Tags property
				return tags?.multi_select?.some((/** @type {any} */ tag) => tag.name === 'LIVE') ?? false;
			},
			
			// PRIVATE: Server-only function to determine content source
			sourceOfTruthRule: () => 'NOTION',
			
			// PRIVATE: Server-only property name configuration
			slugPropertyName: 'Slug',
			
			// PRIVATE: Server-only custom slug extraction logic
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
