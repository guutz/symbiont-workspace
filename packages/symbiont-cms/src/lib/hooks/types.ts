import type { PageObjectResponse } from '@notionhq/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseBlueprint } from '../types.js';
import type { Database } from '../database.types.js';

/**
 * Hook lifecycle events in the page transformation pipeline.
 * These are built-in event types that Symbiont defines.
 */
export type HookEvent =
	// Early validation
	| 'page:exclude' // Should page be excluded from sync?
	| 'page:validate' // Is page data valid?

	// Metadata extraction
	| 'metadata:title' // Extract/transform title
	| 'metadata:tags' // Extract/transform tags
	| 'metadata:authors' // Extract/transform authors
	| 'metadata:summary' // Extract/transform summary
	| 'metadata:custom' // Extract custom metadata (user-defined data)

	// Publishing logic
	| 'publish:check' // Should page be published?
	| 'publish:date' // Determine publish date

	// Slug handling
	| 'slug:extract' // Extract custom slug from Notion
	| 'slug:generate' // Generate slug from title
	| 'slug:validate' // Validate slug uniqueness
	| 'slug:transform' // Transform slug (sanitization, etc.)

	// Content processing
	| 'content:fetch' // Fetch page content
	| 'content:transform' // Transform markdown content
	| 'content:images' // Process inline images

	// Cover image
	| 'cover:extract' // Extract cover image
	| 'cover:process' // Upload/process cover image

	// Sync back to Notion
	| 'sync:slug' // Sync slug back to Notion
	| 'sync:content' // Sync content back to Notion
	| 'sync:images'; // Sync image URLs back to Notion

/**
 * Context object passed to each hook function.
 * Contains the current state and utilities for hook execution.
 */
export type HookContext<T = any> = {
	/** The Notion page being processed */
	page: PageObjectResponse;

	/** The database configuration */
	config: DatabaseBlueprint;

	/** Current state/data being transformed (varies by hook event) */
	data: T;

	/** Logger instance for structured logging */
	logger: {
		debug: (data: any) => void;
		info: (data: any) => void;
		warn: (data: any) => void;
		error: (data: any) => void;
	};

	/** Optional Supabase client for advanced use cases */
	supabase?: SupabaseClient<Database>;

	/** Stop processing this page with a reason */
	abort: (reason: string) => void;

	/** Skip to next hook (don't modify data) */
	skip: () => void;
};

/**
 * Hook function signature.
 * Can be async or sync, receives context, returns transformed data.
 */
export type HookFunction<TInput = any, TOutput = any> = (
	context: HookContext<TInput>
) => Promise<TOutput> | TOutput;

/**
 * Hook definition.
 * Associates a function with an event and priority.
 */
export interface Hook<TInput = any, TOutput = any> {
	/** User-defined name for this hook (for logging/debugging) */
	name: string;

	/** Built-in event type this hook responds to */
	event: HookEvent;

	/**
	 * Priority for execution order (lower runs first)
	 * Default: 50
	 * Suggested ranges:
	 * - 10-30: High priority (runs early)
	 * - 40-60: Normal priority (default range)
	 * - 70-90: Low priority (runs late)
	 */
	priority?: number;

	/**
	 * Whether to continue execution if this hook throws an error
	 * Default: false (stop on error)
	 */
	continueOnError?: boolean;

	/** The hook function to execute */
	fn: HookFunction<TInput, TOutput>;
}

/**
 * Internal state for tracking control flow within hook execution
 */
export interface HookExecutionState {
	aborted: boolean;
	abortReason?: string;
	skipped: boolean;
}
