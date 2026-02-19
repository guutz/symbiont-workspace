import type { HookEvent, Hook, HookContext, HookExecutionState } from './types.js';

/**
 * HookRegistry manages registration and execution of hooks.
 * 
 * **TWO HOOK PATTERNS:**
 * 
 * 1. **Extractor Hooks** (default pattern):
 *    - Independent extractors that read from `ctx.page` and return values
 *    - Composition based on return type:
 *      - **Primitives**: First non-null wins (stops early)
 *      - **Objects**: Merge all non-null results
 *      - **Arrays**: Concatenate all non-null results
 *    - Examples: metadata:*, slug:extract, cover:extract
 * 
 * 2. **Effect Hooks** (side-effect pattern):
 *    - All hooks execute (no early stopping)
 *    - Can perform side effects (uploads, syncs, mutations)
 *    - Results are collected but not composed
 *    - Events: sync:*, *:process (see EFFECT_HOOK_EVENTS)
 *    - Examples: sync:slug, cover:process, content:images
 * 
 * @example Basic hook composition
 * ```typescript
 * // Hook 1: Try custom date extraction (priority 40)
 * {
 *   name: 'custom-date',
 *   event: 'publish:date',
 *   priority: 40,
 *   fn: async (ctx) => {
 *     const date = ctx.page.properties.CustomDate?.date?.start;
 *     return date || null; // Falls through to next hook if null
 *   }
 * }
 * 
 * // Hook 2: Default fallback (priority 50)
 * {
 *   name: 'default-date',
 *   event: 'publish:date',
 *   priority: 50,
 *   fn: async (ctx) => ctx.page.last_edited_time
 * }
 * // Result: Custom date if available, otherwise last_edited_time
 * ```
 * 
 * @example Object auto-merge
 * ```typescript
 * // Hook 1: Layout metadata
 * {
 *   name: 'meta:layout',
 *   event: 'metadata:custom',
 *   priority: 30,
 *   fn: async (ctx) => ({
 *     layout: ctx.page.properties.Layout?.select?.name,
 *     featured: ctx.page.properties.Featured?.checkbox
 *   })
 * }
 * 
 * // Hook 2: SEO metadata (auto-merged by registry)
 * {
 *   name: 'meta:seo',
 *   event: 'metadata:custom',
 *   priority: 40,
 *   fn: async (ctx) => ({
 *     // No spreading needed! Registry merges automatically
 *     ogImage: ctx.page.properties.OGImage?.url
 *   })
 * }
 * // Result: { layout, featured, ogImage } - all merged!
 * ```
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
	 * 
	 * **Extractor hooks** (default):
	 * - Primitives: First non-null wins (stops early)
	 * - Objects: Merge all non-null results
	 * - Arrays: Concatenate all non-null results
	 * 
	 * **Effect hooks** (sync:*, *:process):
	 * - All hooks execute (no early stopping)
	 * - Results collected but not composed
	 * - Used for side effects
	 * 
	 * @param event - The hook event to execute
	 * @param context - Context object (without abort method)
	 * @returns Composed result from all hooks (or array of results for effect hooks)
	 * @throws Error if a hook aborts or throws an error (unless continueOnError is true)
	 */
	async execute<TOutput = any>(
		event: HookEvent,
		context: Omit<HookContext, 'abort' | 'aborted' | 'abortReason'>
	): Promise<TOutput | null> {
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

		// Check if this is an effect hook event
		const isEffectHook = this.isEffectHookEvent(event);

		// For effect hooks, collect all results
		if (isEffectHook) {
			const results: any[] = [];
			
			for (const hook of hooks) {
				if (state.aborted) {
					this.logger.warn({
						event: 'hook_execution_aborted',
						hookEvent: event,
						hookName: hook.name,
						reason: state.abortReason
					});
					throw new Error(`Hook execution aborted: ${state.abortReason}`);
				}

				try {
					const fullContext: HookContext = {
						...context,
						aborted: state.aborted,
						abortReason: state.abortReason,
						abort
					};

					this.logger.debug({
						event: 'executing_effect_hook',
						hookName: hook.name,
						hookEvent: event,
						priority: hook.priority
					});

					const output = await hook.fn(fullContext);

					if (state.aborted) {
						throw new Error(`Hook aborted: ${state.abortReason}`);
					}

					results.push(output);
					
					this.logger.debug({
						event: 'effect_hook_executed',
						hookName: hook.name,
						hasResult: output !== null && output !== undefined
					});
				} catch (error) {
					this.logger.error({
						event: 'effect_hook_execution_failed',
						hookName: hook.name,
						hookEvent: event,
						error: error instanceof Error ? error.message : String(error),
						continueOnError: hook.continueOnError
					});

					if (!hook.continueOnError) {
						throw error;
					}

					this.logger.warn({
						event: 'effect_hook_error_ignored',
						hookName: hook.name,
						hookEvent: event
					});
				}
			}

			// Return array of results for effect hooks
			return results as any;
		}

		// Extractor hook pattern (original logic)
		// Compose result based on type
		let result: any = null;
		let resultType: 'primitive' | 'object' | 'array' | null = null;

		// Execute hooks in priority order
		for (const hook of hooks) {
			// Check if we were aborted by a previous hook
			if (state.aborted) {
				this.logger.warn({
					event: 'hook_execution_aborted',
					hookEvent: event,
					hookName: hook.name,
					reason: state.abortReason
				});
				throw new Error(`Hook execution aborted: ${state.abortReason}`);
			}

			try {
				// Build complete context
				const fullContext: HookContext = {
					...context,
					aborted: state.aborted,
					abortReason: state.abortReason,
					abort
				};

				this.logger.debug({
					event: 'executing_hook',
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

				// Skip null/undefined results
				if (output === null || output === undefined) {
					this.logger.debug({
						event: 'hook_returned_null',
						hookName: hook.name
					});
					continue;
				}

				// Determine result type on first non-null output
				if (resultType === null) {
					if (Array.isArray(output)) {
						resultType = 'array';
					} else if (typeof output === 'object' && output !== null) {
						resultType = 'object';
					} else {
						resultType = 'primitive';
					}
				}

				// Compose based on type
				if (resultType === 'primitive') {
					// First non-null wins, stop processing
					result = output;
					this.logger.debug({
						event: 'hook_executed_first_wins',
						hookName: hook.name,
						stoppingEarly: true
					});
					break;
				} else if (resultType === 'object') {
					// Merge objects
					result = { ...result, ...output };
					this.logger.debug({
						event: 'hook_executed_merged',
						hookName: hook.name
					});
				} else if (resultType === 'array') {
					// Concatenate arrays
					result = result === null ? output : [...result, ...output];
					this.logger.debug({
						event: 'hook_executed_concatenated',
						hookName: hook.name
					});
				}
			} catch (error) {
				this.logger.error({
					event: 'hook_execution_failed',
					hookName: hook.name,
					hookEvent: event,
					error: error instanceof Error ? error.message : String(error),
					stack: error instanceof Error ? error.stack : undefined,
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

		return result;
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

	/**
	 * Check if an event is an effect hook (allows side effects).
	 * 
	 * @param event - The hook event
	 * @returns True if this is an effect hook event
	 */
	private isEffectHookEvent(event: HookEvent): boolean {
		const effectEvents: HookEvent[] = [
			'content:images',
			'cover:process',
			'sync:slug',
			'sync:content',
			'sync:images'
		];
		return effectEvents.includes(event);
	}
}
