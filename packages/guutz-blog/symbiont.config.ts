import { defineSymbiontConfig, type PageObjectResponse } from 'symbiont-cms';

/**
 * The main configuration for the Symbiont CMS.
 * This object is type-checked against the SymbiontConfig interface
 * to ensure all required rules and properties are defined correctly.
 */
const config = defineSymbiontConfig({
	databases: [
		{
			id: 'guutz-blog',
			databaseIdEnvVar: 'NOTION_BLOG_DATABASE_ID',
			isPublicRule: (page: PageObjectResponse) => {
				// Type assertion to help TypeScript understand the shape of the property
				const tags = page.properties.Tags as { multi_select: { name: string }[] };
				return tags?.multi_select.some((tag) => tag.name === 'LIVE') ?? false;
			},
			sourceOfTruthRule: () => 'NOTION',
		},
	],
});

export default config;

