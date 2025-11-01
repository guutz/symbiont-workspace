/**
 * Tests for server-side GraphQL queries
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { getAllPosts, getPostBySlug } from './queries.js';
import type { Post } from '../types.js';

// Mock the dependencies
vi.mock('graphql-request', () => ({
	GraphQLClient: vi.fn().mockImplementation(() => ({
		request: vi.fn()
	})),
	gql: vi.fn((strings: TemplateStringsArray) => strings[0])
}));

vi.mock('./load-config.js', () => ({
	loadConfig: vi.fn().mockResolvedValue({
		graphqlEndpoint: 'https://test.nhost.io/v1/graphql',
		primaryShortDbId: 'test-db-id'
	})
}));

// Import after mocking
import { GraphQLClient } from 'graphql-request';
import { loadConfig } from './load-config.js';

describe('getPostBySlug', () => {
	let mockRequest: Mock;

	beforeEach(() => {
		vi.clearAllMocks();
		mockRequest = vi.fn();
		(GraphQLClient as any).mockImplementation(() => ({
			request: mockRequest
		}));
	});

	it('should fetch a post by slug', async () => {
		const mockPost: Post = {
			sql_id: '123e4567-e89b-12d3-a456-426614174000',
			title: 'Test Post',
			slug: 'test-post',
			content: 'Test content',
			publish_at: '2025-01-01T00:00:00Z',
			updated_at: '2025-01-01T00:00:00Z',
			tags: ['test'],
			features: {}
		};

		mockRequest.mockResolvedValue({ posts: [mockPost] });

		const result = await getPostBySlug('test-post');

		expect(result).toEqual(mockPost);
		expect(loadConfig).toHaveBeenCalled();
		expect(GraphQLClient).toHaveBeenCalledWith(
			'https://test.nhost.io/v1/graphql',
			{ fetch: undefined }
		);
		expect(mockRequest).toHaveBeenCalledWith(
			expect.any(String),
			{ slug: 'test-post' }
		);
	});

	it('should return null if post not found', async () => {
		mockRequest.mockResolvedValue({ posts: [] });

		const result = await getPostBySlug('non-existent');

		expect(result).toBeNull();
	});

	it('should use custom fetch function when provided', async () => {
		const customFetch = vi.fn();
		mockRequest.mockResolvedValue({ posts: [] });

		await getPostBySlug('test', { fetch: customFetch });

		expect(GraphQLClient).toHaveBeenCalledWith(
			'https://test.nhost.io/v1/graphql',
			{ fetch: customFetch }
		);
	});

	it('should handle posts with minimal fields', async () => {
		const minimalPost: Post = {
			sql_id: '223e4567-e89b-12d3-a456-426614174001',
			slug: 'minimal',
			title: null,
			content: null,
			publish_at: '2025-01-01T00:00:00Z'
		};

		mockRequest.mockResolvedValue({ posts: [minimalPost] });

		const result = await getPostBySlug('minimal');

		expect(result).toEqual(minimalPost);
	});
});

describe('getAllPosts', () => {
	let mockRequest: Mock;

	beforeEach(() => {
		vi.clearAllMocks();
		mockRequest = vi.fn();
		(GraphQLClient as any).mockImplementation(() => ({
			request: mockRequest
		}));
	});

	it('should fetch all posts with default options', async () => {
		const mockPosts: Post[] = [
			{
				sql_id: '123e4567-e89b-12d3-a456-426614174000',
				title: 'Post 1',
				slug: 'post-1',
				content: 'Content 1',
				publish_at: '2025-01-01T00:00:00Z'
			},
			{
				sql_id: '223e4567-e89b-12d3-a456-426614174001',
				title: 'Post 2',
				slug: 'post-2',
				content: 'Content 2',
				publish_at: '2025-01-02T00:00:00Z'
			}
		];

		mockRequest.mockResolvedValue({ posts: mockPosts });

		const result = await getAllPosts();

		expect(result).toEqual(mockPosts);
		expect(loadConfig).toHaveBeenCalled();
		expect(mockRequest).toHaveBeenCalledWith(
			expect.any(String),
			{
				limit: 100,
				offset: 0,
				dbNickname: 'test-db-id'
			}
		);
	});

	it('should respect custom limit and offset', async () => {
		mockRequest.mockResolvedValue({ posts: [] });

		await getAllPosts({ limit: 10, offset: 20 });

		expect(mockRequest).toHaveBeenCalledWith(
			expect.any(String),
			{
				limit: 10,
				offset: 20,
				dbNickname: 'test-db-id'
			}
		);
	});

	it('should use custom fetch function', async () => {
		const customFetch = vi.fn();
		mockRequest.mockResolvedValue({ posts: [] });

		await getAllPosts({ fetch: customFetch });

		expect(GraphQLClient).toHaveBeenCalledWith(
			'https://test.nhost.io/v1/graphql',
			{ fetch: customFetch }
		);
	});

	it('should allow overriding shortDbId', async () => {
		mockRequest.mockResolvedValue({ posts: [] });

		await getAllPosts({ shortDbId: 'custom-db-id' });

		expect(mockRequest).toHaveBeenCalledWith(
			expect.any(String),
			{
				limit: 100,
				offset: 0,
				dbNickname: 'custom-db-id'
			}
		);
	});

	it('should return empty array when no posts found', async () => {
		mockRequest.mockResolvedValue({ posts: [] });

		const result = await getAllPosts();

		expect(result).toEqual([]);
	});

	it('should handle posts with all optional fields', async () => {
		const fullPost: Post = {
			sql_id: '123e4567-e89b-12d3-a456-426614174000',
			title: 'Full Post',
			slug: 'full-post',
			content: 'Content here',
			summary: 'Summary here',
			description: 'Description here',
			publish_at: '2025-01-01T00:00:00Z',
			updated_at: '2025-01-02T00:00:00Z',
			tags: ['tag1', 'tag2'],
			features: {
				hasCodeBlocks: true,
				hasMath: false,
				hasMermaid: false
			},
			cover: 'https://example.com/image.jpg',
			language: 'en'
		};

		mockRequest.mockResolvedValue({ posts: [fullPost] });

		const result = await getAllPosts();

		expect(result).toEqual([fullPost]);
	});
});

describe('error handling', () => {
	let mockRequest: Mock;

	beforeEach(() => {
		vi.clearAllMocks();
		mockRequest = vi.fn();
		(GraphQLClient as any).mockImplementation(() => ({
			request: mockRequest
		}));
	});

	it('should propagate GraphQL errors', async () => {
		const error = new Error('GraphQL Error');
		mockRequest.mockRejectedValue(error);

		await expect(getPostBySlug('test')).rejects.toThrow('GraphQL Error');
	});

	it('should propagate config loading errors', async () => {
		const error = new Error('Config Error');
		(loadConfig as Mock).mockRejectedValueOnce(error);

		await expect(getAllPosts()).rejects.toThrow('Config Error');
	});
});
