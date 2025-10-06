import { defineConfig } from 'symbiont-cms/config';

/**
 * The main configuration for the Symbiont CMS.
 * Using defineConfig() provides full TypeScript autocomplete and type checking.
 * 
 * @type {import('symbiont-cms').SymbiontConfig}
 */
const config = defineConfig({
	// PUBLIC: GraphQL endpoint (not secret, just a URL)
	graphqlEndpoint: 'https://ygsdnfrbruuhtxczekur.graphql.us-west-2.nhost.run/v1',
	
	databases: [
		{
			// PUBLIC: Unique identifier for GraphQL queries
			short_db_ID: 'tech-article-staging',
			
			// PUBLIC: Notion database ID (not secret, just an identifier)
			notionDatabaseId: '6cc3888f-d9fa-4075-add9-b596e6fc44f3',
			
			// PRIVATE: Server-only function to determine if a page is published
			isPublicRule: (page) => {
				const status = page.properties.Status;
				return status.select?.name === 'Published';
			},
			
			// PRIVATE: Server-only function to determine content source
			sourceOfTruthRule: () => 'NOTION',
			
			// PRIVATE: Server-only property name configuration
			slugPropertyName: "Website Slug",
			
			// PRIVATE: Server-only custom slug extraction logic
			slugRule: (page) => {
				const slugProperty = page.properties["Website Slug"]?.rich_text;
				return slugProperty?.[0]?.plain_text?.trim() || null;
			},
		},
	],
});

export default config;
