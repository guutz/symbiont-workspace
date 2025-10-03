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
			
			// Optional: Custom slug rule
			// If not provided, defaults to reading from the "Slug" property
			slugRule: (page: PageObjectResponse) => {
				// Read from the default "Slug" property
				const slugProperty = (page.properties.Slug as any)?.rich_text;
				if (slugProperty && slugProperty.length > 0) {
					return slugProperty[0]?.plain_text?.trim() || null;
				}
				
				// Could also use a different property:
				// const customSlug = (page.properties.CustomSlug as any)?.rich_text?.[0]?.plain_text;
				// return customSlug?.trim() || null;
				
				// Or build from multiple properties:
				// const category = (page.properties.Category as any)?.select?.name;
				// const title = (page.properties.Name as any)?.title?.[0]?.plain_text;
				// return category ? `${category.toLowerCase()}-${title}` : null;
				
				return null; // Auto-generate from title
			},
		},
	],
});

export default config;

