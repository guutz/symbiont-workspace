import { createSymbiontClient, type PageObjectResponse } from 'symbiont-cms';

/**
 * Symbiont CMS client for guutz-blog
 * 
 * This is the central configuration for the CMS.
 * Import and use this client anywhere in your app (client or server).
 * 
 * TODO: Update Supabase credentials with actual values from your Supabase project
 * Get from: Supabase Dashboard → Project Settings → API
 */
export const symbiont = createSymbiontClient({
	supabase: {
		// TODO: Replace with actual Supabase project URL
		url: 'https://your-project.supabase.co',
		// TODO: Replace with actual publishable (anon) key - this is safe to expose
		publishableKey: 'your-supabase-anon-key'
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
			alias: 'guutz-blog',
			dataSourceId: '24a96d70-9f22-8066-897b-000b3b946090',

			// Server-only function to determine if a page is published
			isPublicRule: (page: PageObjectResponse) => {
				// @ts-ignore - Notion types are complex, this is safe at runtime
				const tags = page.properties.Tags;
				// @ts-ignore - multi_select exists on Tags property
				return tags?.multi_select?.some((tag: any) => tag.name === 'LIVE') ?? false;
			},

			slugRule: (page: PageObjectResponse) => {
				// @ts-ignore - Notion types are complex, this is safe at runtime
				const slugProperty = page.properties.Slug?.rich_text;
				if (slugProperty && slugProperty.length > 0) {
					return slugProperty[0]?.plain_text?.trim() || null;
				}
				
				return null; // Auto-generate from title
			}
		}
	]
});
