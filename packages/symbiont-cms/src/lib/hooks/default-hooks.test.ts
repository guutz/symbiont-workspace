import { describe, it, expect } from 'vitest';
import {
	defaultPublishCheckHook,
	defaultPublishDateHook,
	defaultSlugExtractHook,
	defaultSlugGenerateHook,
	defaultPageExcludeHook
} from './default-hooks.js';
import type { HookContext } from './types.js';

describe('Default Hooks', () => {
	const mockLogger = {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {}
	};

	const createMockContext = (overrides: Partial<HookContext>): HookContext => ({
		page: {} as any,
		config: {} as any,
		data: null,
		logger: mockLogger,
		abort: () => {},
		skip: () => {},
		...overrides
	});

	describe('defaultPublishCheckHook', () => {
		it('should always return true by default', async () => {
			const ctx = createMockContext({});
			const result = await defaultPublishCheckHook.fn(ctx);
			expect(result).toBe(true);
		});

		it('should have correct metadata', () => {
			expect(defaultPublishCheckHook.name).toBe('symbiont:publish:check:default');
			expect(defaultPublishCheckHook.event).toBe('publish:check');
			expect(defaultPublishCheckHook.priority).toBe(50);
		});
	});

	describe('defaultPublishDateHook', () => {
		it('should return last_edited_time from page', async () => {
			const mockDate = '2024-01-15T10:30:00.000Z';
			const ctx = createMockContext({
				page: {
					last_edited_time: mockDate
				} as any
			});

			const result = await defaultPublishDateHook.fn(ctx);
			expect(result).toBe(mockDate);
		});

		it('should have correct metadata', () => {
			expect(defaultPublishDateHook.name).toBe('symbiont:publish:date:default');
			expect(defaultPublishDateHook.event).toBe('publish:date');
			expect(defaultPublishDateHook.priority).toBe(50);
		});
	});

	describe('defaultSlugExtractHook', () => {
		it('should return null (no custom slug)', async () => {
			const ctx = createMockContext({});
			const result = await defaultSlugExtractHook.fn(ctx);
			expect(result).toBeNull();
		});

		it('should have correct metadata', () => {
			expect(defaultSlugExtractHook.name).toBe('symbiont:slug:extract:default');
			expect(defaultSlugExtractHook.event).toBe('slug:extract');
			expect(defaultSlugExtractHook.priority).toBe(50);
		});
	});

	describe('defaultSlugGenerateHook', () => {
		it('should use custom slug if provided', async () => {
			const ctx = createMockContext({
				data: {
					title: 'Test Title',
					customSlug: 'custom-slug'
				}
			});

			const result = await defaultSlugGenerateHook.fn(ctx);
			expect(result).toBe('custom-slug');
		});

		it('should generate slug from title if no custom slug', async () => {
			const ctx = createMockContext({
				data: {
					title: 'Test Title With Spaces',
					customSlug: null
				}
			});

			const result = await defaultSlugGenerateHook.fn(ctx);
			// createSlug should convert to lowercase and replace spaces with hyphens
			expect(result).toBe('test-title-with-spaces');
		});

		it('should have correct metadata', () => {
			expect(defaultSlugGenerateHook.name).toBe('symbiont:slug:generate:default');
			expect(defaultSlugGenerateHook.event).toBe('slug:generate');
			expect(defaultSlugGenerateHook.priority).toBe(50);
		});
	});

	describe('defaultPageExcludeHook', () => {
		it('should not exclude any pages by default', async () => {
			const ctx = createMockContext({});
			const result = await defaultPageExcludeHook.fn(ctx);
			expect(result).toBe(false);
		});

		it('should have correct metadata', () => {
			expect(defaultPageExcludeHook.name).toBe('symbiont:page:exclude:default');
			expect(defaultPageExcludeHook.event).toBe('page:exclude');
			expect(defaultPageExcludeHook.priority).toBe(50);
		});
	});
});
