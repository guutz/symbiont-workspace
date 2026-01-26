/**
 * Public GraphQL query wrappers for Symbiont CMS (client-safe)
 * 
 * These functions can be used in both client and server contexts.
 * They load public config (graphqlEndpoint) and provide read-only queries.
 * 
 * For admin mutations (upsert, delete), see 'symbiont-cms/server' exports.
 */

import { loadConfig } from './load-config.js';
import type { Post } from '../types.js';
import { createClient as createSupabaseClient, SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../database.types.js';


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
 * Internal helper to create a Supabase client with public config
 */
async function createClient(customFetch?: typeof globalThis.fetch): Promise<{
	client: SupabaseClient<Database>;
	config: Awaited<ReturnType<typeof loadConfig>>;
}> {
	const config = await loadConfig();
	const client = createSupabaseClient<Database>(
		config.supabase.url,
		config.supabase.publishableKey,
		{ global: { fetch: customFetch } }
	);

	return { client, config };
}

/** Execute a public query against the pages table */
async function runPublicPagesQuery<T>(
	variables: Record<string, any>,
	options: { fetch?: typeof globalThis.fetch; alias?: string } = {}
): Promise<T> {
	const { client, config } = await createClient(options.fetch);
	const sourceAlias = resolveAlias(config, options.alias);

	return client.from(PAGES_TABLE)
				.select('*')
				.eq('datasource_alias', sourceAlias)
				.match(variables)
				.then(({ data, error }) => {
					if (error) {
						throw new Error(`Query error: ${error.message}`);
					}
					return { pages: data as T[] } as unknown as T;
				}
	);
}

function resolveAlias(config: Awaited<ReturnType<typeof loadConfig>>, alias?: string): string {
	const sourceAlias = alias ?? config.aliases[0];

	if (!sourceAlias) {
		throw new Error('No database alias configured or provided');
	}

	return sourceAlias;
}

// --- Public Query Functions ---

/**
 * Fetch a single post by slug
 * 
 * Automatically loads public config and creates a GraphQL client.
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
	const result = await runPublicPagesQuery<{ pages: Post[] }>(
		buildGetPostBySlug,
		{ slug },
		{ fetch: options.fetch, alias: options.alias }
	);
	return result.pages[0] ?? null;
}

/**
 * Fetch all posts for a database
 * 
 * Automatically loads public config and creates a GraphQL client.
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
	const result = await runPublicPagesQuery<{ pages: Post[] }>(
		buildGetAllPosts,
		{
			limit: options.limit ?? 100,
			offset: options.offset ?? 0
		},
		{ fetch: options.fetch, alias: options.alias }
	);
	
	return result.pages;
}
