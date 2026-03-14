import { createSymbiontClient } from 'symbiont-cms';
import { techHooks, archiveIssueHooks, websitePagesHooks } from './hooks/tech-hooks.js';

export const SUPABASE_URL = 'https://xguzskbxiptvhbyggkpl.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_6L-isfCogfHJxcnTT9WseA_U4GUHcAB';

/**
 * Symbiont CMS client for California Tech
 * 
 * This is the central configuration for the CMS.
 * Import and use this client anywhere in your app (client or server).
 * 
 * Migrated to hook-based configuration for better composability and testability.
 */
export const symbiont = createSymbiontClient({
	supabase: {
		url: SUPABASE_URL,
		publishableKey: SUPABASE_PUBLISHABLE_KEY
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
			alias: 'tech-article-staging',
			dataSourceId: '6cc3888f-d9fa-4075-add9-b596e6fc44f3',

			syncBackToNotion: {
				content: false,
				properties: true,
			},

			hooks: techHooks,

			slugProperty: 'Website Slug',
			tagsProperty: 'Tags',
			authorsProperty: 'Authors',
			coverProperty: 'Cover Photo',
			summaryProperty: 'Website Summary'
		},
		{
			alias: 'tech-archives',
			dataSourceId: '3061cbde-6d28-8093-96e0-000bc5d1741a',
			hooks: archiveIssueHooks
		},
		{
			alias: 'tech-website-pages',
			dataSourceId: '3061cbde-6d28-8081-8ddb-000bbc2f76e1',
			slugProperty: 'Slug',
			hooks: websitePagesHooks
		}
	]
});
