import { describe, it, expect, beforeEach } from 'vitest';
import { HookRegistry } from './registry.js';
import type { Hook } from './types.js';

describe('HookRegistry (Extractor Pattern)', () => {
	let registry: HookRegistry;
	let mockLogger: any;

	beforeEach(() => {
		mockLogger = {
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {}
		};
		const mockConfig: any = {
			alias: 'test',
			dataSourceId: 'test-id'
		};
		const mockServices: any = {
			notionClient: undefined,
			supabase: undefined
		};
		registry = new HookRegistry(mockLogger, mockConfig, mockServices);
	});

	describe('registration', () => {
		it('should register a single hook', () => {
			const hook: Hook = {
				name: 'test:hook',
				event: 'publish:check',
				
				fn: async () => true
			};

			registry.register(hook);

			const hooks = registry.getHooks('publish:check');
			expect(hooks).toHaveLength(1);
			expect(hooks[0].name).toBe('test:hook');
		});

		it('should register multiple hooks', () => {
			const hooks: Hook[] = [
				{ name: 'hook1', event: 'publish:check', priority: 'override', fn: async () => true },
				{ name: 'hook2', event: 'publish:check',  fn: async () => true }
			];

			registry.registerMany(hooks);

			const registered = registry.getHooks('publish:check');
			expect(registered).toHaveLength(2);
		});

		it('should sort hooks by priority (lower first)', () => {
			const hooks: Hook[] = [
				{ name: 'hook3', event: 'publish:check', priority: 'fallback', fn: async () => true },
				{ name: 'hook1', event: 'publish:check', priority: 'override', fn: async () => true },
				{ name: 'hook2', event: 'publish:check',  fn: async () => true }
			];

			registry.registerMany(hooks);

			const registered = registry.getHooks('publish:check');
			expect(registered[0].name).toBe('hook1'); // priority 30
			expect(registered[1].name).toBe('hook2'); // priority 50
			expect(registered[2].name).toBe('hook3'); // priority 70
		});

		it('should store hooks without priority as undefined (numeric default is 50 internally)', () => {
			// The registry maps 'override'→40, undefined→50, 'fallback'→60 for sorting,
			// but stores the original priority value on the hook object.
			const hook: Hook = {
				name: 'test:hook',
				event: 'publish:check',
				fn: async () => true
			};

			registry.register(hook);

			const hooks = registry.getHooks('publish:check');
			expect(hooks[0].priority).toBeUndefined();
		});
	});

	describe('execution - primitives (first non-null wins)', () => {
		it('should execute a single hook returning primitive', async () => {
			const hook: Hook<string> = {
				name: 'test:hook',
				event: 'publish:date',
				
				fn: async () => '2024-01-01T00:00:00Z'
			};

			registry.register(hook);

			const result = await registry.execute('publish:date', {}, {} as any);

			expect(result).toBe('2024-01-01T00:00:00Z');
		});

		it('should stop at first non-null for primitives', async () => {
			const executionOrder: string[] = [];

			const hooks: Hook<string>[] = [
				{
					name: 'hook1',
					event: 'publish:date',
					priority: 'override',
					fn: async () => {
						executionOrder.push('hook1');
						return '2024-01-01T00:00:00Z'; // First non-null
					}
				},
				{
					name: 'hook2',
					event: 'publish:date',
					
					fn: async () => {
						executionOrder.push('hook2'); // Should NOT execute
						return '2024-02-01T00:00:00Z';
					}
				}
			];

			registry.registerMany(hooks);

			const result = await registry.execute('publish:date', {}, {} as any);

			expect(result).toBe('2024-01-01T00:00:00Z');
			expect(executionOrder).toEqual(['hook1']); // Only first hook ran
		});

		it('should continue to next hook if first returns null', async () => {
			const executionOrder: string[] = [];

			const hooks: Hook<string | null>[] = [
				{
					name: 'hook1',
					event: 'publish:date',
					priority: 'override',
					fn: async () => {
						executionOrder.push('hook1');
						return null; // Falls through
					}
				},
				{
					name: 'hook2',
					event: 'publish:date',
					
					fn: async () => {
						executionOrder.push('hook2');
						return '2024-01-01T00:00:00Z'; // Second hook wins
					}
				}
			];

			registry.registerMany(hooks);

			const result = await registry.execute('publish:date', {}, {} as any);

			expect(result).toBe('2024-01-01T00:00:00Z');
			expect(executionOrder).toEqual(['hook1', 'hook2']); // Both ran
		});

		it('should return null if all hooks return null', async () => {
			const hooks: Hook<string | null>[] = [
				{
					name: 'hook1',
					event: 'publish:date',
					priority: 'override',
					fn: async () => null
				},
				{
					name: 'hook2',
					event: 'publish:date',
					
					fn: async () => null
				}
			];

			registry.registerMany(hooks);

			const result = await registry.execute('publish:date', {}, {} as any);

			expect(result).toBeNull();
		});
	});

	describe('execution - objects (auto-merge)', () => {
		it('should merge all non-null objects', async () => {
			const hooks: Hook<Record<string, any>>[] = [
				{
					name: 'hook1',
					event: 'metadata:custom',
					priority: 'override',
					fn: async () => ({ field1: 'value1' }) // No spreading needed!
				},
				{
					name: 'hook2',
					event: 'metadata:custom',
					priority: 'override',
					fn: async () => ({ field2: 'value2' }) // No ctx.data!
				},
				{
					name: 'hook3',
					event: 'metadata:custom',
					
					fn: async () => ({ field3: 'value3' })
				}
			];

			registry.registerMany(hooks);

			const result = await registry.execute('metadata:custom', {}, {} as any);

			expect(result).toEqual({
				field1: 'value1',
				field2: 'value2',
				field3: 'value3'
			});
		});

		it('should skip null returns when merging objects', async () => {
			const hooks: Hook<Record<string, any> | null>[] = [
				{
					name: 'hook1',
					event: 'metadata:custom',
					priority: 'override',
					fn: async () => ({ field1: 'value1' })
				},
				{
					name: 'hook2',
					event: 'metadata:custom',
					priority: 'override',
					fn: async () => null // Skipped
				},
				{
					name: 'hook3',
					event: 'metadata:custom',
					
					fn: async () => ({ field3: 'value3' })
				}
			];

			registry.registerMany(hooks);

			const result = await registry.execute('metadata:custom', {}, {} as any);

			expect(result).toEqual({
				field1: 'value1',
				field3: 'value3'
			});
		});

		it('should override fields with same name (later wins)', async () => {
			const hooks: Hook<Record<string, any>>[] = [
				{
					name: 'hook1',
					event: 'metadata:custom',
					priority: 'override',
					fn: async () => ({ field: 'first' })
				},
				{
					name: 'hook2',
					event: 'metadata:custom',
					
					fn: async () => ({ field: 'second' }) // Overwrites
				}
			];

			registry.registerMany(hooks);

			const result = await registry.execute('metadata:custom', {}, {} as any);

			expect(result).toEqual({ field: 'second' });
		});
	});

	describe('execution - arrays (auto-concatenate)', () => {
		it('should concatenate all non-null arrays', async () => {
			const hooks: Hook<string[]>[] = [
				{
					name: 'hook1',
					event: 'metadata:tags',
					priority: 'override',
					fn: async () => ['tag1', 'tag2']
				},
				{
					name: 'hook2',
					event: 'metadata:tags',
					
					fn: async () => ['tag3', 'tag4']
				}
			];

			registry.registerMany(hooks);

			const result = await registry.execute('metadata:tags', {}, {} as any);

			expect(result).toEqual(['tag1', 'tag2', 'tag3', 'tag4']);
		});

		it('should skip null returns when concatenating arrays', async () => {
			const hooks: Hook<string[] | null>[] = [
				{
					name: 'hook1',
					event: 'metadata:tags',
					priority: 'override',
					fn: async () => ['tag1']
				},
				{
					name: 'hook2',
					event: 'metadata:tags',
					priority: 'override',
					fn: async () => null // Skipped
				},
				{
					name: 'hook3',
					event: 'metadata:tags',
					
					fn: async () => ['tag2']
				}
			];

			registry.registerMany(hooks);

			const result = await registry.execute('metadata:tags', {}, {} as any);

			expect(result).toEqual(['tag1', 'tag2']);
		});
	});

	describe('control flow', () => {
		it('should return false for publish:check when all hooks abstain', async () => {
			const hooks: Hook[] = [
				{
					name: 'abstain:hook1',
					event: 'publish:check',
					priority: 'override',
					fn: async () => null
				},
				{
					name: 'abstain:hook2',
					event: 'publish:check',
					fn: async () => null
				}
			];

			registry.registerMany(hooks);

			const result = await registry.execute('publish:check', {}, {} as any);
			expect(result).toBe(false);
		});

		it('should return null if no hooks registered', async () => {
			const result = await registry.execute('publish:check', {}, {} as any);

			expect(result).toBeNull();
		});

		it('should throw error if hook throws', async () => {
			const hook: Hook = {
				name: 'failing:hook',
				event: 'publish:check',
				
				fn: async () => {
					throw new Error('Hook failed');
				}
			};

			registry.register(hook);

			await expect(
				registry.execute('publish:check', {}, {} as any)
			).rejects.toThrow('Hook failed');
		});

		it('should continue if hook throws and continueOnError is true', async () => {
			const hooks: Hook[] = [
				{
					name: 'failing:hook',
					event: 'publish:check',
					priority: 'override',
					continueOnError: true,
					fn: async () => {
						throw new Error('Hook failed');
					}
				},
				{
					name: 'success:hook',
					event: 'publish:check',
					
					fn: async () => true
				}
			];

			registry.registerMany(hooks);

			const result = await registry.execute('publish:check', {}, {} as any);

			expect(result).toBe(true); // Second hook ran
		});

		it('should abort on ctx.abort()', async () => {
			const executionOrder: string[] = [];

			const hooks: Hook[] = [
				{
					name: 'hook1',
					event: 'publish:check',
					priority: 'override',
					fn: async (ctx) => {
						executionOrder.push('hook1');
						ctx.abort('Page is invalid');
						return true;
					}
				},
				{
					name: 'hook2',
					event: 'publish:check',
					
					fn: async () => {
						executionOrder.push('hook2'); // Should NOT run
						return true;
					}
				}
			];

			registry.registerMany(hooks);

			await expect(
				registry.execute('publish:check', {}, {} as any)
			).rejects.toThrow('Page is invalid');

			expect(executionOrder).toEqual(['hook1']); // Only first hook ran
		});
	});

	describe('utility methods', () => {
		it('should unregister hook by name', () => {
			const hook: Hook = {
				name: 'test:hook',
				event: 'publish:check',
				fn: async () => true
			};

			registry.register(hook);
			expect(registry.getHooks('publish:check')).toHaveLength(1);

			registry.unregister('test:hook');
			expect(registry.getHooks('publish:check')).toHaveLength(0);
		});

		it('should clear all hooks', () => {
			const hooks: Hook[] = [
				{ name: 'hook1', event: 'publish:check', fn: async () => true },
				{ name: 'hook2', event: 'publish:date', fn: async () => '2024-01-01' }
			];

			registry.registerMany(hooks);
			expect(registry.getHookCount('publish:check')).toBe(1);
			expect(registry.getHookCount('publish:date')).toBe(1);

			registry.clear();
			expect(registry.getHookCount('publish:check')).toBe(0);
			expect(registry.getHookCount('publish:date')).toBe(0);
		});

		it('should get all hooks', () => {
			const hooks: Hook[] = [
				{ name: 'hook1', event: 'publish:check', fn: async () => true },
				{ name: 'hook2', event: 'publish:date', fn: async () => '2024-01-01' }
			];

			registry.registerMany(hooks);

			const allHooks = registry.getAllHooks();
			expect(allHooks.size).toBe(2);
			expect(allHooks.get('publish:check')).toHaveLength(1);
			expect(allHooks.get('publish:date')).toHaveLength(1);
		});
	});
});
