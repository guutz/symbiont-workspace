import type { PageObjectResponse } from '@notionhq/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseBlueprint } from '../types.js';
import type { Database } from '../database.types.js';

/**
 * Hook lifecycle events in the page transformation pipeline.
 * These are built-in event types that Symbiont defines.
 * 
 * **Hook Patterns:**
 * 
 * 1. **Extractor Hooks** (pure, data-oriented):
 *    - Return data extracted from ctx.page
 *    - Compose via first-non-null (primitives), merge (objects), concat (arrays)
 *    - Examples: metadata:*, slug:extract, cover:extract
 * 
 * 2. **Effect Hooks** (side-effect oriented):
 *    - Perform actions (uploads, syncs, mutations)
 *    - All hooks execute (no early stopping)
 *    - Return void, boolean, or result object
 *    - Examples: sync:*, *:process
 */
export type HookEvent =
	// Early validation (EXTRACTOR)
	| 'page:exclude' // Should page be excluded from sync?
	| 'page:validate' // Is page data valid?

	// Metadata extraction (EXTRACTOR)
	| 'metadata:title' // Extract/transform title
	| 'metadata:tags' // Extract/transform tags
	| 'metadata:authors' // Extract/transform authors
	| 'metadata:summary' // Extract/transform summary
	| 'metadata:custom' // Extract custom metadata (user-defined data)

	// Publishing logic (EXTRACTOR)
	| 'publish:check' // Should page be published?
	| 'publish:date' // Determine publish date

	// Slug handling (EXTRACTOR)
	| 'slug:extract' // Extract custom slug from Notion
	| 'slug:generate' // Generate slug from title
	| 'slug:validate' // Validate slug uniqueness
	| 'slug:transform' // Transform slug (sanitization, etc.)

	// Content processing (EXTRACTOR)
	| 'content:fetch' // Fetch page content
	| 'content:transform' // Transform markdown content
	
	// Image processing (EFFECT - side effects OK)
	| 'content:images' // Process inline images (upload, transform URLs)
	| 'cover:extract' // Extract cover image URL (EXTRACTOR)
	| 'cover:process' // Upload/process cover image (EFFECT)

	// Sync back to Notion (EFFECT - side effects expected)
	| 'sync:slug' // Sync slug back to Notion
	| 'sync:content' // Sync content back to Notion
	| 'sync:images'; // Sync image URLs back to Notion

/**
 * Events that are effect hooks (side effects allowed).
 * These hooks ALL execute (no early stopping on first result).
 */
export const EFFECT_HOOK_EVENTS: HookEvent[] = [
	'content:images',
	'cover:process',
	'sync:slug',
	'sync:content',
	'sync:images'
];

/**
 * Context object passed to each hook function.
 * 
 * **Hook Philosophy: Extractors, Not Transformers**
 * 
 * Hooks are independent extractors that read from `ctx.page` and return values.
 * They do NOT transform data flowing through them (no `ctx.data`).
 * 
 * The HookRegistry automatically composes results based on return type:
 * - **Primitives** (string, number, Date, boolean): First non-null wins
 * - **Objects**: Merge all non-null results
 * - **Arrays**: Concatenate all non-null results
 * 
 * @example Extractor pattern (correct)
 * ```typescript
 * fn: async (ctx) => {
 *   return parseDate(ctx.page.properties.Date);
 * }
 * ```
 * 
 * @example Return null to skip
 * ```typescript
 * fn: async (ctx) => {
 *   if (!hasCustomDate(ctx.page)) return null; // Falls through to next hook
 *   return extractCustomDate(ctx.page);
 * }
 * ```
 */
export type HookContext = {
	/** The Notion page being processed */
	page: PageObjectResponse;

	/** The database configuration */
	config: DatabaseBlueprint;

	/** Logger instance for structured logging */
	logger: {
		debug: (data: any) => void;
		info: (data: any) => void;
		warn: (data: any) => void;
		error: (data: any) => void;
	};

	/** Optional Supabase client for advanced use cases */
	supabase?: SupabaseClient<Database>;

	/**
	 * Services for effect hooks (side-effect operations).
	 * Only provided for effect hook events (sync:*, *:process).
	 * 
	 * Extractor hooks should not use these services.
	 */
	services?: {
		/** NotionClient for syncing data back to Notion */
		notionClient?: any; // Use 'any' to avoid circular dependency
		
		/** Supabase URL for image uploads */
		supabaseUrl?: string;
		
		/** Supabase service role key for uploads */
		serviceRoleKey?: string;
	};

	/** Internal flag to track abort state */
	aborted: boolean;

	/** Abort reason if aborted */
	abortReason?: string;

	/** Stop processing this page with a reason */
	abort: (reason: string) => void;
};

/**
 * Hook function signature.
 * 
 * Hooks are extractors that read from `ctx.page` and return a value or `null`.
 * - Return your extracted value if you have data to contribute
 * - Return `null` if you have nothing to contribute (registry continues to next hook)
 * 
 * The registry automatically composes results:
 * - **Primitives**: First non-null wins (stops processing)
 * - **Objects**: Merged together
 * - **Arrays**: Concatenated together
 * 
 * @example
 * ```typescript
 * // Custom date extraction
 * fn: async (ctx) => {
 *   const date = ctx.page.properties.Date?.date?.start;
 *   return date ? new Date(date).toISOString() : null;
 * }
 * ```
 */
export type HookFunction<TOutput = any> = (
	context: HookContext
) => Promise<TOutput | null> | TOutput | null;

/**
 * Hook definition.
 * Associates a function with an event and priority.
 * 
 * Hooks execute in priority order (lower = earlier):
 * - **1-20**: Pre-processing (debug logging, property inspection)
 * - **30-40**: Custom logic (runs before defaults)
 * - **50**: Default hooks (Symbiont's built-in behavior)
 * - **60-70**: Post-processing (validation, computed fields)
 * - **80-99**: Final validation (error checking, warnings)
 * 
 * @example
 * ```typescript
 * {
 *   name: 'caltech:publish-date',
 *   event: 'publish:date',
 *   priority: 40,
 *   fn: async (ctx) => parseIssueDate(ctx.page) || null
 * }
 * ```
 */
export interface Hook<TOutput = any> {
	/** User-defined name for this hook (for logging/debugging) */
	name: string;

	/** Built-in event type this hook responds to */
	event: HookEvent;

	/**
	 * Priority for execution order (lower runs first)
	 * Default: 50
	 * Suggested ranges:
	 * - 1-20: Pre-processing (debug logging)
	 * - 30-40: Custom logic (before defaults)
	 * - 50: Default hooks
	 * - 60-70: Post-processing (validation)
	 * - 80-99: Final validation
	 */
	priority?: number;

	/**
	 * Whether to continue execution if this hook throws an error
	 * Default: false (stop on error)
	 */
	continueOnError?: boolean;

	/** The hook function to execute */
	fn: HookFunction<TOutput>;
}

/**
 * Internal state for tracking control flow within hook execution
 */
export interface HookExecutionState {
	aborted: boolean;
	abortReason?: string;
}
