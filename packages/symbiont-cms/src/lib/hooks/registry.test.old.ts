import { describe, it, expect, beforeEach } from 'vitest';
import { HookRegistry } from './registry.js';
import type { Hook } from './types.js';

describe('HookRegistry', () => {
	let registry: HookRegistry;
	let mockLogger: any;

	beforeEach(() => {
		mockLogger = {
			debug: () => {},
			info: () => {},
			warn: () => {},
			error: () => {}
		};
		registry = new HookRegistry(mockLogger);
	});

	describe('registration', () => {
		it('should register a single hook', () => {
			const hook: Hook = {
				name: 'test:hook',
				event: 'publish:check',
				priority: 50,
				fn: async () => true
			};

			registry.register(hook);

			const hooks = registry.getHooks('publish:check');
			expect(hooks).toHaveLength(1);
			expect(hooks[0].name).toBe('test:hook');
		});

		it('should register multiple hooks', () => {
			const hooks: Hook[] = [
				{ name: 'hook1', event: 'publish:check', priority: 30, fn: async () => true },
				{ name: 'hook2', event: 'publish:check', priority: 50, fn: async () => true }
			];

			registry.registerMany(hooks);

			const registered = registry.getHooks('publish:check');
			expect(registered).toHaveLength(2);
		});

		it('should sort hooks by priority (lower first)', () => {
			const hooks: Hook[] = [
				{ name: 'hook3', event: 'publish:check', priority: 70, fn: async () => true },
				{ name: 'hook1', event: 'publish:check', priority: 30, fn: async () => true },
				{ name: 'hook2', event: 'publish:check', priority: 50, fn: async () => true }
			];

			registry.registerMany(hooks);

			const registered = registry.getHooks('publish:check');
			expect(registered[0].name).toBe('hook1'); // priority 30
			expect(registered[1].name).toBe('hook2'); // priority 50
			expect(registered[2].name).toBe('hook3'); // priority 70
		});

		it('should default priority to 50 if not specified', () => {
			const hook: Hook = {
				name: 'test:hook',
				event: 'publish:check',
				fn: async () => true
			};

			registry.register(hook);

			const hooks = registry.getHooks('publish:check');
			expect(hooks[0].priority).toBe(50);
		});
	});

	describe('execution', () => {
		it('should execute a single hook', async () => {
			const hook: Hook<null, string> = {
				name: 'test:hook',
				event: 'publish:date',
				priority: 50,
				fn: async () => '2024-01-01T00:00:00Z'
			};

			registry.register(hook);

			const result = await registry.execute('publish:date', {
				page: {} as any,
				config: {} as any,
				data: null,
				logger: mockLogger
			});

			expect(result).toBe('2024-01-01T00:00:00Z');
		});

		it('should execute hooks in priority order', async () => {
			const executionOrder: string[] = [];

			const hooks: Hook[] = [
				{
					name: 'hook3',
					event: 'metadata:custom',
					priority: 70,
					fn: async (ctx) => {
						executionOrder.push('hook3');
						return ctx.data;
					}
				},
				{
					name: 'hook1',
					event: 'metadata:custom',
					priority: 30,
					fn: async (ctx) => {
						executionOrder.push('hook1');
						return ctx.data;
					}
				},
				{
					name: 'hook2',
					event: 'metadata:custom',
					priority: 50,
					fn: async (ctx) => {
						executionOrder.push('hook2');
						return ctx.data;
					}
				}
			];

			registry.registerMany(hooks);

			await registry.execute('metadata:custom', {
				page: {} as any,
				config: {} as any,
				data: {},
				logger: mockLogger
			});

			expect(executionOrder).toEqual(['hook1', 'hook2', 'hook3']);
		});

		it('should pass data from one hook to the next', async () => {
			const hooks: Hook<Record<string, any>, Record<string, any>>[] = [
				{
					name: 'hook1',
					event: 'metadata:custom',
					priority: 30,
					fn: async () => ({ field1: 'value1' })
				},
				{
					name: 'hook2',
					event: 'metadata:custom',
					priority: 40,
					fn: async (ctx) => ({
						...ctx.data,
						field2: 'value2'
					})
				},
				{
					name: 'hook3',
					event: 'metadata:custom',
					priority: 50,
					fn: async (ctx) => ({
						...ctx.data,
						field3: 'value3'
					})
				}
			];

			registry.registerMany(hooks);

			const result = await registry.execute('metadata:custom', {
				page: {} as any,
				config: {} as any,
				data: {},
				logger: mockLogger
			});

			expect(result).toEqual({
				field1: 'value1',
				field2: 'value2',
				field3: 'value3'
			});
		});

		it('should return initial data if no hooks registered', async () => {
			const result = await registry.execute('publish:check', {
				page: {} as any,
				config: {} as any,
				data: true,
				logger: mockLogger
			});

			expect(result).toBe(true);
		});

		it('should throw error if hook throws', async () => {
			const hook: Hook = {
				name: 'failing:hook',
				event: 'publish:check',
				priority: 50,
				fn: async () => {
					throw new Error('Hook failed');
				}
			};

			registry.register(hook);

			await expect(
				registry.execute('publish:check', {
					page: {} as any,
					config: {} as any,
					data: null,
					logger: mockLogger
				})
			).rejects.toThrow('Hook failed');
		});
	});

	describe('control flow', () => {
		it('should skip to next hook when ctx.skip() is called', async () => {
			const hooks: Hook<null, string>[] = [
				{
					name: 'hook1',
					event: 'publish:date',
					priority: 30,
					fn: async (ctx) => {
						ctx.skip(); // Skip this hook
						return 'skipped-date';
					}
				},
				{
					name: 'hook2',
					event: 'publish:date',
					priority: 50,
					fn: async () => '2024-01-01T00:00:00Z'
				}
			];

			registry.registerMany(hooks);

			const result = await registry.execute('publish:date', {
				page: {} as any,
				config: {} as any,
				data: null,
				logger: mockLogger
			});

			// Should use hook2's result, not hook1's
			expect(result).toBe('2024-01-01T00:00:00Z');
		});

		it('should abort execution when ctx.abort() is called', async () => {
			const executionOrder: string[] = [];

			const hooks: Hook[] = [
				{
					name: 'hook1',
					event: 'publish:check',
					priority: 30,
					fn: async (ctx) => {
						executionOrder.push('hook1');
						ctx.abort('Aborted by hook1');
						return false;
					}
				},
				{
					name: 'hook2',
					event: 'publish:check',
					priority: 50,
					fn: async () => {
						executionOrder.push('hook2');
						return true;
					}
				}
			];

			registry.registerMany(hooks);

			await expect(
				registry.execute('publish:check', {
					page: {} as any,
					config: {} as any,
					data: null,
					logger: mockLogger
				})
			).rejects.toThrow('Hook aborted: Aborted by hook1');

			// Only hook1 should have executed
			expect(executionOrder).toEqual(['hook1']);
		});
	});

	describe('utility methods', () => {
		it('should unregister a hook by name', () => {
			const hook: Hook = {
				name: 'test:hook',
				event: 'publish:check',
				priority: 50,
				fn: async () => true
			};

			registry.register(hook);
			expect(registry.getHooks('publish:check')).toHaveLength(1);

			registry.unregister('test:hook');
			expect(registry.getHooks('publish:check')).toHaveLength(0);
		});

		it('should get all hooks across all events', () => {
			registry.registerMany([
				{ name: 'hook1', event: 'publish:check', priority: 50, fn: async () => true },
				{ name: 'hook2', event: 'publish:date', priority: 50, fn: async () => '' }
			]);

			const allHooks = registry.getAllHooks();
			expect(allHooks.size).toBe(2);
			expect(allHooks.get('publish:check')).toHaveLength(1);
			expect(allHooks.get('publish:date')).toHaveLength(1);
		});

		it('should count hooks for an event', () => {
			registry.registerMany([
				{ name: 'hook1', event: 'publish:check', priority: 50, fn: async () => true },
				{ name: 'hook2', event: 'publish:check', priority: 40, fn: async () => true }
			]);

			expect(registry.getHookCount('publish:check')).toBe(2);
			expect(registry.getHookCount('publish:date')).toBe(0);
		});

		it('should clear all hooks', () => {
			registry.registerMany([
				{ name: 'hook1', event: 'publish:check', priority: 50, fn: async () => true },
				{ name: 'hook2', event: 'publish:date', priority: 50, fn: async () => '' }
			]);

			registry.clear();

			expect(registry.getHookCount('publish:check')).toBe(0);
			expect(registry.getHookCount('publish:date')).toBe(0);
		});
	});
});
