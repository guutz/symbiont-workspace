// packages/california-tech/src/routes/api/toggle-theme/+server.ts
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ url, cookies }) => {
	// Read current theme from cookie (default to 'light' if not set)
	const currentTheme = cookies.get('theme') || 'light';
	
	// Toggle: dark -> light, light -> dark
	const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
	
	// Set the new theme cookie
	cookies.set('theme', newTheme, {
		path: '/',
		maxAge: 60 * 60 * 24 * 365 // One year
	});

	// Redirect back to the page the user was on
	const redirectTo = url.searchParams.get('redirectTo') || '/';
	throw redirect(303, redirectTo);
};