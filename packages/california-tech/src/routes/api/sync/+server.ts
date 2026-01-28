import { handlePollBlogRequest } from 'symbiont-cms/server';
import { symbiont } from '$lib/symbiont.js';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Sync endpoint for California Tech
 * Authenticates with CRON_SECRET and syncs content from Notion to Supabase
 */
export async function GET(event: RequestEvent) {
	return handlePollBlogRequest(symbiont, event);
}