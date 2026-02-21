import type { PageObjectResponse } from '@notionhq/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseBlueprint } from '../types.js';
import type { Database } from '../database.types.js';

/**
 * Composition strategy for hook execution.
 */
export enum CompositionStrategy {
	/** Stop at first non-null result (strings, numbers, dates) */
	FirstWins = 'first-wins',
	/** Accumulate all results; registry infers merge (objects) or concat (arrays) */
	Collect = 'collect',
	/** Run all; true if any hook returns true (boolean OR) */
	OrAll = 'or-all',
	/** Run all; false if any hook returns false (boolean AND) */
	AndAll = 'and-all',
	/** Run all; ignore return values entirely (side effects) */
	RunAll = 'run-all'
}

/**
 * Event signatures: input and output types for each event.
 * Single source of truth for all hook events.
 */
export type EventSignatures = {
	'page:exclude':      { input: never; output: boolean    };
	'page:validate':     { input: never; output: boolean    };
	'metadata:title':    { input: never; output: string     };
	'metadata:tags':     { input: never; output: string[]   };
	'metadata:authors':  { input: never; output: string[]   };
	'metadata:summary':  { input: never; output: string     };
	'metadata:custom':   { input: never; output: Record<string, unknown> };
	'publish:check':     { input: never; output: boolean    };
	'publish:date':      { input: never; output: string     };
	'slug:extract':      { input: never; output: string     };
	'slug:generate':     { input: never; output: string     };
	'slug:validate':     { input: never; output: boolean    };
	'slug:transform':    { input: never; output: string     };
	'content:fetch':     { input: never; output: string     };
	'content:transform': { input: string; output: string    };
	'content:images':    { input: string; output: string    };
	'cover:extract':     { input: never; output: string     };
	'cover:process':     { input: string|null; output: string|null };
	'sync:slug':         { input: string; output: void      };
	'sync:content':      { input: string; output: void      };
	'sync:images':       { input: unknown; output: void     };
};

/**
 * Hook event names derived from EventSignatures.
 */
export type HookEvent = keyof EventSignatures;

/**
 * Composition strategies for each hook event.
 */
export const HOOK_EVENTS: Record<HookEvent, CompositionStrategy> = {
	'page:exclude':      CompositionStrategy.OrAll,
	'page:validate':     CompositionStrategy.AndAll,
	'metadata:title':    CompositionStrategy.FirstWins,
	'metadata:tags':     CompositionStrategy.Collect,
	'metadata:authors':  CompositionStrategy.Collect,
	'metadata:summary':  CompositionStrategy.FirstWins,
	'metadata:custom':   CompositionStrategy.Collect,
	'publish:check':     CompositionStrategy.AndAll,
	'publish:date':      CompositionStrategy.FirstWins,
	'slug:extract':      CompositionStrategy.FirstWins,
	'slug:generate':     CompositionStrategy.FirstWins,
	'slug:validate':     CompositionStrategy.AndAll,
	'slug:transform':    CompositionStrategy.FirstWins,
	'content:fetch':     CompositionStrategy.FirstWins,
	'content:transform': CompositionStrategy.FirstWins,
	'content:images':    CompositionStrategy.RunAll,
	'cover:extract':     CompositionStrategy.FirstWins,
	'cover:process':     CompositionStrategy.RunAll,
	'sync:slug':         CompositionStrategy.RunAll,
	'sync:content':      CompositionStrategy.RunAll,
	'sync:images':       CompositionStrategy.RunAll,
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
