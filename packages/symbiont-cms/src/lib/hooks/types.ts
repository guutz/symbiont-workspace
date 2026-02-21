import type { PageObjectResponse } from '@notionhq/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseBlueprint } from '../types.js';
import type { Database } from '../database.types.js';

/**
 * Composition strategy for hook execution.
 */
export enum CompositionStrategy {
	/** Stop at first non-null result (strings, numbers, dates) */
	FirstWins,
	/** Accumulate all results; registry infers merge (objects) or concat (arrays) */
	Collect,
	/** Run all; true if any hook returns true (boolean OR) */
	OrAll,
	/** Run all; false if any hook returns false (boolean AND) */
	AndAll,
	/** Run all; ignore return values entirely (side effects) */
	RunAll
}

/** Helper to define a hook event with typed input/output and a composition strategy. */
function e<TInput, TOutput>(strategy: CompositionStrategy) {
	return { input: null as unknown as TInput, output: null as unknown as TOutput, strategy };
}

const S = CompositionStrategy;

/**
 * Hook event definitions - THE SINGLE SOURCE OF TRUTH
 * 
 * Each event has:
 * - input: Type of input value passed to hooks (never if no input)
 * - output: Type of value returned by hooks
 * - strategy: How to compose results from multiple hooks
 */
export const HOOK_EVENTS = {
	// Page lifecycle
	'page:exclude': e<never, boolean>(S.OrAll),
	'page:validate': e<never, boolean>(S.AndAll),

	// Metadata extraction
	'metadata:title': e<never, string>(S.FirstWins),
	'metadata:tags': e<never, string[]>(S.Collect),
	'metadata:authors': e<never, string[]>(S.Collect),
	'metadata:summary': e<never, string>(S.FirstWins),
	'metadata:custom': e<never, Record<string, unknown>>(S.Collect),

	// Publishing
	'publish:check': e<never, boolean>(S.AndAll),
	'publish:date': e<never, string>(S.FirstWins),

	// Slug handling
	'slug:extract': e<never, string>(S.FirstWins),
	'slug:generate': e<never, string>(S.FirstWins),
	'slug:validate': e<never, boolean>(S.AndAll),
	'slug:transform': e<never, string>(S.FirstWins),

	// Content pipeline
	'content:fetch': e<never, string>(S.FirstWins),
	'content:transform': e<string, string>(S.FirstWins),
	'content:images': e<string, string>(S.RunAll),

	// Cover image pipeline
	'cover:extract': e<never, string>(S.FirstWins),
	'cover:fallback': e<never, string>(S.FirstWins),
	'cover:process': e<string | null, string | null>(S.RunAll),

	// Sync back to Notion
	'sync:slug': e<string, void>(S.RunAll),
	'sync:content': e<string, void>(S.RunAll),
	'sync:images': e<unknown, void>(S.RunAll),
} as const;

/**
 * Hook event names derived from HOOK_EVENTS.
 */
export type HookEvent = keyof typeof HOOK_EVENTS;

/**
 * Event signatures: input and output types for each event.
 * Derived from HOOK_EVENTS.
 */
export type EventSignatures = {
	[K in HookEvent]: {
		input: typeof HOOK_EVENTS[K]['input'];
		output: typeof HOOK_EVENTS[K]['output'];
	}
};


/**
 * Context object passed to each hook function.
 * 
 * Contains everything a hook needs to operate: the page being processed,
 * configuration, logging, services for side effects, and control flow.
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

	/**
	 * Services for side-effect operations.
	 * Always present as an object (individual fields may be undefined).
	 * 
	 * Built-in services:
	 * - notionClient: For syncing data back to Notion
	 * - supabase: Supabase client for storage operations
	 * 
	 * Custom services can be added via index signature.
	 */
	services: {
		notionClient?: any; // Use 'any' to avoid circular dependency
		supabase?: SupabaseClient<Database>;
		[key: string]: unknown; // custom services
	};

	/**
	 * Pipeline input value (for events that operate on data flow).
	 * Present only for events that declare it in EventSignatures.
	 */
	input?: unknown;

	/** Stop processing this page with a reason */
	abort: (reason: string) => void;
};

/**
 * Hook function signature.
 * 
 * Hooks read from `ctx.page` (and optionally `ctx.input`) and return a value or `null`.
 * - Return your value if you have data to contribute
 * - Return `null` if you have nothing to contribute (continues to next hook)
 * 
 * The registry composes results based on the event's composition strategy.
 */
export type HookFunction<TOutput = any> = (
	context: HookContext
) => Promise<TOutput | null> | TOutput | null;

/**
 * Hook definition.
 * Associates a function with an event and priority.
 * 
 * Priority values:
 * - 'override': Runs before Symbiont's defaults (wins for first-wins events)
 * - 'fallback': Runs after Symbiont's defaults (only reached if defaults return null)
 * - omitted: Same order as built-in defaults
 */
export interface Hook<TOutput = any> {
	/** User-defined name for this hook (for logging/debugging) */
	name: string;

	/** Built-in event type this hook responds to */
	event: HookEvent;

	/**
	 * Priority for execution order.
	 * - 'override': Runs before defaults
	 * - 'fallback': Runs after defaults
	 * - omitted: Same level as defaults
	 */
	priority?: 'override' | 'fallback';

	/**
	 * Whether to continue execution if this hook throws an error.
	 * Default: false (stop on error)
	 * 
	 * Set to true for best-effort side effects (notifications, analytics)
	 * that shouldn't break the sync if they fail.
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
