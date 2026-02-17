import type { HookEvent, Hook, HookContext, HookExecutionState } from './types.js';

/**
 * HookRegistry manages registration and execution of hooks.
 * 
 * Responsibilities:
 * - Register hooks for specific events
 * - Sort hooks by priority
 * - Execute hooks in order with proper error handling
 * - Manage control flow (abort, skip)
 * 
 * Hook Data Flow:
 * Hooks execute sequentially in priority order. Each hook receives the OUTPUT
 * of the previous hook as its INPUT via ctx.data. This allows hooks to compose:
 * 
 * 1. Hook A (priority 30) receives initial data, returns modified data
 * 2. Hook B (priority 40) receives Hook A's output, returns further modified data
 * 3. Hook C (priority 50) receives Hook B's output, returns final result
 * 
 * Changes made by earlier hooks are preserved and passed through to later hooks.
 * Each hook can:
 * - Transform the data and return it (data flows to next hook)
 * - Call ctx.skip() to pass data unchanged to next hook
 * - Call ctx.abort() to stop all further processing
 * 
 * @example Basic hook composition
 * // Hook 1: Extract base metadata (priority 30)
 * {
 *   name: 'meta:base',
 *   event: 'metadata:custom',
 *   priority: 30,
 *   fn: async (ctx) => ({
 *     layout: ctx.page.properties.Layout?.select?.name
 *   })
 * }
 * 
 * // Hook 2: Add SEO fields (priority 40)
 * {
 *   name: 'meta:seo',
 *   event: 'metadata:custom',
 *   priority: 40,
 *   fn: async (ctx) => ({
 *     ...ctx.data,  // ← Hook 1's output (has layout)
 *     ogImage: ctx.page.properties.OGImage?.url
 *   })
 *   // Returns: { layout: 'article', ogImage: 'https://...' }
 * }
 * 
 * @example Single hook usage
 * const registry = new HookRegistry(logger);
 * 
 * registry.register({
 *   name: 'custom:publish-date',
 *   event: 'publish:date',
 *   priority: 40,
 *   fn: async (ctx) => ctx.page.properties.Date?.date?.start
 * });
 * 
 * const publishDate = await registry.execute('publish:date', {
 *   page,
 *   config,
 *   data: null,
 *   logger
 * });
 */
export class HookRegistry {
	private hooks: Map<HookEvent, Hook[]> = new Map();
	private logger: {
		debug: (data: any) => void;
		info: (data: any) => void;
		warn: (data: any) => void;
		error: (data: any) => void;
	};

	constructor(
		logger: {
			debug: (data: any) => void;
			info: (data: any) => void;
			warn: (data: any) => void;
			error: (data: any) => void;
		}
	) {
		this.logger = logger;
	}

	/**
	 * Register a hook for an event.
	 * Hooks are automatically sorted by priority (lower = earlier).
	 * 
	 * @param hook - The hook to register
	 */
	register(hook: Hook): void {
		// Set default priority if not specified
		const hookWithDefaults = {
			...hook,
			priority: hook.priority ?? 50,
			continueOnError: hook.continueOnError ?? false
		};

		const existing = this.hooks.get(hook.event) || [];
		existing.push(hookWithDefaults);

		// Sort by priority (lower runs first)
		existing.sort((a, b) => (a.priority ?? 50) - (b.priority ?? 50));

		this.hooks.set(hook.event, existing);

		this.logger.debug({
			event: 'hook_registered',
			hookName: hook.name,
			hookEvent: hook.event,
			priority: hookWithDefaults.priority,
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
	 * Useful for testing or dynamic hook management.
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
	 * Hooks run sequentially in priority order.
	 * Data flows from one hook to the next.
	 * 
	 * @param event - The hook event to execute
	 * @param context - Context object (without control flow methods)
	 * @returns Final transformed data after all hooks
	 * @throws Error if a hook aborts or throws an error (unless continueOnError is true)
	 */
	async execute<TInput, TOutput>(
		event: HookEvent,
		context: Omit<HookContext<TInput>, 'abort' | 'skip'>
	): Promise<TOutput> {
		const hooks = this.hooks.get(event) || [];

		if (hooks.length === 0) {
			this.logger.debug({
				event: 'no_hooks_registered',
				hookEvent: event
			});
			return context.data as unknown as TOutput;
		}

		let result = context.data;
		const state: HookExecutionState = {
			aborted: false,
			skipped: false
		};

		// Create control flow functions
		const abort = (reason: string) => {
			state.aborted = true;
			state.abortReason = reason;
		};

		const skip = () => {
			state.skipped = true;
		};

		for (const hook of hooks) {
			// Check if we were aborted by a previous hook
			if (state.aborted) {
				this.logger.warn({
					event: 'hook_execution_aborted',
					hookEvent: event,
					abortReason: state.abortReason,
					skippedHook: hook.name
				});
				break;
			}

			try {
				// Reset skip flag for each hook
				state.skipped = false;

				// Build complete context with current data
				const fullContext: HookContext<typeof result> = {
					...context,
					data: result,
					abort,
					skip
				};

				this.logger.debug({
					event: 'hook_executing',
					hookName: hook.name,
					hookEvent: event,
					priority: hook.priority
				});

				// Execute the hook
				const output = await hook.fn(fullContext);

				// Check if hook called abort
				if (state.aborted) {
					throw new Error(`Hook aborted: ${state.abortReason}`);
				}

				// Check if hook called skip
				if (state.skipped) {
					this.logger.debug({
						event: 'hook_skipped',
						hookName: hook.name,
						hookEvent: event
					});
					continue; // Don't update result, move to next hook
				}

				// Update result for next hook
				result = output;

				this.logger.debug({
					event: 'hook_executed',
					hookName: hook.name,
					hookEvent: event
				});
			} catch (error) {
				this.logger.error({
					event: 'hook_execution_failed',
					hookName: hook.name,
					hookEvent: event,
					error: error instanceof Error ? error.message : String(error),
					continueOnError: hook.continueOnError
				});

				// Decide whether to continue or throw
				if (!hook.continueOnError) {
					throw error;
				}

				// If continuing on error, log and proceed with current result
				this.logger.warn({
					event: 'hook_error_ignored',
					hookName: hook.name,
					hookEvent: event
				});
			}
		}

		return result as unknown as TOutput;
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
