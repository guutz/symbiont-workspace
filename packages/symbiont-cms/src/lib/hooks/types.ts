import type { PageObjectResponse } from '@notionhq/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { DatabaseBlueprint, DatabasePage } from '../types.js';
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
	RunAll,
	/** Chain: each hook's return becomes next hook's input; null = pass-through */
	Pipeline
}

/** Helper to define a hook event with typed return, composition strategy, and optional field. */
function e<TReturn>(strategy: CompositionStrategy, field?: keyof DatabasePage) {
	return { output: null as unknown as TReturn, strategy, field };
}

const S = CompositionStrategy;

/**
 * Hook event definitions - THE SINGLE SOURCE OF TRUTH
 * 
 * Each event has:
 * - output: Type of value returned by hooks (TReturn)
 * - strategy: How to compose results from multiple hooks
 * - field: Optional keyof DatabasePage where result is written
 * 
 * Events are fired in order by the transformer. See Event Ordering Contract in design memo.
 */
export const HOOK_EVENTS = {
	// ── Page Lifecycle ─────────────────────────────────────────────────
	'page:before': e<void>(S.RunAll),
	'page:should-sync': e<boolean>(S.AndAll), // flow control — no field
	'page:after': e<void>(S.RunAll),

	// ── Publishing ─────────────────────────────────────────────────────
	'publish:check': e<boolean>(S.AndAll), // flow control — no field
	'publish:date': e<string | Date>(S.FirstWins, 'publish_at'),

	// ── Slug Pipeline ──────────────────────────────────────────────────
	'slug:extract': e<string>(S.FirstWins, 'slug'),
	'slug:generate': e<string>(S.FirstWins, 'slug'),
	'slug:conflict': e<string>(S.FirstWins, 'slug'), // receives current slug as input, returns resolved slug
	'slug:sync': e<void>(S.RunAll), // side effect — no field

	// ── Metadata Extraction ────────────────────────────────────────────
	'metadata:title': e<string>(S.FirstWins, 'title'),
	'metadata:tags': e<string[]>(S.Collect, 'tags'),
	'metadata:authors': e<string[]>(S.Collect, 'authors'),
	'metadata:summary': e<string>(S.FirstWins, 'summary'),
	'metadata:custom': e<Record<string, unknown>>(S.Collect, 'meta'), // merged into output.meta

	// ── Content Pipeline ───────────────────────────────────────────────
	'content:preprocess': e<string>(S.FirstWins), // hook fetches content itself (pageToMarkdown); ctx.input unused; no field
	'content:text': e<string>(S.Pipeline, 'content'),
	'content:media': e<string>(S.Pipeline, 'content'),
	'content:postprocess': e<string>(S.Pipeline, 'content'),
	'content:sync': e<void>(S.RunAll), // side effect — no field

	// ── Cover Pipeline (config-gated via coverProperty) ────────────────
	'cover:extract': e<string>(S.FirstWins, 'cover'), // default hook falls back to scanning content
	'cover:process': e<string>(S.Pipeline, 'cover'),
	'cover:sync': e<void>(S.RunAll) // side effect — no field
} as const;

/**
 * Hook event names derived from HOOK_EVENTS.
 */
export type HookEvent = keyof typeof HOOK_EVENTS;


/**
 * Context object passed to each hook function.
 * 
 * Contains everything a hook needs to operate: the page being processed,
 * accumulated output so far, configuration, logging, services, and control flow.
 */
export type HookContext = {
	/** The Notion page being processed (raw source, never mutated) */
	page: PageObjectResponse;

	/** Accumulated output so far (read-only view of DatabasePage being assembled) */
	output: Readonly<Partial<DatabasePage>>;

	/**
	 * Pipeline input value (for Pipeline events and slug:conflict).
	 * - Pipeline events: current value in the transform chain
	 * - slug:conflict: current slug needing validation
	 * - content:preprocess: unused (hook fetches via pageToMarkdown internally)
	 */
	input?: unknown;

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

	/** Stop processing this page with a reason */
	abort: (reason: string) => void;

	/**
	 * Mutable key-value bag that persists across ALL hook events for a single page's
	 * processing run. Use this to pass computed values from one event to a later event
	 * without relying on ctx.page being re-fetched.
	 *
	 * Example: an `archives:pdf` hook on `content:postprocess` uploads a PDF and
	 * writes `ctx.store.pdfPublicUrl = result.newUrl`; a later `archives:cover` hook
	 * on `cover:extract` reads `ctx.store.pdfPublicUrl` to generate the thumbnail.
	 */
	store: Record<string, unknown>;

	/**
	 * Mutable key-value bag that persists for the ENTIRE SYNC (across all pages).
	 * Unlike `store`, this is NOT reset between pages — it lives as long as the
	 * HookRegistry instance (one per datasource sync invocation).
	 *
	 * Use this for sync-scoped caches, e.g. the slug conflict map so we only
	 * query existing slugs from the database once instead of once per page.
	 */
	syncStore: Record<string, unknown>;
};

/**
 * Hook function signature.
 * 
 * Hooks read from `ctx.page` (and optionally `ctx.input`) and return a value or `null`.
 * - Return your value if you have data to contribute
 * - Return `null` if you have nothing to contribute (continues to next hook)
 * - Return `false` (FirstWins events only) to stop the chain and produce a null result —
 *   meaning "my definitive answer is nothing", not "I don't know". Downstream hooks are
 *   skipped and the output field is left unset (null).
 * 
 * The registry composes results based on the event's composition strategy.
 */
export type HookFunction<TOutput = any> = (
	context: HookContext
) => Promise<TOutput | null | false> | TOutput | null | false;

/**
 * Hook definition.
 * Associates a function with an event and priority.
 * 
 * Priority values:
 * - 'before': Runs before Symbiont's defaults
 * - 'after': Runs after Symbiont's defaults
 * - 'override': Alias of 'before' (kept for backwards compatibility)
 * - 'fallback': Alias of 'after' (kept for backwards compatibility)
 * - omitted: Same order as built-in defaults
 */
export interface Hook<TOutput = any> {
	/** User-defined name for this hook (for logging/debugging) */
	name: string;

	/** Built-in event type this hook responds to */
	event: HookEvent;

	/**
	 * Priority for execution order.
	 * - 'before': Runs before defaults
	 * - 'after': Runs after defaults
	 * - 'override': Alias of 'before'
	 * - 'fallback': Alias of 'after'
	 * - omitted: Same level as defaults
	 */
	priority?: 'before' | 'after' | 'override' | 'fallback';

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
