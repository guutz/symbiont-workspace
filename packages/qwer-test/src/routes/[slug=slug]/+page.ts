/**
 * Client-side load function for post pages
 * 
 * This runs in the browser during SPA navigation and provides:
 * - Fast client-side transitions (no full page reload)
 * - Fetches from /api/posts/[slug] endpoint
 * - Smooth UX when clicking between posts
 * 
 * Falls back to +page.server.ts if:
 * - JavaScript is disabled
 * - Initial page load (SSR)
 * - Direct URL navigation
 */

export const load = async ({ params, fetch }: { params: { slug: string }; fetch: typeof globalThis.fetch }) => {
	try {
		// Fetch post data from API endpoint (cached on server)
		const response = await fetch(`/api/posts/${params.slug}`);
		
		if (!response.ok) {
			throw new Error(`Failed to fetch post: ${response.status}`);
		}
		
		const data = await response.json();
		return data;
	} catch (error) {
		console.error('[+page.ts] Error loading post:', error);
		// Let SvelteKit handle the error
		throw error;
	}
};
