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
				const status = page.properties.Status as { select: { name: string } | null };
				return status.select?.name === 'Published';
			},
			sourceOfTruthRule: () => 'NOTION',
			slugPropertyName: "Website Slug",
			// Optional: Custom slug rule - using default behavior
			// This reads from the "Slug" property, or auto-generates if empty
			slugRule: (page: PageObjectResponse) => {
				const slugProperty = (page.properties["Website Slug"] as any)?.rich_text;
				return slugProperty?.[0]?.plain_text?.trim() || null;
			},
		},
	],
});

export default config;

