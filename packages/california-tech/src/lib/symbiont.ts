import { createSymbiontClient } from 'symbiont-cms';
import { calTechHooks } from './hooks/caltech-hooks.js';

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
		url: 'https://xguzskbxiptvhbyggkpl.supabase.co',
		publishableKey: 'sb_publishable_6L-isfCogfHJxcnTT9WseA_U4GUHcAB'
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

			// Hook-based configuration (new)
			hooks: calTechHooks,

			// Property mappings (unchanged)
			slugSyncProperty: 'Website Slug',
			tagsProperty: 'Tags',
			authorsProperty: 'Authors',
			coverProperty: 'Cover Photo',
			summaryProperty: 'Website Summary'
		}
	]
});
