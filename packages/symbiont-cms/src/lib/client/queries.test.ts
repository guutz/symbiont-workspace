/**
 * Tests for client GraphQL query functions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GraphQLClient } from 'graphql-request';
import {
	createSymbiontGraphQLClient,
	getPostBySlug,
	getAllPosts,
	GET_POST_BY_SLUG,
	GET_ALL_POSTS
} from './queries.js';
import type { Post } from '../types.js';

describe('client queries', () => {
	describe('createSymbiontGraphQLClient', () => {
		it('should create a GraphQL client with endpoint', () => {
			const client = createSymbiontGraphQLClient('http://localhost:8080/v1/graphql');
			expect(client).toBeInstanceOf(GraphQLClient);
		});

		it('should accept custom headers', () => {
			const client = createSymbiontGraphQLClient('http://localhost:8080/v1/graphql', {
				headers: { 'x-custom-header': 'test' }
			});
			expect(client).toBeInstanceOf(GraphQLClient);
		});

		it('should accept custom fetch function', () => {
			const customFetch = vi.fn();
			const client = createSymbiontGraphQLClient('http://localhost:8080/v1/graphql', {
				fetch: customFetch as any
			});
			expect(client).toBeInstanceOf(GraphQLClient);
		});
	});

	describe('getPostBySlug', () => {
		it('should return post when found', async () => {
			const mockPost: Post = {
				sql_id: 'post-1',
				title: 'Test Post',
				slug: 'test-post',
				content: '# Hello World',
				publish_at: '2025-01-01',
				tags: ['test'],
				updated_at: '2025-01-01T12:00:00Z'
			};

			const mockClient = {
				request: vi.fn().mockResolvedValue({ posts: [mockPost] })
			} as any;

			const result = await getPostBySlug(mockClient, 'test-post');

			expect(mockClient.request).toHaveBeenCalledWith(GET_POST_BY_SLUG, { slug: 'test-post' });
			expect(result).toEqual(mockPost);
		});

		it('should return null when post not found', async () => {
			const mockClient = {
				request: vi.fn().mockResolvedValue({ posts: [] })
			} as any;

			const result = await getPostBySlug(mockClient, 'nonexistent');

			expect(mockClient.request).toHaveBeenCalledWith(GET_POST_BY_SLUG, { slug: 'nonexistent' });
			expect(result).toBeNull();
		});

		it('should handle errors from GraphQL', async () => {
			const mockClient = {
				request: vi.fn().mockRejectedValue(new Error('GraphQL Error'))
			} as any;

			await expect(getPostBySlug(mockClient, 'test')).rejects.toThrow('GraphQL Error');
		});
	});

	describe('getAllPosts', () => {
		it('should fetch all posts with default options', async () => {
			const mockPosts: Post[] = [
				{
					sql_id: 'post-1',
					title: 'First Post',
					slug: 'first-post',
					content: 'Content 1',
					publish_at: '2025-01-01',
					tags: ['test'],
					updated_at: '2025-01-01T12:00:00Z'
				},
				{
					sql_id: 'post-2',
					title: 'Second Post',
					slug: 'second-post',
					content: 'Content 2',
					publish_at: '2025-01-02',
					tags: ['tutorial'],
					updated_at: '2025-01-02T12:00:00Z'
				}
			];

			const mockClient = {
				request: vi.fn().mockResolvedValue({ posts: mockPosts })
			} as any;

			const result = await getAllPosts(mockClient, {
				short_db_ID: 'test-blog'
			});

			expect(mockClient.request).toHaveBeenCalledWith(GET_ALL_POSTS, {
				limit: undefined,
				offset: undefined,
				short_db_ID: 'test-blog'
			});
			expect(result).toEqual(mockPosts);
			expect(result).toHaveLength(2);
		});

		it('should apply limit and offset', async () => {
			const mockClient = {
				request: vi.fn().mockResolvedValue({ posts: [] })
			} as any;

			await getAllPosts(mockClient, {
				short_db_ID: 'test-blog',
				limit: 10,
				offset: 5
			});

			expect(mockClient.request).toHaveBeenCalledWith(GET_ALL_POSTS, {
				limit: 10,
				offset: 5,
				short_db_ID: 'test-blog'
			});
		});

		it('should return empty array when no posts', async () => {
			const mockClient = {
				request: vi.fn().mockResolvedValue({ posts: [] })
			} as any;

			const result = await getAllPosts(mockClient, {
				short_db_ID: 'empty-blog'
			});

			expect(result).toEqual([]);
		});

		it('should handle GraphQL errors', async () => {
			const mockClient = {
				request: vi.fn().mockRejectedValue(new Error('Network Error'))
			} as any;

			await expect(
				getAllPosts(mockClient, { short_db_ID: 'test' })
			).rejects.toThrow('Network Error');
		});

		it('should handle large pagination', async () => {
			const mockClient = {
				request: vi.fn().mockResolvedValue({ posts: [] })
			} as any;

			await getAllPosts(mockClient, {
				short_db_ID: 'test-blog',
				limit: 100,
				offset: 200
			});

			expect(mockClient.request).toHaveBeenCalledWith(GET_ALL_POSTS, {
				limit: 100,
				offset: 200,
				short_db_ID: 'test-blog'
			});
		});
	});

	describe('query shape validation', () => {
		it('GET_POST_BY_SLUG should have correct shape', () => {
			const query = GET_POST_BY_SLUG;
			expect(query).toContain('query GetPostBySlug');
			expect(query).toContain('$slug: String!');
			expect(query).toContain('posts(where: { slug: { _eq: $slug } })');
			expect(query).toContain('id');
			expect(query).toContain('title');
			expect(query).toContain('content');
		});

		it('GET_ALL_POSTS should have correct shape', () => {
			const query = GET_ALL_POSTS;
			expect(query).toContain('query GetAllPosts');
			expect(query).toContain('$limit: Int');
			expect(query).toContain('$offset: Int');
			expect(query).toContain('$short_db_ID: String!');
			expect(query).toContain('source_id: { _eq: $short_db_ID }');
			expect(query).toContain('order_by: { publish_at: desc }');
		});
	});

	describe('edge cases', () => {
		it('should handle posts with no tags', async () => {
			const mockPost: Post = {
				sql_id: 'post-1',
				title: 'No Tags Post',
				slug: 'no-tags',
				content: 'Content',
				publish_at: '2025-01-01',
				tags: [],
				updated_at: '2025-01-01T12:00:00Z'
			};

			const mockClient = {
				request: vi.fn().mockResolvedValue({ posts: [mockPost] })
			} as any;

			const result = await getPostBySlug(mockClient, 'no-tags');
			expect(result?.tags).toEqual([]);
		});

		it('should handle posts with null publish_at', async () => {
			const mockPost: Partial<Post> = {
				sql_id: 'draft-1',
				title: 'Draft Post',
				slug: 'draft',
				content: 'Draft content',
				publish_at: null as any,
				tags: ['draft'],
				updated_at: '2025-01-01T12:00:00Z'
			};

			const mockClient = {
				request: vi.fn().mockResolvedValue({ posts: [mockPost] })
			} as any;

			const result = await getPostBySlug(mockClient, 'draft');
			expect(result?.publish_at).toBeNull();
		});

		it('should handle very long content', async () => {
			const longContent = 'x'.repeat(100000);
			const mockPost: Post = {
				sql_id: 'long-1',
				title: 'Long Post',
				slug: 'long',
				content: longContent,
				publish_at: '2025-01-01',
				tags: [],
				updated_at: '2025-01-01T12:00:00Z'
			};

			const mockClient = {
				request: vi.fn().mockResolvedValue({ posts: [mockPost] })
			} as any;

			const result = await getPostBySlug(mockClient, 'long');
			expect(result?.content).toHaveLength(100000);
		});
	});
});
