import type { PageObjectResponse } from '@notionhq/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HookEvent, Hook, HookContext, HookExecutionState } from './types.js';
import type { DatabaseBlueprint, DatabasePage } from '../types.js';
import { HOOK_EVENTS, CompositionStrategy } from './types.js';

/**
 * Hook Registry manages registration and execution of hooks.
 * 
 * Execution is determined by the event's composition strategy:
 * - 'first-wins': Stop at first non-null result
 * - 'collect': Accumulate all results (merge objects, concat arrays)
 * - 'or-all': Run all; true if any returns true
 * - 'and-all': Run all; false if any returns false
 * - 'run-all': Run all; ignore return values
 */
export class HookRegistry {
	private hooks: Map<HookEvent, Hook[]> = new Map();
	/** Per-page mutable store, reset at the start of each page via beginPage(). */
	private pageStore: Record<string, unknown> = {};
	/**
	 * Sync-scoped mutable store: persists for the entire sync (never reset between pages).
	 * Lives as long as this registry instance (one per datasource sync invocation).
	 * Use for sync-level caches, e.g. the slug-conflict map.
	 */
	private syncStore: Record<string, unknown> = {};
	private logger: {
		debug: (data: any) => void;
		info: (data: any) => void;
		warn: (data: any) => void;
		error: (data: any) => void;
	};
	private config: DatabaseBlueprint;
	private services: {
		notionClient?: any;
		supabase?: SupabaseClient;
		[key: string]: unknown;
	};

	constructor(
		logger: {
			debug: (data: any) => void;
			info: (data: any) => void;
			warn: (data: any) => void;
			error: (data: any) => void;
		},
		config: DatabaseBlueprint,
		services: {
			notionClient?: any;
			supabase?: SupabaseClient;
			[key: string]: unknown;
		}
	) {
		this.logger = logger;
		this.config = config;
		this.services = services;
	}

	/**
	 * Register a hook for an event.
	 * Hooks are automatically sorted by priority.
	 * 
	 * @param hook - The hook to register
	 */
	register(hook: Hook): void {
		// Map named priorities to numbers
		const priorityNumber = this.mapPriority(hook.priority);
		
		const hookWithDefaults = {
			...hook,
			priority: hook.priority ?? undefined, // Keep original for logging
			continueOnError: hook.continueOnError ?? false
		};

		const existing = this.hooks.get(hook.event) || [];
		existing.push(hookWithDefaults);

		// Sort by numeric priority
		existing.sort((a, b) => this.mapPriority(a.priority) - this.mapPriority(b.priority));

		this.hooks.set(hook.event, existing);

		this.logger.debug({
			event: 'hook_registered',
			hookName: hook.name,
			hookEvent: hook.event,
			priority: hook.priority ?? 'default',
			totalHooks: existing.length
		});
	}

	/**
	 * Register multiple hooks at once.
	 * 
	 * @param hooks - Array of hooks to register
	 */
	registerMany(hooks: Hook[]): void {
		for (const hook of hooks) {
			this.register(hook);
		}
	}

	/**
	 * Unregister a hook by name.
	 * 
	 * @param hookName - Name of the hook to remove
	 */
	unregister(hookName: string): void {
		for (const [event, hooks] of Array.from(this.hooks.entries())) {
			const filtered = hooks.filter((h: Hook) => h.name !== hookName);
			if (filtered.length !== hooks.length) {
				this.hooks.set(event, filtered);
				this.logger.debug({
					event: 'hook_unregistered',
					hookName,
					hookEvent: event
				});
			}
		}
	}

	/**
	 * Execute all hooks for a given event.
	 * 
	 * The execution strategy is determined by the event's composition strategy.
	 * After composition, writes result to output[field] if field is defined.
	 * 
	 * @param event - The hook event to execute
	 * @param output - Mutable output object being assembled
	 * @param page - The Notion page being processed
	 * @param input - Optional pipeline input (for Pipeline events, slug:conflict, content:preprocess)
	 * @returns Composed result from all hooks
	 */
	async execute<E extends HookEvent>(
		event: E,
		output: Partial<DatabasePage>,
		page: PageObjectResponse,
		input?: unknown
	): Promise<unknown> {
		const hooks = this.hooks.get(event) || [];

		if (hooks.length === 0) {
			this.logger.debug({
				event: 'no_hooks_registered',
				hookEvent: event
			});
			return null;
		}

		this.logger.debug({
			event: 'executing_hooks',
			hookEvent: event,
			hookCount: hooks.length,
			hookNames: hooks.map((h) => h.name)
		});

		// Track abort state
		const state: HookExecutionState = {
			aborted: false
		};

		// Create abort function
		const abort = (reason: string) => {
			state.aborted = true;
			state.abortReason = reason;
		};

		const eventDef = HOOK_EVENTS[event];
		const strategy = eventDef.strategy;
		const field = eventDef.field;

		// Execute based on composition strategy
		let result: unknown;
		switch (strategy) {
			case CompositionStrategy.FirstWins:
				result = await this.executeFirstWins(hooks, output, page, input, state, abort);
				break;
			case CompositionStrategy.Collect:
				result = await this.executeCollect(hooks, output, page, input, state, abort);
				break;
			case CompositionStrategy.OrAll:
				result = await this.executeOrAll(hooks, output, page, input, state, abort);
				break;
			case CompositionStrategy.AndAll:
				result = await this.executeAndAll(
					hooks,
					output,
					page,
					input,
					state,
					abort,
					event === 'publish:check'
				);
				break;
			case CompositionStrategy.RunAll:
				result = await this.executeRunAll(hooks, output, page, input, state, abort);
				break;
			case CompositionStrategy.Pipeline:
				result = await this.executePipeline(hooks, output, page, input, state, abort);
				break;
			default:
				throw new Error(`Unknown composition strategy: ${strategy}`);
		}

		// Write result to output[field] if field is defined and result is non-null
		if (field && result !== null && result !== undefined) {
			(output as any)[field] = result;
		}

		return result;
	}

	/**
	 * Execute hooks with first-wins strategy.
	 * Stop at first non-null result.
	 * Returning `false` is a stop-with-null sentinel: the chain is halted and
	 * the composed result is `null` (output field is left unset).
	 */
	private async executeFirstWins(
		hooks: Hook[],
		output: Partial<DatabasePage>,
		page: PageObjectResponse,
		input: unknown,
		state: HookExecutionState,
		abort: (reason: string) => void
	): Promise<any> {
		for (const hook of hooks) {
			if (state.aborted) {
				this.throwAbort(hook, state);
			}

			try {
				const context = this.buildContext(output, page, input, state, abort);
				const result = await hook.fn(context);

				if (state.aborted) {
					throw new Error(`Hook aborted: ${state.abortReason}`);
				}

				// `false` = "my definitive answer is nothing" — stop the chain, leave field unset
				if (result === false) {
					this.logger.debug({
						event: 'hook_returned_false_stop',
						hookName: hook.name
					});
					return null;
				}

				if (result !== null && result !== undefined) {
					this.logger.debug({
						event: 'hook_executed_first_wins',
						hookName: hook.name,
						hasResult: true
					});
					return result;
				}

				this.logger.debug({
					event: 'hook_returned_null',
					hookName: hook.name
				});
			} catch (error) {
				if (!this.handleHookError(hook, error, state)) {
					throw error;
				}
			}
		}

		return null;
	}

	/**
	 * Execute hooks with collect strategy.
	 * Accumulate all results; infer merge (objects) or concat (arrays).
	 */
	private async executeCollect(
		hooks: Hook[],
		output: Partial<DatabasePage>,
		page: PageObjectResponse,
		input: unknown,
		state: HookExecutionState,
		abort: (reason: string) => void
	): Promise<any> {
		let result: any = null;
		let resultType: 'object' | 'array' | null = null;

		for (const hook of hooks) {
			if (state.aborted) {
				this.throwAbort(hook, state);
			}

			try {
				const context = this.buildContext(output, page, input, state, abort);
				const hookResult = await hook.fn(context);

				if (state.aborted) {
					throw new Error(`Hook aborted: ${state.abortReason}`);
				}

				if (hookResult === null || hookResult === undefined) {
					this.logger.debug({
						event: 'hook_returned_null',
						hookName: hook.name
					});
					continue;
				}

				// Determine result type on first non-null output
				if (resultType === null) {
					resultType = Array.isArray(hookResult) ? 'array' : 'object';
				}

				// Compose based on type
				if (resultType === 'array') {
					result = result === null ? hookResult : [...result, ...hookResult];
					this.logger.debug({
						event: 'hook_executed_concatenated',
						hookName: hook.name
					});
				} else {
					result = { ...result, ...hookResult };
					this.logger.debug({
						event: 'hook_executed_merged',
						hookName: hook.name
					});
				}
			} catch (error) {
				if (!this.handleHookError(hook, error, state)) {
					throw error;
				}
			}
		}

		return result;
	}

	/**
	 * Execute hooks with or-all strategy.
	 * Run all; true if any returns true, null = no opinion.
	 */
	private async executeOrAll(
		hooks: Hook[],
		output: Partial<DatabasePage>,
		page: PageObjectResponse,
		input: unknown,
		state: HookExecutionState,
		abort: (reason: string) => void
	): Promise<boolean> {
		let hasTrue = false;

		for (const hook of hooks) {
			if (state.aborted) {
				this.throwAbort(hook, state);
			}

			try {
				const context = this.buildContext(output, page, input, state, abort);
				const result = await hook.fn(context);

				if (state.aborted) {
					throw new Error(`Hook aborted: ${state.abortReason}`);
				}

				if (result === true) {
					hasTrue = true;
					this.logger.debug({
						event: 'hook_voted_true',
						hookName: hook.name
					});
				} else if (result === false) {
					this.logger.debug({
						event: 'hook_voted_false',
						hookName: hook.name
					});
				} else {
					this.logger.debug({
						event: 'hook_no_opinion',
						hookName: hook.name
					});
				}
			} catch (error) {
				if (!this.handleHookError(hook, error, state)) {
					throw error;
				}
			}
		}

		return hasTrue;
	}

	/**
	 * Execute hooks with and-all strategy.
	 * Run all; false if any returns false, null = no opinion.
	 */
	private async executeAndAll(
		hooks: Hook[],
		output: Partial<DatabasePage>,
		page: PageObjectResponse,
		input: unknown,
		state: HookExecutionState,
		abort: (reason: string) => void,
		requireExplicitTrueVote = false
	): Promise<boolean> {
		let hasFalse = false;
		let hasTrue = false;

		for (const hook of hooks) {
			if (state.aborted) {
				this.throwAbort(hook, state);
			}

			try {
				const context = this.buildContext(output, page, input, state, abort);
				const result = await hook.fn(context);

				if (state.aborted) {
					throw new Error(`Hook aborted: ${state.abortReason}`);
				}

				if (result === false) {
					hasFalse = true;
					this.logger.debug({
						event: 'hook_voted_false',
						hookName: hook.name
					});
				} else if (result === true) {
					hasTrue = true;
					this.logger.debug({
						event: 'hook_voted_true',
						hookName: hook.name
					});
				} else {
					this.logger.debug({
						event: 'hook_no_opinion',
						hookName: hook.name
					});
				}
			} catch (error) {
				if (!this.handleHookError(hook, error, state)) {
					throw error;
				}
			}
		}

		if (requireExplicitTrueVote) {
			return !hasFalse && hasTrue;
		}

		return !hasFalse;
	}

	/**
	 * Execute hooks with run-all strategy.
	 * Run all; ignore return values.
	 */
	private async executeRunAll(
		hooks: Hook[],
		output: Partial<DatabasePage>,
		page: PageObjectResponse,
		input: unknown,
		state: HookExecutionState,
		abort: (reason: string) => void
	): Promise<void> {
		for (const hook of hooks) {
			if (state.aborted) {
				this.throwAbort(hook, state);
			}

			try {
				const context = this.buildContext(output, page, input, state, abort);
				await hook.fn(context);

				if (state.aborted) {
					throw new Error(`Hook aborted: ${state.abortReason}`);
				}

				this.logger.debug({
					event: 'effect_hook_executed',
					hookName: hook.name
				});
			} catch (error) {
				if (!this.handleHookError(hook, error, state)) {
					throw error;
				}
			}
		}
	}

	/**
	 * Execute hooks with pipeline strategy.
	 * Chain: each hook's return becomes next hook's input; null = pass-through.
	 */
	private async executePipeline(
		hooks: Hook[],
		output: Partial<DatabasePage>,
		page: PageObjectResponse,
		initialValue: unknown,
		state: HookExecutionState,
		abort: (reason: string) => void
	): Promise<unknown> {
		let currentValue = initialValue;

		for (const hook of hooks) {
			if (state.aborted) {
				this.throwAbort(hook, state);
			}

			try {
				const context = this.buildContext(output, page, currentValue, state, abort);
				const result = await hook.fn(context);

				if (state.aborted) {
					throw new Error(`Hook aborted: ${state.abortReason}`);
				}

				// null = pass-through (keep current value)
				if (result !== null && result !== undefined) {
					currentValue = result;
					this.logger.debug({
						event: 'pipeline_hook_transformed',
						hookName: hook.name,
						hasResult: true
					});
				} else {
					this.logger.debug({
						event: 'pipeline_hook_passthrough',
						hookName: hook.name
					});
				}
			} catch (error) {
				if (!this.handleHookError(hook, error, state)) {
					throw error;
				}
			}
		}

		return currentValue;
	}

	/**
	 * Reset the per-page store. Call this at the start of each page's transform run.
	 */
	beginPage(): void {
		this.pageStore = {};
	}

	/**
	 * Build hook context.
	 * Freezes output to make it read-only for hooks.
	 */
	private buildContext(
		output: Partial<DatabasePage>,
		page: PageObjectResponse,
		input: unknown,
		state: HookExecutionState,
		abort: (reason: string) => void
	): HookContext {
		return {
			page,
			output: Object.freeze({ ...output }), // Freeze to prevent mutation
			input,
			config: this.config,
			logger: this.logger,
			services: this.services,
			abort,
			store: this.pageStore,    // per-page bag
			syncStore: this.syncStore // sync-scoped bag
		};
	}

	/**
	 * Handle hook error.
	 * Returns true if error was handled (continue), false if should throw.
	 */
	private handleHookError(hook: Hook, error: unknown, state: HookExecutionState): boolean {
		this.logger.error({
			event: 'hook_execution_failed',
			hookName: hook.name,
			hookEvent: hook.event,
			error: error instanceof Error ? error.message : String(error),
			stack: error instanceof Error ? error.stack : undefined,
			continueOnError: hook.continueOnError
		});

		if (!hook.continueOnError) {
			return false;
		}

		this.logger.warn({
			event: 'hook_error_ignored',
			hookName: hook.name,
			hookEvent: hook.event
		});

		return true;
	}

	/**
	 * Throw abort error.
	 */
	private throwAbort(hook: Hook, state: HookExecutionState): never {
		this.logger.warn({
			event: 'hook_execution_aborted',
			hookEvent: hook.event,
			hookName: hook.name,
			reason: state.abortReason
		});
		throw new Error(`Hook execution aborted: ${state.abortReason}`);
	}

	/**
	 * Map named priority to number.
	 */
	private mapPriority(priority: 'before' | 'after' | 'override' | 'fallback' | undefined): number {
		if (priority === 'before' || priority === 'override') return 40;
		if (priority === 'after' || priority === 'fallback') return 60;
		return 50; // default
	}

	/**
	 * Get all hooks registered for an event.
	 * 
	 * @param event - The hook event
	 * @returns Array of hooks (sorted by priority)
	 */
	getHooks(event: HookEvent): Hook[] {
		return this.hooks.get(event) || [];
	}

	/**
	 * Get all registered hooks across all events.
	 * 
	 * @returns Map of event to hooks array
	 */
	getAllHooks(): Map<HookEvent, Hook[]> {
		return new Map(this.hooks);
	}

	/**
	 * Clear all registered hooks.
	 * Useful for testing.
	 */
	clear(): void {
		this.hooks.clear();
		this.logger.debug({
			event: 'hooks_cleared'
		});
	}

	/**
	 * Get count of hooks for an event.
	 * 
	 * @param event - The hook event
	 * @returns Number of hooks registered for this event
	 */
	getHookCount(event: HookEvent): number {
		return this.hooks.get(event)?.length || 0;
	}
}
