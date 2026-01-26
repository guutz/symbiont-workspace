/**
 * Public Supabase query wrappers for Symbiont CMS (client-safe)
 * 
 * These functions can be used in both client and server contexts.
 * They use the virtual config module for public configuration.
 * 
 * For admin mutations (upsert, delete), see 'symbiont-cms/server' exports.
 */

import config from 'virtual:symbiont/config';
import type { Post } from '../types.js';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types.js';

// --- Constants (extracted from virtual config at module level) ---

const PAGES_TABLE = 'pages';
const SUPABASE_URL = config.supabase.url;
const SUPABASE_KEY = config.supabase.publishableKey;
const DEFAULT_ALIAS = config.aliases[0] || undefined; // May be undefined if no databases configured

// --- Query Options ---

export interface GetPostOptions {
	/** Custom fetch function for SSR context */
	fetch?: typeof globalThis.fetch;
	/** Database alias to query */
	alias?: string;
}

export interface GetAllPostsOptions {
	/** Custom fetch function for SSR context */
	fetch?: typeof globalThis.fetch;
	/** Maximum number of posts to return */
	limit?: number;
	/** Number of posts to skip */
	offset?: number;
	/** Database alias to query */
	alias?: string;
}

// --- Helper: Create Client ---

/**
 * Internal helper to create a Supabase client with public config.
 * Creates a new client per request (necessary for SSR cookie handling).
 */
function createClient(customFetch?: typeof globalThis.fetch): SupabaseClient<Database> {
	return createSupabaseClient<Database>(
		SUPABASE_URL,
		SUPABASE_KEY,
		{ 
			global: { fetch: customFetch },
			auth: {
				persistSession: false,
				autoRefreshToken: false,
				detectSessionInUrl: false
			}
		}
	);
}

// --- Public Query Functions ---

/**
 * Fetch a single post by slug
 * 
 * Automatically loads public config and creates a Supabase client.
 * Pass `fetch` from SvelteKit load context for SSR.
 * 
 * @param slug - The post slug to fetch
 * @param options - Optional fetch function for SSR
 * @returns The post if found, null otherwise
 * 
 * @example
 * // In +page.server.ts
 * import { getPostBySlug } from 'symbiont-cms';
 * 
 * export const load = async ({ params, fetch }) => {
 *   const post = await getPostBySlug(params.slug, { fetch });
 *   if (!post) throw error(404);
 *   return { post };
 * };
 */
export async function getPostBySlug(
	slug: string,
	options: GetPostOptions = {}
): Promise<Post | null> {
	const client = createClient(options.fetch);
	const sourceAlias = options.alias ?? DEFAULT_ALIAS;
	
	if (!sourceAlias) {
		throw new Error('No database alias configured or provided');
	}
	
	const { data, error } = await client.from(PAGES_TABLE)
		.select('*')
		.eq('datasource_alias', sourceAlias)
		.eq('slug', slug)
		.maybeSingle();
	
	if (error) {
		throw new Error(`Query error: ${error.message}`);
	}
	
	return data as Post | null;
}

/**
 * Fetch all posts for a database
 * 
 * Automatically loads public config and creates a Supabase client.
 * Pass `fetch` from SvelteKit load context for SSR.
 * 
 * @param options - Fetch function, pagination, and database selection
 * @returns Array of posts
 * 
 * @example
 * // In +page.server.ts
 * import { getAllPosts } from 'symbiont-cms';
 * 
 * export const load = async ({ fetch }) => {
 *   const posts = await getAllPosts({ fetch, limit: 10, alias: 'blog' });
 *   return { posts };
 * };
 */
export async function getAllPosts(
	options: GetAllPostsOptions = {}
): Promise<Post[]> {
	const client = createClient(options.fetch);
	const sourceAlias = options.alias ?? DEFAULT_ALIAS;
	
	if (!sourceAlias) {
		throw new Error('No database alias configured or provided');
	}
	
	const offset = options.offset ?? 0;
	const limit = options.limit ?? 100;
	
	const { data, error } = await client.from(PAGES_TABLE)
		.select('*')
		.eq('datasource_alias', sourceAlias)
		.order('publish_at', { ascending: false })
		.range(offset, offset + limit - 1);
	
	if (error) {
		throw new Error(`Query error: ${error.message}`);
	}
	
	return data as Post[];
}
