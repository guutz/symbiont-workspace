// packages/california-tech/src/routes/api/toggle-theme/+server.ts
import { json, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ url, cookies }) => {
	const theme = url.searchParams.get('theme');
	const redirectTo = url.searchParams.get('redirectTo') || '/';

	if (theme) {
		cookies.set('theme', theme, {
			path: '/',
			maxAge: 60 * 60 * 24 * 365 // One year
		});
	}

	// Redirect back to the page the user was on
	throw redirect(303, redirectTo);
};
