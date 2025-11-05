/**
 * Tests for PostRepository - Database operations via GraphQL
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { GraphQLClient } from 'graphql-request';
import { PostRepository, type PostData } from './post-repository.js';
import type { Post } from '../../types.js';

// Mock graphql-request
vi.mock('graphql-request', () => ({
	GraphQLClient: vi.fn(),
	gql: vi.fn((strings: TemplateStringsArray) => strings[0])
}));

describe('PostRepository', () => {
	let mockGqlClient: any;
	let repository: PostRepository;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock GraphQL client
		mockGqlClient = {
			request: vi.fn()
		};

		repository = new PostRepository(mockGqlClient);
	});

	describe('getByNotionPageId', () => {
		it('should fetch post by notion page ID', async () => {
			const mockPost: Post = {
				sql_id: '123e4567-e89b-12d3-a456-426614174000',
				page_id: 'notion-page-123',
				datasource_id: 'datasource-abc',
				title: 'Test Post',
				slug: 'test-post',
				content: 'Content here',
				publish_at: '2025-01-01T00:00:00Z'
			};

			mockGqlClient.request.mockResolvedValue({ pages: [mockPost] });

			const result = await repository.getByNotionPageId('notion-page-123', 'datasource-abc');

			expect(result).toEqual(mockPost);
			expect(mockGqlClient.request).toHaveBeenCalledWith(
				expect.any(String),
				{ datasourceId: 'datasource-abc', pageId: 'notion-page-123' }
			);
		});

		it('should return null if post not found', async () => {
			mockGqlClient.request.mockResolvedValue({ pages: [] });

			const result = await repository.getByNotionPageId('non-existent', 'datasource-abc');

			expect(result).toBeNull();
		});

		it('should handle GraphQL errors', async () => {
			mockGqlClient.request.mockRejectedValue(new Error('GraphQL Error'));

			await expect(
				repository.getByNotionPageId('page-123', 'datasource-abc')
			).rejects.toThrow('GraphQL Error');
		});
	});

	describe('getBySlug', () => {
		it('should fetch post by slug', async () => {
			const mockPost: Post = {
				sql_id: '123e4567-e89b-12d3-a456-426614174000',
				page_id: 'notion-page-123',
				datasource_id: 'datasource-abc',
				title: 'Test Post',
				slug: 'test-post',
				content: 'Content here',
				publish_at: '2025-01-01T00:00:00Z'
			};

			mockGqlClient.request.mockResolvedValue({ pages: [mockPost] });

			const result = await repository.getBySlug('test-post', 'datasource-abc');

			expect(result).toEqual(mockPost);
			expect(mockGqlClient.request).toHaveBeenCalledWith(
				expect.any(String),
				{ datasourceId: 'datasource-abc', slug: 'test-post' }
			);
		});

		it('should return null if post not found', async () => {
			mockGqlClient.request.mockResolvedValue({ pages: [] });

			const result = await repository.getBySlug('non-existent', 'datasource-abc');

			expect(result).toBeNull();
		});
	});

	describe('getAllForSource', () => {
		it('should fetch all posts for a datasource', async () => {
			const mockPosts: Post[] = [
				{
					sql_id: '123e4567-e89b-12d3-a456-426614174000',
					page_id: 'notion-page-1',
					datasource_id: 'datasource-abc',
					title: 'Post 1',
					slug: 'post-1',
					content: 'Content 1',
					publish_at: '2025-01-01T00:00:00Z'
				},
				{
					sql_id: '223e4567-e89b-12d3-a456-426614174001',
					page_id: 'notion-page-2',
					datasource_id: 'datasource-abc',
					title: 'Post 2',
					slug: 'post-2',
					content: 'Content 2',
					publish_at: '2025-01-02T00:00:00Z'
				}
			];

			mockGqlClient.request.mockResolvedValue({ pages: mockPosts });

			const result = await repository.getAllForSource('datasource-abc');

			expect(result).toEqual(mockPosts);
			expect(mockGqlClient.request).toHaveBeenCalledWith(
				expect.any(String),
				{ datasourceId: 'datasource-abc' }
			);
		});

		it('should return empty array if no posts found', async () => {
			mockGqlClient.request.mockResolvedValue({ pages: [] });

			const result = await repository.getAllForSource('datasource-abc');

			expect(result).toEqual([]);
		});
	});

	describe('upsert', () => {
		it('should insert new post', async () => {
			const postData: PostData = {
				page_id: 'notion-page-123',
				datasource_id: 'datasource-abc',
				title: 'New Post',
				slug: 'new-post',
				content: 'Content here',
				publish_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z',
				tags: ['tag1', 'tag2'],
				authors: null,
				meta: null
			};

			mockGqlClient.request.mockResolvedValue({
				insert_pages_one: { sql_id: '123e4567-e89b-12d3-a456-426614174000' }
			});

			await repository.upsert(postData);

			expect(mockGqlClient.request).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					page: expect.objectContaining({
						page_id: 'notion-page-123',
						datasource_id: 'datasource-abc',
						title: 'New Post',
						slug: 'new-post'
					})
				})
			);
		});

		it('should update existing post', async () => {
			const postData: PostData = {
				page_id: 'notion-page-123',
				datasource_id: 'datasource-abc',
				title: 'Updated Post',
				slug: 'updated-post',
				content: 'Updated content',
				publish_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-02T00:00:00Z',
				tags: ['tag1'],
				authors: ['Author1'],
				meta: { custom: 'data' }
			};

			mockGqlClient.request.mockResolvedValue({
				insert_pages_one: { sql_id: '123e4567-e89b-12d3-a456-426614174000' }
			});

			await repository.upsert(postData);

			expect(mockGqlClient.request).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({
					page: expect.objectContaining({
						page_id: 'notion-page-123',
						datasource_id: 'datasource-abc',
						title: 'Updated Post',
						slug: 'updated-post',
						meta: { custom: 'data' }
					})
				})
			);
		});

		it('should handle upsert errors', async () => {
			const postData: PostData = {
				page_id: 'notion-page-123',
				datasource_id: 'datasource-abc',
				title: 'Test',
				slug: 'test',
				content: 'test',
				publish_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z',
				tags: null,
				authors: null,
				meta: null
			};

			mockGqlClient.request.mockRejectedValue(new Error('Upsert failed'));

			await expect(repository.upsert(postData)).rejects.toThrow('Upsert failed');
		});
	});

	describe('deleteForSource', () => {
		it('should delete all posts for a datasource', async () => {
			mockGqlClient.request.mockResolvedValue({
				delete_pages: { affected_rows: 5 }
			});

			const result = await repository.deleteForSource('datasource-abc');

			expect(result).toBe(5);
			expect(mockGqlClient.request).toHaveBeenCalledWith(
				expect.any(String),
				{ datasourceId: 'datasource-abc' }
			);
		});

		it('should return 0 if no posts deleted', async () => {
			mockGqlClient.request.mockResolvedValue({
				delete_pages: { affected_rows: 0 }
			});

			const result = await repository.deleteForSource('datasource-abc');

			expect(result).toBe(0);
		});

		it('should handle delete errors', async () => {
			mockGqlClient.request.mockRejectedValue(new Error('Delete failed'));

			await expect(repository.deleteForSource('datasource-abc')).rejects.toThrow(
				'Delete failed'
			);
		});
	});

	describe('edge cases', () => {
		it('should handle posts with all optional fields', async () => {
			const fullPost: Post = {
				sql_id: '123e4567-e89b-12d3-a456-426614174000',
				page_id: 'notion-page-123',
				datasource_id: 'datasource-abc',
				title: 'Full Post',
				slug: 'full-post',
				content: 'Content here',
				summary: 'Summary here',
				description: 'Description here',
				publish_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-02T00:00:00Z',
				tags: ['tag1', 'tag2'],
				authors: ['Author1', 'Author2'],
				meta: { custom: 'data' },
				cover: 'https://example.com/image.jpg',
				language: 'en'
			};

			mockGqlClient.request.mockResolvedValue({ pages: [fullPost] });

			const result = await repository.getBySlug('full-post', 'datasource-abc');

			expect(result).toEqual(fullPost);
		});

		it('should handle posts with null optional fields', async () => {
			const minimalPost: Post = {
				sql_id: '123e4567-e89b-12d3-a456-426614174000',
				page_id: 'notion-page-123',
				datasource_id: 'datasource-abc',
				title: null,
				slug: 'minimal',
				content: null,
				publish_at: '2025-01-01T00:00:00Z'
			};

			mockGqlClient.request.mockResolvedValue({ pages: [minimalPost] });

			const result = await repository.getBySlug('minimal', 'datasource-abc');

			expect(result).toEqual(minimalPost);
		});
	});
});
