// @ts-check
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
			dbNickname: 'tech-article-staging',
			
			// PUBLIC: Notion database ID (not secret, just an identifier)
			notionDatabaseId: '6cc3888f-d9fa-4075-add9-b596e6fc44f3',
			
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
		
			// PRIVATE: Server-only function to determine content source
			sourceOfTruthRule: () => 'NOTION',
			
			// PRIVATE: Server-only property name configuration
			slugPropertyName: "Website Slug",
			
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
