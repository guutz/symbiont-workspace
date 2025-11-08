/**
 * Tests for PostBuilder - Business logic for transforming Notion pages
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { PageObjectResponse } from '@notionhq/client';
import { PostBuilder } from './post-builder.js';
import { NotionAdapter } from '../notion/adapter.js';
import { PostRepository } from './post-repository.js';
import type { DatabaseBlueprint } from '../../types.js';
import type { Post } from '../../types.js';

// Mock slug helper
vi.mock('../../utils/slug-helpers.js', () => ({
	createSlug: vi.fn((title: string) => title.toLowerCase().replace(/\s+/g, '-'))
}));

describe('PostBuilder', () => {
	let mockNotionAdapter: any;
	let mockPostRepository: any;
	let builder: PostBuilder;
	let mockConfig: DatabaseBlueprint;

	beforeEach(() => {
		vi.clearAllMocks();

		// Basic config
		mockConfig = {
			alias: 'test-blog',
			dataSourceId: 'datasource-123',
			notionToken: 'secret_test_token',
			isPublicRule: (page: PageObjectResponse) => {
				const tags = (page.properties.Tags as any);
				return tags?.multi_select?.some((tag: any) => tag.name === 'LIVE') ?? false;
			}
		};

		// Mock NotionAdapter
		mockNotionAdapter = {
			getTitleProperty: vi.fn(),
			getPropertyValues: vi.fn(),
			pageToMarkdown: vi.fn(),
			updateProperty: vi.fn()
		};

		// Mock PostRepository
		mockPostRepository = {
			getByNotionPageId: vi.fn(),
			getBySlug: vi.fn()
		};

		builder = new PostBuilder(mockConfig, mockNotionAdapter, mockPostRepository);
	});

	describe('buildPost', () => {
	it('should sync unpublished posts with null publish_at', async () => {
		const mockPage = {
			id: 'page-123',
			properties: {
				Tags: {
					type: 'multi_select',
					multi_select: [] // No LIVE tag
				}
			},
			last_edited_time: '2025-01-01T00:00:00Z'
		} as any;

		mockNotionAdapter.getTitleProperty.mockReturnValue('Test Post');

		const result = await builder.buildPost(mockPage);

		// Should still sync the post, but with null publish_at
		expect(result).not.toBeNull();
		expect(result?.publish_at).toBeNull();
		expect(result?.title).toBe('Test Post');
	});		it('should build post with auto-generated slug', async () => {
			const mockPage = {
				id: 'page-123',
				properties: {
					Tags: {
						type: 'multi_select',
						multi_select: [{ name: 'LIVE' }]
					}
				},
				last_edited_time: '2025-01-01T00:00:00Z',
				created_time: '2025-01-01T00:00:00Z'
			} as any;

			mockNotionAdapter.getTitleProperty.mockReturnValue('Test Post');
			mockNotionAdapter.getPropertyValues.mockReturnValue([]);
			mockNotionAdapter.pageToMarkdown.mockResolvedValue('# Test Post\n\nContent here');
			mockPostRepository.getByNotionPageId.mockResolvedValue(null); // New post
			mockPostRepository.getBySlug.mockResolvedValue(null); // No conflict

			const result = await builder.buildPost(mockPage);

			expect(result).not.toBeNull();
			expect(result?.slug).toBe('test-post');
			expect(result?.title).toBe('Test Post');
			expect(result?.content).toBe('# Test Post\n\nContent here');
			expect(result?.datasource_id).toBe('datasource-123');
		});

		it('should use custom slugRule if provided', async () => {
			mockConfig.slugRule = (page: PageObjectResponse) => {
				const slugProp = (page.properties.Slug as any)?.rich_text;
				return slugProp?.[0]?.plain_text || null;
			};

			builder = new PostBuilder(mockConfig, mockNotionAdapter, mockPostRepository);

			const mockPage = {
				id: 'page-123',
				properties: {
					Tags: {
						type: 'multi_select',
						multi_select: [{ name: 'LIVE' }]
					},
					Slug: {
						type: 'rich_text',
						rich_text: [{ plain_text: 'custom-slug' }]
					}
				},
				last_edited_time: '2025-01-01T00:00:00Z',
				created_time: '2025-01-01T00:00:00Z'
			} as any;

			mockNotionAdapter.getTitleProperty.mockReturnValue('Test Post');
			mockNotionAdapter.getPropertyValues.mockReturnValue([]);
			mockNotionAdapter.pageToMarkdown.mockResolvedValue('Content');
			mockPostRepository.getByNotionPageId.mockResolvedValue(null);
			mockPostRepository.getBySlug.mockResolvedValue(null);

			const result = await builder.buildPost(mockPage);

			expect(result?.slug).toBe('custom-slug');
		});

		it('should handle slug conflicts', async () => {
			const mockPage = {
				id: 'page-123',
				properties: {
					Tags: {
						type: 'multi_select',
						multi_select: [{ name: 'LIVE' }]
					}
				},
				last_edited_time: '2025-01-01T00:00:00Z',
				created_time: '2025-01-01T00:00:00Z'
			} as any;

			mockNotionAdapter.getTitleProperty.mockReturnValue('Test Post');
			mockNotionAdapter.getPropertyValues.mockReturnValue([]);
			mockNotionAdapter.pageToMarkdown.mockResolvedValue('Content');
			mockPostRepository.getByNotionPageId.mockResolvedValue(null); // New post
			
			// First check: conflict exists
			mockPostRepository.getBySlug
				.mockResolvedValueOnce({ slug: 'test-post', page_id: 'other-page' } as Post)
				.mockResolvedValueOnce(null); // Second check: test-post-2 available

			const result = await builder.buildPost(mockPage);

			expect(result?.slug).toBe('test-post-2');
		});

		it('should sync slug back to Notion if slugSyncProperty configured', async () => {
			mockConfig.slugSyncProperty = 'Slug';
			builder = new PostBuilder(mockConfig, mockNotionAdapter, mockPostRepository);

			const mockPage = {
				id: 'page-123',
				properties: {
					Tags: {
						type: 'multi_select',
						multi_select: [{ name: 'LIVE' }]
					}
				},
				last_edited_time: '2025-01-01T00:00:00Z',
				created_time: '2025-01-01T00:00:00Z'
			} as any;

			mockNotionAdapter.getTitleProperty.mockReturnValue('Test Post');
			mockNotionAdapter.getPropertyValues.mockReturnValue([]);
			mockNotionAdapter.pageToMarkdown.mockResolvedValue('Content');
			mockPostRepository.getByNotionPageId.mockResolvedValue(null);
			mockPostRepository.getBySlug.mockResolvedValue(null);

			await builder.buildPost(mockPage);

			expect(mockNotionAdapter.updateProperty).toHaveBeenCalledWith(
				'page-123',
				'Slug',
				'test-post'
			);
		});

		it('should extract tags property', async () => {
			mockConfig.tagsProperty = 'Tags';
			builder = new PostBuilder(mockConfig, mockNotionAdapter, mockPostRepository);

			const mockPage = {
				id: 'page-123',
				properties: {
					Tags: {
						type: 'multi_select',
						multi_select: [{ name: 'LIVE' }, { name: 'Tech' }]
					}
				},
				last_edited_time: '2025-01-01T00:00:00Z',
				created_time: '2025-01-01T00:00:00Z'
			} as any;

			mockNotionAdapter.getTitleProperty.mockReturnValue('Test Post');
			mockNotionAdapter.getPropertyValues.mockReturnValue(['LIVE', 'Tech']);
			mockNotionAdapter.pageToMarkdown.mockResolvedValue('Content');
			mockPostRepository.getByNotionPageId.mockResolvedValue(null);
			mockPostRepository.getBySlug.mockResolvedValue(null);

			const result = await builder.buildPost(mockPage);

			expect(result?.tags).toEqual(['LIVE', 'Tech']);
		});

		it('should extract authors property', async () => {
			mockConfig.authorsProperty = 'Authors';
			builder = new PostBuilder(mockConfig, mockNotionAdapter, mockPostRepository);

			const mockPage = {
				id: 'page-123',
				properties: {
					Tags: {
						type: 'multi_select',
						multi_select: [{ name: 'LIVE' }]
					},
					Authors: {
						type: 'people',
						people: [{ name: 'Alice' }, { name: 'Bob' }]
					}
				},
				last_edited_time: '2025-01-01T00:00:00Z',
				created_time: '2025-01-01T00:00:00Z'
			} as any;

			mockNotionAdapter.getTitleProperty.mockReturnValue('Test Post');
			
			// Only one call - for authors (tagsProperty not configured)
			mockNotionAdapter.getPropertyValues.mockReturnValue(['Alice', 'Bob']);
			
			mockNotionAdapter.pageToMarkdown.mockResolvedValue('Content');
			mockPostRepository.getByNotionPageId.mockResolvedValue(null);
			mockPostRepository.getBySlug.mockResolvedValue(null);

			const result = await builder.buildPost(mockPage);

			expect(result?.authors).toEqual(['Alice', 'Bob']);
		});

		it('should use publishDateRule if provided', async () => {
			mockConfig.publishDateRule = (page: PageObjectResponse) => {
				const dateProp = (page.properties.PublishDate as any)?.date;
				return dateProp?.start || page.created_time;
			};
			builder = new PostBuilder(mockConfig, mockNotionAdapter, mockPostRepository);

			const mockPage = {
				id: 'page-123',
				properties: {
					Tags: {
						type: 'multi_select',
						multi_select: [{ name: 'LIVE' }]
					},
					PublishDate: {
						type: 'date',
						date: { start: '2025-06-15T00:00:00Z' }
					}
				},
				last_edited_time: '2025-01-01T00:00:00Z',
				created_time: '2025-01-01T00:00:00Z'
			} as any;

			mockNotionAdapter.getTitleProperty.mockReturnValue('Test Post');
			mockNotionAdapter.getPropertyValues.mockReturnValue([]);
			mockNotionAdapter.pageToMarkdown.mockResolvedValue('Content');
			mockPostRepository.getByNotionPageId.mockResolvedValue(null);
			mockPostRepository.getBySlug.mockResolvedValue(null);

			const result = await builder.buildPost(mockPage);

			expect(result?.publish_at).toBe('2025-06-15T00:00:00Z');
		});

		it('should use metadataExtractor if provided', async () => {
			mockConfig.metadataExtractor = (page: PageObjectResponse) => ({
				customField: 'custom value',
				issueNumber: 42
			});
			builder = new PostBuilder(mockConfig, mockNotionAdapter, mockPostRepository);

			const mockPage = {
				id: 'page-123',
				properties: {
					Tags: {
						type: 'multi_select',
						multi_select: [{ name: 'LIVE' }]
					}
				},
				last_edited_time: '2025-01-01T00:00:00Z',
				created_time: '2025-01-01T00:00:00Z'
			} as any;

			mockNotionAdapter.getTitleProperty.mockReturnValue('Test Post');
			mockNotionAdapter.getPropertyValues.mockReturnValue([]);
			mockNotionAdapter.pageToMarkdown.mockResolvedValue('Content');
			mockPostRepository.getByNotionPageId.mockResolvedValue(null);
			mockPostRepository.getBySlug.mockResolvedValue(null);

			const result = await builder.buildPost(mockPage);

			expect(result?.meta).toEqual({
				customField: 'custom value',
				issueNumber: 42
			});
		});

		it('should keep existing slug for existing post', async () => {
			const mockPage = {
				id: 'page-123',
				properties: {
					Tags: {
						type: 'multi_select',
						multi_select: [{ name: 'LIVE' }]
					}
				},
				last_edited_time: '2025-01-01T00:00:00Z',
				created_time: '2025-01-01T00:00:00Z'
			} as any;

			const existingPost: Post = {
				sql_id: '123e4567-e89b-12d3-a456-426614174000',
				page_id: 'page-123',
				datasource_id: 'datasource-123',
				slug: 'existing-slug',
				title: 'Old Title',
				content: 'Old content',
				publish_at: '2025-01-01T00:00:00Z'
			};

			mockNotionAdapter.getTitleProperty.mockReturnValue('Updated Title');
			mockNotionAdapter.getPropertyValues.mockReturnValue([]);
			mockNotionAdapter.pageToMarkdown.mockResolvedValue('Updated content');
			mockPostRepository.getByNotionPageId.mockResolvedValue(existingPost);

			const result = await builder.buildPost(mockPage);

			expect(result?.slug).toBe('existing-slug'); // Keeps existing slug
			expect(result?.title).toBe('Updated Title'); // Updates title
		});
	});
});
