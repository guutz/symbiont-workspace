import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { SymbiontConfig, WebsitePage } from './types.js';
import type { Database } from './database.types.js';

const PAGES_TABLE = 'pages';

/**
 * Options for fetching a single page
 */
export interface GetPageOptions {
	/** Custom fetch function for SSR context */
	fetch?: typeof globalThis.fetch;
	/** Database alias to query */
	alias?: string;
}

/**
 * Options for fetching multiple pages
 */
export interface GetAllPagesOptions {
	/** Custom fetch function for SSR context */
	fetch?: typeof globalThis.fetch;
	/** Maximum number of pages to return */
	limit?: number;
	/** Number of pages to skip */
	offset?: number;
	/** Database alias to query */
	alias?: string;
}

/**
 * The Symbiont client instance.
 * Created by calling createSymbiontClient() with your configuration.
 * Can be used in both client and server code.
 * 
 * **Supabase Client Pattern**:
 * - Contains a public/anon Supabase client (read-only access)
 * - Used for querying pages from your frontend/SSR
 * - Service role client (admin) is separate - used only in sync operations
 */
export interface SymbiontClient {
	/** The configuration passed during creation */
	config: SymbiontConfig;
	
	/** Supabase client instance (public/anon key for read-only queries) */
	supabase: SupabaseClient<Database>;
	
	/** Fetch a single page by slug */
	getPageBySlug(slug: string, options?: GetPageOptions): Promise<WebsitePage | null>;
	
	/** Fetch all pages for a database */
	getAllPages(options?: GetAllPagesOptions): Promise<WebsitePage[]>;
}

/**
 * Create a Symbiont CMS client instance.
 * 
 * This should be called once in your app, typically in `src/lib/symbiont.ts`:
 * 
 * @example
 * ```ts
 * // src/lib/symbiont.ts
 * import { createSymbiontClient } from 'symbiont-cms';
 * import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
 * 
 * export const symbiont = createSymbiontClient({
 *   supabase: {
 *     url: PUBLIC_SUPABASE_URL,
 *     publishableKey: PUBLIC_SUPABASE_ANON_KEY
 *   },
 *   databases: [
 *     {
 *       alias: 'blog',
 *       dataSourceId: 'your-notion-database-uuid',
 *       isPublicRule: (page) => page.properties.Public?.checkbox,
 *       publishDateRule: (page) => page.properties['Publish Date']?.date?.start
 *     }
 *   ]
 * });
 * ```
 * 
 * Then import and use it anywhere:
 * ```ts
 * import { symbiont } from '$lib/symbiont';
 * 
 * // In +page.server.ts
 * export const load = async ({ params, fetch }) => {
 *   const page = await symbiont.getPageBySlug(params.slug, { fetch });
 *   return { page };
 * };
 * ```
 * 
 * @param config - Your Symbiont configuration
 * @returns A Symbiont client instance with config and query methods
 */
export function createSymbiontClient(config: SymbiontConfig): SymbiontClient {
	// Create Supabase client with public credentials
	const supabase = createClient<Database>(config.supabase.url, config.supabase.publishableKey);
	
	/**
	 * Helper to resolve alias (uses first configured database if not specified)
	 */
	function resolveAlias(alias?: string): string {
		const resolvedAlias = alias ?? config.databases[0]?.alias;
		
		if (!resolvedAlias) {
			throw new Error(
				'No database alias configured or provided. Please either:\n' +
				'  1. Configure at least one database, or\n' +
				'  2. Provide an explicit alias in the query options'
			);
		}
		
		return resolvedAlias;
	}
	
	/**
	 * Create a Supabase client with optional custom fetch for SSR
	 */
	function getClient(customFetch?: typeof globalThis.fetch): SupabaseClient<Database> {
		if (!customFetch) return supabase;
		
		// Create a new client with custom fetch for SSR
		return createClient<Database>(
			config.supabase.url,
			config.supabase.publishableKey,
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
	
	return {
		config,
		supabase,
		
		async getPageBySlug(slug: string, options: GetPageOptions = {}): Promise<WebsitePage | null> {
			const client = getClient(options.fetch);
			const sourceAlias = resolveAlias(options.alias);
			
			const { data, error } = await client.from(PAGES_TABLE)
				.select('*')
				.like('datasource_alias', sourceAlias)
				.like('slug', slug)
				.maybeSingle();
			
			if (error) {
				throw new Error(`Query error: ${error.message}`);
			}
			
			return data as WebsitePage | null;
		},
		
		async getAllPages(options: GetAllPagesOptions = {}): Promise<WebsitePage[]> {
			const client = getClient(options.fetch);
			const sourceAlias = resolveAlias(options.alias);
			
			const offset = options.offset ?? 0;
			const limit = options.limit ?? 100;
			
			const { data, error } = await client.from(PAGES_TABLE)
				.select('*')
				.like('datasource_alias', sourceAlias)
				.order('publish_at', { ascending: false })
				.range(offset, offset + limit - 1);
			
			if (error) {
				throw new Error(`Query error: ${error.message}`);
			}
			
			return data as WebsitePage[];
		}
	};
}
