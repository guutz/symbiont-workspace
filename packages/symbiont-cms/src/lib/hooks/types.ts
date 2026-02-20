import type { PageObjectResponse } from '@notionhq/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseBlueprint } from '../types.js';
import type { Database } from '../database.types.js';

/**
 * Composition strategy for hook execution.
 * 
 * Determines how results from multiple hooks are combined and when execution stops.
 */
export type CompositionStrategy =
	| 'first-wins'   // stop at first non-null result (strings, numbers, dates)
	| 'collect'      // accumulate all results; registry infers merge (objects) or concat (arrays)
	| 'or-all'       // run all; true if any hook returns true (boolean OR)
	| 'and-all'      // run all; false if any hook returns false (boolean AND)
	| 'run-all';     // run all; ignore return values entirely (side effects)

/**
 * Event definition with composition strategy.
 */
export type EventDefinition = {
	composition: CompositionStrategy;
};

/**
 * Hook lifecycle events in the page transformation pipeline.
 */
export type HookEvent =
	| 'page:exclude'       // Should page be excluded from sync?
	| 'page:validate'      // Is page data valid?
	| 'metadata:title'     // Extract/transform title
	| 'metadata:tags'      // Extract/transform tags
	| 'metadata:authors'   // Extract/transform authors
	| 'metadata:summary'   // Extract/transform summary
	| 'metadata:custom'    // Extract custom metadata (user-defined data)
	| 'publish:check'      // Should page be published?
	| 'publish:date'       // Determine publish date
	| 'slug:extract'       // Extract custom slug from Notion
	| 'slug:generate'      // Generate slug from title
	| 'slug:validate'      // Validate slug uniqueness
	| 'slug:transform'     // Transform slug (sanitization, etc.)
	| 'content:fetch'      // Fetch page content
	| 'content:transform'  // Transform markdown content
	| 'content:images'     // Process inline images (upload, transform URLs)
	| 'cover:extract'      // Extract cover image URL
	| 'cover:process'      // Upload/process cover image
	| 'sync:slug'          // Sync slug back to Notion
	| 'sync:content'       // Sync content back to Notion
	| 'sync:images';       // Sync image URLs back to Notion

/**
 * Built-in event definitions with fixed composition strategies.
 */
export const HOOK_EVENTS: Record<HookEvent, EventDefinition> = {
	'page:exclude':       { composition: 'or-all'     },  // exclude if any hook says yes
	'page:validate':      { composition: 'and-all'    },  // valid only if all hooks pass
	'metadata:title':     { composition: 'first-wins' },
	'metadata:tags':      { composition: 'collect'    },
	'metadata:authors':   { composition: 'collect'    },
	'metadata:summary':   { composition: 'first-wins' },
	'metadata:custom':    { composition: 'collect'    },
	'publish:check':      { composition: 'and-all'    },  // publish only if all hooks agree
	'publish:date':       { composition: 'first-wins' },
	'slug:extract':       { composition: 'first-wins' },
	'slug:generate':      { composition: 'first-wins' },
	'slug:validate':      { composition: 'and-all'    },
	'slug:transform':     { composition: 'first-wins' },
	'content:fetch':      { composition: 'first-wins' },
	'content:transform':  { composition: 'first-wins' },
	'content:images':     { composition: 'run-all'    },
	'cover:extract':      { composition: 'first-wins' },
	'cover:process':      { composition: 'run-all'    },
	'sync:slug':          { composition: 'run-all'    },
	'sync:content':       { composition: 'run-all'    },
	'sync:images':        { composition: 'run-all'    },
};

/**
 * Event signatures: input and output types for each event.
 * 
 * Used to derive the `execute()` signature with full type safety.
 */
export type EventSignatures = {
	// Events that receive a pipeline input value:
	'content:transform': { input: string;      output: string       };
	'content:images':    { input: string;      output: string       };
	'cover:process':     { input: string|null; output: string|null  };
	'sync:slug':         { input: string;      output: void         };
	'sync:content':      { input: string;      output: void         };
	'sync:images':       { input: unknown;     output: void         };
	
	// Events with no pipeline input (ctx.page is the only source):
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
	'cover:extract':     { input: never; output: string     };
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
