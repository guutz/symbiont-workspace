import { describe, it, expect } from 'vitest';
import {
	defaultPublishCheckHook,
	defaultPublishDateHook,
	defaultSlugExtractHook,
	defaultSlugGenerateHook,
	defaultPageShouldSyncHook,
	defaultTitleExtractHook,
	defaultTagsExtractHook,
	defaultAuthorsExtractHook,
	defaultSummaryExtractHook,
	defaultCustomMetadataHook,
	defaultContentPostprocessHook,
} from './default-hooks.js';
import type { HookContext } from './types.js';

describe('Default Hooks (Extractor Pattern)', () => {
	const mockLogger = {
		debug: () => {},
		info: () => {},
		warn: () => {},
		error: () => {}
	};

	const createMockContext = (overrides: Partial<HookContext>): HookContext => ({
		page: {} as any,
		output: {},
		config: {} as any,
		logger: mockLogger,
		services: {},
		abort: () => {},
		store: {},
		syncStore: {},
		...overrides
	});

	describe('defaultPublishCheckHook', () => {
		it('should return null when no notionClient is available', async () => {
			// Without a notionClient, the default hook abstains and allows
			// datasource-specific hooks to provide explicit publish votes.
			const ctx = createMockContext({ services: {} });
			const result = await defaultPublishCheckHook.fn(ctx);
			expect(result).toBeNull();
		});

		it('should have correct metadata', () => {
			expect(defaultPublishCheckHook.name).toBe('symbiont:publish:check');
			expect(defaultPublishCheckHook.event).toBe('publish:check');
			// Priority is undefined (default level) for built-in hooks
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
			expect(defaultPublishDateHook.name).toBe('symbiont:publish:date');
			expect(defaultPublishDateHook.event).toBe('publish:date');
			// Priority is undefined (default level) for built-in hooks
		});
	});

	describe('defaultSlugExtractHook', () => {
		it('should return null (no custom slug)', async () => {
			const ctx = createMockContext({});
			const result = await defaultSlugExtractHook.fn(ctx);
			expect(result).toBeNull();
		});

		it('should have correct metadata', () => {
			expect(defaultSlugExtractHook.name).toBe('symbiont:slug:extract');
			expect(defaultSlugExtractHook.event).toBe('slug:extract');
			// Priority is undefined (default level) for built-in hooks
		});
	});

	describe('defaultSlugGenerateHook', () => {
		it('should generate slug from Title property', async () => {
			const ctx = createMockContext({
				page: {
					properties: {
						Title: {
							type: 'title',
							title: [{ plain_text: 'Test Title With Spaces' }]
						}
					}
				} as any
			});

			const result = await defaultSlugGenerateHook.fn(ctx);
			expect(result).toBe('test-title-with-spaces');
		});

		it('should generate slug from Name property if Title not present', async () => {
			const ctx = createMockContext({
				page: {
					properties: {
						Name: {
							type: 'title',
							title: [{ plain_text: 'Another Test' }]
						}
					}
				} as any
			});

			const result = await defaultSlugGenerateHook.fn(ctx);
			expect(result).toBe('another-test');
		});

		it('should return null if no title property exists', async () => {
			// Hook abstains (returns null) when there is no title — downstream
			// hooks or the title extractor will handle the missing value.
			const ctx = createMockContext({
				page: {
					properties: {}
				} as any
			});

			const result = await defaultSlugGenerateHook.fn(ctx);
			expect(result).toBeNull();
		});

		it('should have correct metadata', () => {
			expect(defaultSlugGenerateHook.name).toBe('symbiont:slug:generate');
			expect(defaultSlugGenerateHook.event).toBe('slug:generate');
			// Priority is undefined (default level) for built-in hooks
		});
	});

	describe('defaultPageShouldSyncHook', () => {
		it('should return true (sync by default)', async () => {
			const ctx = createMockContext({});
			const result = await defaultPageShouldSyncHook.fn(ctx);
			expect(result).toBe(true);
		});

		it('should have correct metadata', () => {
			expect(defaultPageShouldSyncHook.name).toBe('symbiont:page:should-sync');
			expect(defaultPageShouldSyncHook.event).toBe('page:should-sync');
		});
	});

	describe('defaultTitleExtractHook', () => {
		it('should extract title from Title property', async () => {
			const ctx = createMockContext({
				page: {
					properties: {
						Title: {
							title: [{ plain_text: 'My Article Title' }]
						}
					}
				} as any
			});

			const result = await defaultTitleExtractHook.fn(ctx);
			expect(result).toBe('My Article Title');
		});

		it('should extract title from Name property if Title not present', async () => {
			const ctx = createMockContext({
				page: {
					properties: {
						Name: {
							title: [{ plain_text: 'My Page Name' }]
						}
					}
				} as any
			});

			const result = await defaultTitleExtractHook.fn(ctx);
			expect(result).toBe('My Page Name');
		});

		it('should concatenate multi-part title rich_text segments', async () => {
			const ctx = createMockContext({
				page: {
					properties: {
						Title: {
							title: [
								{ plain_text: 'Part One' },
								{ plain_text: ' — ' },
								{ plain_text: 'Part Two' }
							]
						}
					}
				} as any
			});

			const result = await defaultTitleExtractHook.fn(ctx);
			expect(result).toBe('Part One — Part Two');
		});

		it('should return "Untitled" if no title', async () => {
			const ctx = createMockContext({
				page: {
					properties: {}
				} as any
			});

			const result = await defaultTitleExtractHook.fn(ctx);
			expect(result).toBe('Untitled');
		});
	});

	describe('defaultTagsExtractHook', () => {
		it('should extract tags from configured property', async () => {
			const ctx = createMockContext({
				config: {
					tagsProperty: 'Tags'
				} as any,
				page: {
					properties: {
						Tags: {
							multi_select: [
								{ name: 'tech' },
								{ name: 'blog' }
							]
						}
					}
				} as any
			});

			const result = await defaultTagsExtractHook.fn(ctx);
			expect(result).toEqual(['tech', 'blog']);
		});

		it('should return empty array if no tags property configured', async () => {
			const ctx = createMockContext({
				config: {} as any
			});

			const result = await defaultTagsExtractHook.fn(ctx);
			expect(result).toEqual([]);
		});

		it('should return empty array if property not found', async () => {
			const ctx = createMockContext({
				config: {
					tagsProperty: 'Tags'
				} as any,
				page: {
					properties: {}
				} as any
			});

			const result = await defaultTagsExtractHook.fn(ctx);
			expect(result).toEqual([]);
		});
	});

	describe('defaultAuthorsExtractHook', () => {
		it('should extract authors from people property', async () => {
			const ctx = createMockContext({
				config: {
					authorsProperty: 'Authors'
				} as any,
				page: {
					properties: {
						Authors: {
							people: [
								{ name: 'John Doe' },
								{ name: 'Jane Smith' }
							]
						}
					}
				} as any
			});

			const result = await defaultAuthorsExtractHook.fn(ctx);
			expect(result).toEqual(['John Doe', 'Jane Smith']);
		});

		it('should extract authors from multi_select property', async () => {
			const ctx = createMockContext({
				config: {
					authorsProperty: 'Authors'
				} as any,
				page: {
					properties: {
						Authors: {
							multi_select: [
								{ name: 'Author 1' },
								{ name: 'Author 2' }
							]
						}
					}
				} as any
			});

			const result = await defaultAuthorsExtractHook.fn(ctx);
			expect(result).toEqual(['Author 1', 'Author 2']);
		});

		it('should return empty array if no authors configured', async () => {
			const ctx = createMockContext({
				config: {} as any
			});

			const result = await defaultAuthorsExtractHook.fn(ctx);
			expect(result).toEqual([]);
		});
	});

	describe('defaultSummaryExtractHook', () => {
		it('should extract summary from rich_text property', async () => {
			const ctx = createMockContext({
				config: {
					summaryProperty: 'Summary'
				} as any,
				page: {
					properties: {
						Summary: {
							rich_text: [
								{ plain_text: 'This is ' },
								{ plain_text: 'a summary.' }
							]
						}
					}
				} as any
			});

			const result = await defaultSummaryExtractHook.fn(ctx);
			expect(result).toBe('This is a summary.');
		});

		it('should return null if no summary property is configured', async () => {
			// Hook abstains (returns null) when no property is configured —
			// consistent with the FirstWins composition strategy.
			const ctx = createMockContext({
				config: {} as any
			});

			const result = await defaultSummaryExtractHook.fn(ctx);
			expect(result).toBeNull();
		});
	});

	describe('defaultCustomMetadataHook', () => {
		it('should return empty object', async () => {
			const ctx = createMockContext({});
			const result = await defaultCustomMetadataHook.fn(ctx);
			expect(result).toEqual({});
		});

		it('should have correct metadata', () => {
			expect(defaultCustomMetadataHook.name).toBe('symbiont:metadata:custom');
			expect(defaultCustomMetadataHook.event).toBe('metadata:custom');
			// Priority is undefined (default level) for built-in hooks
		});
	});

	describe('defaultContentPostprocessHook (resolveNotionPageLinks)', () => {
		const CLEAN_ID = 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4';
		const UUID = 'a1b2c3d4-e5f6-a1b2-c3d4-e5f6a1b2c3d4';

		/** Build a mock Supabase client that returns the given rows for a `pages` query */
		const mockSupabase = (rows: Array<{ page_id: string; slug: string | null }>) => ({
			from: () => ({
				select: () => ({
					in: () => Promise.resolve({ data: rows, error: null }),
				}),
			}),
		});

		it('returns content unchanged when supabase is not available', async () => {
			const content = `See [A Page](notion://page/${CLEAN_ID}) here.`;
			const ctx = createMockContext({ input: content, services: {} });
			const result = await defaultContentPostprocessHook.fn(ctx);
			expect(result).toBe(content);
		});

		it('returns content unchanged when there are no notion:// sentinels', async () => {
			const content = 'No page links here.';
			const ctx = createMockContext({
				input: content,
				services: { supabase: mockSupabase([]) as any },
			});
			const result = await defaultContentPostprocessHook.fn(ctx);
			expect(result).toBe(content);
		});

		it('resolves a found page sentinel to /{slug}', async () => {
			const content = `See [My Article](notion://page/${CLEAN_ID}) for details.`;
			const ctx = createMockContext({
				input: content,
				services: {
					supabase: mockSupabase([{ page_id: UUID, slug: 'my-article' }]) as any,
				},
			});
			const result = await defaultContentPostprocessHook.fn(ctx);
			expect(result).toBe('See [My Article](/my-article) for details.');
		});

		it('strips an unresolvable sentinel to plain text', async () => {
			const content = `See [Unknown Page](notion://page/${CLEAN_ID}) here.`;
			const ctx = createMockContext({
				input: content,
				services: { supabase: mockSupabase([]) as any },
			});
			const result = await defaultContentPostprocessHook.fn(ctx);
			expect(result).toBe('See Unknown Page here.');
		});

		it('strips a sentinel whose DB row has null slug to plain text', async () => {
			const content = `Check [Draft Page](notion://page/${CLEAN_ID}).`;
			const ctx = createMockContext({
				input: content,
				services: {
					supabase: mockSupabase([{ page_id: UUID, slug: null }]) as any,
				},
			});
			const result = await defaultContentPostprocessHook.fn(ctx);
			expect(result).toBe('Check Draft Page.');
		});

		it('resolves multiple different sentinels in one pass', async () => {
			const CLEAN_ID_2 = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
			const UUID_2 = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
			const content = `[Page A](notion://page/${CLEAN_ID}) and [Page B](notion://page/${CLEAN_ID_2}).`;
			const ctx = createMockContext({
				input: content,
				services: {
					supabase: mockSupabase([
						{ page_id: UUID, slug: 'page-a' },
						{ page_id: UUID_2, slug: 'page-b' },
					]) as any,
				},
			});
			const result = await defaultContentPostprocessHook.fn(ctx);
			expect(result).toBe('[Page A](/page-a) and [Page B](/page-b).');
		});

		it('resolves duplicate sentinels (same ID used twice)', async () => {
			const content = `[A](notion://page/${CLEAN_ID}) and [A](notion://page/${CLEAN_ID}).`;
			const ctx = createMockContext({
				input: content,
				services: {
					supabase: mockSupabase([{ page_id: UUID, slug: 'page-a' }]) as any,
				},
			});
			const result = await defaultContentPostprocessHook.fn(ctx);
			expect(result).toBe('[A](/page-a) and [A](/page-a).');
		});
	});
});
