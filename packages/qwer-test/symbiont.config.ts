import { defineSymbiontConfig, type PageObjectResponse } from 'symbiont-cms';

/**
 * The main configuration for the Symbiont CMS.
 * This object is type-checked against the SymbiontConfig interface
 * to ensure all required rules and properties are defined correctly.
 */
const config = defineSymbiontConfig({
	databases: [
		{
			id: 'tech-article-staging',
			databaseIdEnvVar: 'NOTION_BLOG_DATABASE_ID',
			isPublicRule: (page: PageObjectResponse) => {
				// Type assertion to help TypeScript understand the shape of the property
				const status = page.properties.Status as { select: { name: string } | null };
				return status.select?.name === 'Published';
			},
			sourceOfTruthRule: () => 'NOTION',
		},
	],
});

export default config;

