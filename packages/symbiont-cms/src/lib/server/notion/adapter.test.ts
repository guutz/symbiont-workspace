/**
 * Tests for NotionAdapter - Notion API interactions
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { NotionAdapter } from './adapter.js';
import type { PageObjectResponse } from '@notionhq/client/build/src/api-endpoints.js';

// Mock the Notion client and n2m
vi.mock('@notionhq/client');
vi.mock('notion-to-md');

describe('NotionAdapter', () => {
	let mockNotion: any;
	let mockN2m: any;
	let adapter: NotionAdapter;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock Notion client
		mockNotion = {
			pages: {
				retrieve: vi.fn(),
				update: vi.fn()
			},
			databases: {
				query: vi.fn()
			}
		};

		// Mock NotionToMarkdown
		mockN2m = {
			pageToMarkdown: vi.fn(),
			toMarkdownString: vi.fn()
		};

		adapter = new NotionAdapter(mockNotion as any, mockN2m as any);
	});

	describe('getPage', () => {
		it('should fetch a page by ID', async () => {
			const mockPage = {
				object: 'page',
				id: 'page-123',
				properties: {}
			};

			mockNotion.pages.retrieve.mockResolvedValue(mockPage);

			const result = await adapter.getPage('page-123');

			expect(result).toEqual(mockPage);
			expect(mockNotion.pages.retrieve).toHaveBeenCalledWith({
				page_id: 'page-123'
			});
		});

		it('should handle errors when fetching page', async () => {
			mockNotion.pages.retrieve.mockRejectedValue(new Error('Page not found'));

			await expect(adapter.getPage('invalid-id')).rejects.toThrow('Page not found');
		});
	});

	describe('queryDataSource', () => {
		it('should query a database with no filter or cursor', async () => {
			const mockPages = [
				{ object: 'page', id: 'page-1', properties: {} },
				{ object: 'page', id: 'page-2', properties: {} }
			];

			mockNotion.databases.query.mockResolvedValue({
				results: mockPages,
				next_cursor: null,
				has_more: false
			});

			const result = await adapter.queryDataSource('db-123');

			expect(result.pages).toEqual(mockPages);
			expect(result.nextCursor).toBeNull();
			expect(mockNotion.databases.query).toHaveBeenCalledWith({
				database_id: 'db-123',
				filter: undefined,
				start_cursor: undefined
			});
		});

		it('should query with filter and cursor', async () => {
			const filter = {
				property: 'Status',
				select: { equals: 'Published' }
			};

			mockNotion.databases.query.mockResolvedValue({
				results: [],
				next_cursor: 'cursor-123',
				has_more: true
			});

			const result = await adapter.queryDataSource('db-123', filter, 'start-cursor');

			expect(result.nextCursor).toBe('cursor-123');
			expect(mockNotion.databases.query).toHaveBeenCalledWith({
				database_id: 'db-123',
				filter,
				start_cursor: 'start-cursor'
			});
		});

		it('should handle pagination', async () => {
			mockNotion.databases.query.mockResolvedValue({
				results: [{ object: 'page', id: 'page-1' }],
				next_cursor: 'next-page',
				has_more: true
			});

			const result = await adapter.queryDataSource('db-123');

			expect(result.nextCursor).toBe('next-page');
		});
	});

	describe('updateProperty', () => {
		it('should update a rich_text property', async () => {
			const mockPage = {
				object: 'page',
				id: 'page-123',
				properties: {}
			};

			mockNotion.pages.update.mockResolvedValue(mockPage);

			await adapter.updateProperty('page-123', 'Slug', 'my-slug');

			expect(mockNotion.pages.update).toHaveBeenCalledWith({
				page_id: 'page-123',
				properties: {
					Slug: {
						rich_text: [
							{
								type: 'text',
								text: { content: 'my-slug' }
							}
						]
					}
				}
			});
		});

		it('should not throw on update errors', async () => {
			mockNotion.pages.update.mockRejectedValue(new Error('Update failed'));

			// Should not throw - updateProperty swallows errors
			await expect(adapter.updateProperty('page-123', 'Slug', 'test')).resolves.toBeUndefined();
		});
	});

	describe('pageToMarkdown', () => {
		it('should convert page to markdown', async () => {
			const mockMdBlocks = [
				{ parent: 'block-1', type: 'paragraph' },
				{ parent: 'block-2', type: 'heading_1' }
			];

			mockN2m.pageToMarkdown.mockResolvedValue(mockMdBlocks);
			mockN2m.toMarkdownString.mockReturnValue({ parent: '# Test\n\nContent here' });

			const result = await adapter.pageToMarkdown('page-123');

			expect(result).toBe('# Test\n\nContent here');
			expect(mockN2m.pageToMarkdown).toHaveBeenCalledWith('page-123');
			expect(mockN2m.toMarkdownString).toHaveBeenCalledWith(mockMdBlocks);
		});

		it('should handle conversion errors', async () => {
			mockN2m.pageToMarkdown.mockRejectedValue(new Error('Conversion failed'));

			await expect(adapter.pageToMarkdown('page-123')).rejects.toThrow('Conversion failed');
		});
	});

	describe('getPropertyValues', () => {
		it('should extract multi_select values', () => {
			const mockPage = {
				properties: {
					Tags: {
						type: 'multi_select',
						multi_select: [{ name: 'Tag1' }, { name: 'Tag2' }, { name: 'Tag3' }]
					}
				}
			} as any;

			const result = adapter.getPropertyValues(mockPage, 'Tags');

			expect(result).toEqual(['Tag1', 'Tag2', 'Tag3']);
		});

		it('should extract select values', () => {
			const mockPage = {
				properties: {
					Status: {
						type: 'select',
						select: { name: 'Published' }
					}
				}
			} as any;

			const result = adapter.getPropertyValues(mockPage, 'Status');

			expect(result).toEqual(['Published']);
		});

		it('should extract people names', () => {
			const mockPage = {
				properties: {
					Authors: {
						type: 'people',
						people: [{ name: 'Alice', id: 'user-1' }, { name: 'Bob', id: 'user-2' }]
					}
				}
			} as any;

			const result = adapter.getPropertyValues(mockPage, 'Authors');

			expect(result).toEqual(['Alice', 'Bob']);
		});

		it('should extract rich_text values', () => {
			const mockPage = {
				properties: {
					Description: {
						type: 'rich_text',
						rich_text: [{ plain_text: 'Some ' }, { plain_text: 'description' }]
					}
				}
			} as any;

			const result = adapter.getPropertyValues(mockPage, 'Description');

			expect(result).toEqual(['Some description']);
		});

		it('should return empty array for missing property', () => {
			const mockPage = {
				properties: {}
			} as any;

			const result = adapter.getPropertyValues(mockPage, 'NonExistent');

			expect(result).toEqual([]);
		});

		it('should use person ID when name not available', () => {
			const mockPage = {
				properties: {
					Authors: {
						type: 'people',
						people: [{ id: 'user-123' }]
					}
				}
			} as any;

			const result = adapter.getPropertyValues(mockPage, 'Authors');

			expect(result).toEqual(['user-123']);
		});
	});

	describe('getTitleProperty', () => {
		it('should find title property by type', () => {
			const mockPage = {
				properties: {
					Name: { type: 'title', title: [{ plain_text: 'Test' }] },
					Other: { type: 'rich_text', rich_text: [] }
				}
			} as any;

			const result = adapter.getTitleProperty(mockPage);

			expect(result).toBe('Test');
		});

		it('should handle empty title', () => {
			const mockPage = {
				properties: {
					Name: { type: 'title', title: [] }
				}
			} as any;

			const result = adapter.getTitleProperty(mockPage);

			expect(result).toBe('Untitled');
		});

		it('should return "Untitled" if no title property exists', () => {
			const mockPage = {
				properties: {
					Description: { type: 'rich_text', rich_text: [] }
				}
			} as any;

			const result = adapter.getTitleProperty(mockPage);

			expect(result).toBe('Untitled');
		});
	});

	describe('getUniqueIdProperty', () => {
		it('should find unique_id property by type', () => {
			const mockPage = {
				properties: {
					ID: { type: 'unique_id', unique_id: { number: 42, prefix: 'POST' } },
					Other: { type: 'number', number: 123 }
				}
			} as any;

			const result = adapter.getUniqueIdProperty(mockPage);

			expect(result).toBe('POST-42');
		});

		it('should handle unique_id without prefix', () => {
			const mockPage = {
				properties: {
					ID: { type: 'unique_id', unique_id: { number: 42 } }
				}
			} as any;

			const result = adapter.getUniqueIdProperty(mockPage);

			expect(result).toBe('42');
		});

		it('should return null if no unique_id property exists', () => {
			const mockPage = {
				properties: {
					Number: { type: 'number', number: 123 }
				}
			} as any;

			const result = adapter.getUniqueIdProperty(mockPage);

			expect(result).toBeNull();
		});
	});
});
