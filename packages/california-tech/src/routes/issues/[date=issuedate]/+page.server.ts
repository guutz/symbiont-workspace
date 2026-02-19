/**
 * Server-side load function for archive issue pages
 * 
 * Route: /issues/YYYY-MM-DD or /issues/YYYY-MM-DD.pdf
 * 
 * Both routes redirect to the resolver_url from the archives database.
 * Archives don't have content - they're external resources accessed via Caltech's resolver system.
 */

import { symbiont } from '$lib/symbiont';
import { error, redirect } from '@sveltejs/kit';

// ISR config - enable SvelteKit's ISR caching
export const config = {
	maxage: 60,
	revalidate: 60
};

// Dynamic route - fetches archives from database at request time
export const prerender = false;

// Fetch archive issue and redirect to resolver
export const load = async (event: any) => {
	const dateParam = event.params.date;
	
	// Strip .pdf extension if present (both routes work the same)
	const slug = dateParam.replace(/\.pdf$/, '');
	
	// Fetch the archive issue by date slug
	const post = await symbiont.getPageBySlug(slug, {
		fetch: event.fetch,
		alias: 'tech-archives'
	});
	
	if (!post) {
		throw error(404, `Archive issue not found for ${slug}`);
	}
	
	// Redirect to resolver URL
	const resolverUrl = post.metadata?.resolver_url;
	
	if (!resolverUrl) {
		throw error(500, `Archive issue ${slug} has no resolver URL configured`);
	}
	
	// Redirect to Caltech resolver
	throw redirect(302, resolverUrl);
};
