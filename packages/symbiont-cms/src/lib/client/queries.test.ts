/**
 * Tests for public GraphQL queries
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';

// Mock the dependencies BEFORE importing queries
vi.mock('graphql-request', () => ({
	GraphQLClient: vi.fn().mockImplementation(() => ({
		request: vi.fn()
	})),
	gql: vi.fn((strings: TemplateStringsArray) => strings[0])
}));

vi.mock('./load-config.js', () => ({
	loadConfig: vi.fn().mockReturnValue({
		graphqlEndpoint: 'https://test.nhost.io/v1/graphql',
		aliases: ['test-blog', 'test-docs']
	})
}));

// Import after mocking
import { getAllPosts, getPostBySlug } from './queries.js';
import type { Post } from '../types.js';
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

		mockRequest.mockResolvedValue({ pages: [mockPost] });

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
		mockRequest.mockResolvedValue({ pages: [] });

		const result = await getPostBySlug('non-existent');

		expect(result).toBeNull();
	});

	it('should use custom fetch function when provided', async () => {
		const customFetch = vi.fn();
		mockRequest.mockResolvedValue({ pages: [] });

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

		mockRequest.mockResolvedValue({ pages: [minimalPost] });

		const result = await getPostBySlug('minimal-post');

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

		mockRequest.mockResolvedValue({ pages: mockPosts });

		const result = await getAllPosts();

		expect(result).toEqual(mockPosts);
		expect(loadConfig).toHaveBeenCalled();
		expect(mockRequest).toHaveBeenCalledWith(
			expect.any(String),
			{
				limit: 100,
				offset: 0,
				alias: 'test-blog'
			}
		);
	});

	it('should respect custom limit and offset', async () => {
		mockRequest.mockResolvedValue({ pages: [] });

		await getAllPosts({ limit: 5, offset: 10 });

		expect(mockRequest).toHaveBeenCalledWith(
			expect.any(String),
			{
				limit: 5,
				offset: 10,
				alias: 'test-blog'
			}
		);
	});

	it('should use custom fetch function', async () => {
		const customFetch = vi.fn();
		mockRequest.mockResolvedValue({ pages: [] });

		await getAllPosts({ fetch: customFetch });

		expect(GraphQLClient).toHaveBeenCalledWith(
			'https://test.nhost.io/v1/graphql',
			{ fetch: customFetch }
		);
	});

	it('should allow overriding alias', async () => {
		mockRequest.mockResolvedValue({ pages: [] });

		await getAllPosts({ alias: 'custom-alias' });

		expect(mockRequest).toHaveBeenCalledWith(
			expect.any(String),
			{
				limit: 100,
				offset: 0,
				alias: 'custom-alias'
			}
		);
	});

	it('should return empty array when no posts found', async () => {
		mockRequest.mockResolvedValue({ pages: [] });

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

		mockRequest.mockResolvedValue({ pages: [fullPost] });

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
