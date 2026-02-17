import { createSymbiontClient } from 'symbiont-cms';
import { guutzHooks } from './hooks/guutz-hooks.js';

/**
 * Symbiont CMS client for guutz-blog
 * 
 * This is the central configuration for the CMS.
 * Import and use this client anywhere in your app (client or server).
 * 
 * Migrated to hook-based configuration for better composability and testability.
 * 
 * TODO: Update Supabase credentials with actual values from your Supabase project
 * Get from: Supabase Dashboard → Project Settings → API
 */
export const symbiont = createSymbiontClient({
	supabase: {
		// TODO: Replace with actual Supabase project URL
		// These are placeholders - get your values from: Supabase Dashboard → Project Settings → API
		// Note: publishableKey (anon key) is safe to commit - it's public by design
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

			// Hook-based configuration (new)
			hooks: guutzHooks
		}
	]
});
