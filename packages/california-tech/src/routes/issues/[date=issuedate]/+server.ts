/**
 * Route: /issues/YYYY-MM-DD or /issues/YYYY-MM-DD.pdf
 *
 * Looks up the archive issue in the DB. If resolver_url ends in .pdf,
 * re-streams it so the browser URL stays unchanged. Otherwise 404.
 */

import { symbiont } from '$lib/symbiont';
import type { RequestHandler } from '@sveltejs/kit';

export const GET: RequestHandler = async ({ params, fetch }) => {
	const date = params.date.endsWith('.pdf') ? params.date.slice(0, -4) : params.date;

	const post = await symbiont.getPageBySlug(date, { fetch, alias: 'tech-archives' });

	if (!post) {
		return new Response(`No issue found for ${date}`, { status: 404 });
	}

	const resolverUrl: string | undefined = post.meta?.resolver_url;
	if (!resolverUrl?.endsWith('.pdf')) {
		// No PDF — redirect to whatever resolver URL we have, or 404
		return resolverUrl
			? new Response(null, { status: 302, headers: { Location: resolverUrl } })
			: new Response(`No PDF available for ${date}`, { status: 404 });
	}

	const upstream = await fetch(resolverUrl);
	if (!upstream.ok) {
		// Upstream failed — fall back to redirect rather than a bare error
		return new Response(null, { status: 302, headers: { Location: resolverUrl } });
	}

	const headers: Record<string, string> = {
		'Content-Type': 'application/pdf',
		'Content-Disposition': `inline; filename="${date}.pdf"`,
		'Cache-Control': 'public, max-age=31536000, immutable'
	};
	const length = upstream.headers.get('content-length');
	if (length) headers['Content-Length'] = length;

	return new Response(upstream.body, { status: 200, headers });
};

