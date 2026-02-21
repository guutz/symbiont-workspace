import type { PageObjectResponse } from '@notionhq/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { HookEvent, Hook, HookContext, HookExecutionState, EventSignatures } from './types.js';
import type { DatabaseBlueprint } from '../types.js';
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
		for (const [event, hooks] of this.hooks.entries()) {
			const filtered = hooks.filter((h) => h.name !== hookName);
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
	 * 
	 * @param event - The hook event to execute
	 * @param page - The Notion page being processed
	 * @param input - Optional pipeline input (for events that declare it)
	 * @returns Composed result from all hooks
	 */
	async execute<E extends HookEvent>(
		event: E,
		page: PageObjectResponse,
		...args: EventSignatures[E]['input'] extends never ? [] : [EventSignatures[E]['input']]
	): Promise<EventSignatures[E]['output'] | null> {
		const hooks = this.hooks.get(event) || [];
		const input = args.length > 0 ? args[0] : undefined;

		if (hooks.length === 0) {
			this.logger.debug({
				event: 'no_hooks_registered',
				hookEvent: event
			});
			return null as any;
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

		const strategy = HOOK_EVENTS[event]?.strategy || CompositionStrategy.FirstWins;

		// Execute based on composition strategy
		switch (strategy) {
			case CompositionStrategy.FirstWins:
				return await this.executeFirstWins(hooks, page, input, state, abort) as any;
			case CompositionStrategy.Collect:
				return await this.executeCollect(hooks, page, input, state, abort) as any;
			case CompositionStrategy.OrAll:
				return await this.executeOrAll(hooks, page, input, state, abort) as any;
			case CompositionStrategy.AndAll:
				return await this.executeAndAll(hooks, page, input, state, abort) as any;
			case CompositionStrategy.RunAll:
				return await this.executeRunAll(hooks, page, input, state, abort) as any;
			default:
				throw new Error(`Unknown composition strategy: ${strategy}`);
		}
	}

	/**
	 * Execute hooks with first-wins strategy.
	 * Stop at first non-null result.
	 */
	private async executeFirstWins(
		hooks: Hook[],
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
				const context = this.buildContext(page, input, state, abort);
				const output = await hook.fn(context);

				if (state.aborted) {
					throw new Error(`Hook aborted: ${state.abortReason}`);
				}

				if (output !== null && output !== undefined) {
					this.logger.debug({
						event: 'hook_executed_first_wins',
						hookName: hook.name,
						hasResult: true
					});
					return output;
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
				const context = this.buildContext(page, input, state, abort);
				const output = await hook.fn(context);

				if (state.aborted) {
					throw new Error(`Hook aborted: ${state.abortReason}`);
				}

				if (output === null || output === undefined) {
					this.logger.debug({
						event: 'hook_returned_null',
						hookName: hook.name
					});
					continue;
				}

				// Determine result type on first non-null output
				if (resultType === null) {
					resultType = Array.isArray(output) ? 'array' : 'object';
				}

				// Compose based on type
				if (resultType === 'array') {
					result = result === null ? output : [...result, ...output];
					this.logger.debug({
						event: 'hook_executed_concatenated',
						hookName: hook.name
					});
				} else {
					result = { ...result, ...output };
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
				const context = this.buildContext(page, input, state, abort);
				const output = await hook.fn(context);

				if (state.aborted) {
					throw new Error(`Hook aborted: ${state.abortReason}`);
				}

				if (output === true) {
					hasTrue = true;
					this.logger.debug({
						event: 'hook_voted_true',
						hookName: hook.name
					});
				} else if (output === false) {
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
		page: PageObjectResponse,
		input: unknown,
		state: HookExecutionState,
		abort: (reason: string) => void
	): Promise<boolean> {
		let hasFalse = false;

		for (const hook of hooks) {
			if (state.aborted) {
				this.throwAbort(hook, state);
			}

			try {
				const context = this.buildContext(page, input, state, abort);
				const output = await hook.fn(context);

				if (state.aborted) {
					throw new Error(`Hook aborted: ${state.abortReason}`);
				}

				if (output === false) {
					hasFalse = true;
					this.logger.debug({
						event: 'hook_voted_false',
						hookName: hook.name
					});
				} else if (output === true) {
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

		return !hasFalse;
	}

	/**
	 * Execute hooks with run-all strategy.
	 * Run all; ignore return values.
	 */
	private async executeRunAll(
		hooks: Hook[],
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
				const context = this.buildContext(page, input, state, abort);
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
	 * Build hook context.
	 */
	private buildContext(
		page: PageObjectResponse,
		input: unknown,
		state: HookExecutionState,
		abort: (reason: string) => void
	): HookContext {
		return {
			page,
			config: this.config,
			logger: this.logger,
			services: this.services,
			input,
			abort
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
	private mapPriority(priority: 'override' | 'fallback' | undefined): number {
		if (priority === 'override') return 40;
		if (priority === 'fallback') return 60;
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
