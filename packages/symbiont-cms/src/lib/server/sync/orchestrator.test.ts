/**
 * Tests for SyncOrchestrator - High-level sync coordination
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import type { PageObjectResponse } from '@notionhq/client';
import { SyncOrchestrator } from './orchestrator.js';
import { NotionAdapter } from '../notion/adapter.js';
import { PostBuilder } from './post-builder.js';
import { PostRepository, type PostData } from './post-repository.js';
import type { DatabaseBlueprint } from '../../types.js';

describe('SyncOrchestrator', () => {
	let mockNotionAdapter: any;
	let mockPostBuilder: any;
	let mockPostRepository: any;
	let orchestrator: SyncOrchestrator;
	let mockConfig: DatabaseBlueprint;

	beforeEach(() => {
		vi.clearAllMocks();

		mockConfig = {
			alias: 'test-blog',
			dataSourceId: 'datasource-123',
			notionToken: 'secret_test_token',
			isPublicRule: () => true
		};

		// Mock NotionAdapter
		mockNotionAdapter = {
			queryDataSource: vi.fn()
		};

		// Mock PostBuilder
		mockPostBuilder = {
			buildPost: vi.fn()
		};

		// Mock PostRepository
		mockPostRepository = {
			upsert: vi.fn(),
			deleteForSource: vi.fn()
		};

		orchestrator = new SyncOrchestrator(
			mockNotionAdapter,
			mockPostBuilder,
			mockPostRepository,
			mockConfig
		);
	});

	describe('syncDataSource', () => {
		it('should sync all pages successfully', async () => {
			const mockPages: PageObjectResponse[] = [
				{ id: 'page-1', properties: {} } as any,
				{ id: 'page-2', properties: {} } as any,
				{ id: 'page-3', properties: {} } as any
			];

			const mockPostData: PostData = {
				page_id: 'page-1',
				datasource_id: 'datasource-123',
				title: 'Test',
				slug: 'test',
				content: 'Content',
				publish_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z',
				tags: null,
				authors: null,
				meta: null
			};

			mockNotionAdapter.queryDataSource.mockResolvedValue({
				pages: mockPages,
				nextCursor: null
			});

			mockPostBuilder.buildPost.mockResolvedValue(mockPostData);
			mockPostRepository.upsert.mockResolvedValue(undefined);

			const result = await orchestrator.syncDataSource();

			expect(result.alias).toBe('test-blog');
			expect(result.dataSourceId).toBe('datasource-123');
			expect(result.processed).toBe(3);
			expect(result.skipped).toBe(0);
			expect(result.failed).toBe(0);
			expect(result.status).toBe('success');
		});

		it('should handle pagination', async () => {
			const mockPages1: PageObjectResponse[] = [
				{ id: 'page-1', properties: {} } as any,
				{ id: 'page-2', properties: {} } as any
			];

			const mockPages2: PageObjectResponse[] = [
				{ id: 'page-3', properties: {} } as any
			];

			mockNotionAdapter.queryDataSource
				.mockResolvedValueOnce({
					pages: mockPages1,
					nextCursor: 'cursor-123'
				})
				.mockResolvedValueOnce({
					pages: mockPages2,
					nextCursor: null
				});

			mockPostBuilder.buildPost.mockResolvedValue({
				page_id: 'test',
				datasource_id: 'datasource-123',
				title: 'Test',
				slug: 'test',
				content: 'Content',
				publish_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z',
				tags: null,
				authors: null,
				meta: null
			});

			const result = await orchestrator.syncDataSource();

			expect(result.processed).toBe(3);
			expect(mockNotionAdapter.queryDataSource).toHaveBeenCalledTimes(2);
		});

		it('should skip unpublishable pages', async () => {
			const mockPages: PageObjectResponse[] = [
				{ id: 'page-1', properties: {} } as any,
				{ id: 'page-2', properties: {} } as any,
				{ id: 'page-3', properties: {} } as any
			];

			mockNotionAdapter.queryDataSource.mockResolvedValue({
				pages: mockPages,
				nextCursor: null
			});

			// First page is publishable, others are not
			mockPostBuilder.buildPost
				.mockResolvedValueOnce({
					page_id: 'page-1',
					datasource_id: 'datasource-123',
					title: 'Test',
					slug: 'test',
					content: 'Content',
					publish_at: '2025-01-01T00:00:00Z',
					updated_at: '2025-01-01T00:00:00Z',
					tags: null,
					authors: null,
					meta: null
				})
				.mockResolvedValueOnce(null)
				.mockResolvedValueOnce(null);

			const result = await orchestrator.syncDataSource();

			expect(result.processed).toBe(1);
			expect(result.skipped).toBe(2);
		});

		it('should handle individual page failures', async () => {
			const mockPages: PageObjectResponse[] = [
				{ id: 'page-1', properties: {} } as any,
				{ id: 'page-2', properties: {} } as any,
				{ id: 'page-3', properties: {} } as any
			];

			mockNotionAdapter.queryDataSource.mockResolvedValue({
				pages: mockPages,
				nextCursor: null
			});

			mockPostBuilder.buildPost
				.mockResolvedValueOnce({
					page_id: 'page-1',
					datasource_id: 'datasource-123',
					title: 'Test',
					slug: 'test',
					content: 'Content',
					publish_at: '2025-01-01T00:00:00Z',
					updated_at: '2025-01-01T00:00:00Z',
					tags: null,
					authors: null,
					meta: null
				})
				.mockRejectedValueOnce(new Error('Build failed'))
				.mockResolvedValueOnce({
					page_id: 'page-3',
					datasource_id: 'datasource-123',
					title: 'Test',
					slug: 'test-3',
					content: 'Content',
					publish_at: '2025-01-01T00:00:00Z',
					updated_at: '2025-01-01T00:00:00Z',
					tags: null,
					authors: null,
					meta: null
				});

			const result = await orchestrator.syncDataSource();

			expect(result.processed).toBe(2);
			expect(result.failed).toBe(1);
			expect(result.status).toBe('success'); // Still succeeds even with failures
		});

		it('should wipe existing posts when wipe option is true', async () => {
			mockPostRepository.deleteForSource.mockResolvedValue(5);

			mockNotionAdapter.queryDataSource.mockResolvedValue({
				pages: [],
				nextCursor: null
			});

			await orchestrator.syncDataSource({ wipe: true });

			expect(mockPostRepository.deleteForSource).toHaveBeenCalledWith('datasource-123');
		});

		it('should not filter when syncAll is false without since', async () => {
			mockNotionAdapter.queryDataSource.mockResolvedValue({
				pages: [],
				nextCursor: null
			});

			await orchestrator.syncDataSource({ syncAll: false });

			// When syncAll is false but no 'since' provided, no filter is applied
			expect(mockNotionAdapter.queryDataSource).toHaveBeenCalledWith(
				'datasource-123',
				undefined,
				undefined
			);
		});

		it('should not filter when syncAll is true', async () => {
			mockNotionAdapter.queryDataSource.mockResolvedValue({
				pages: [],
				nextCursor: null
			});

			await orchestrator.syncDataSource({ syncAll: true });

			expect(mockNotionAdapter.queryDataSource).toHaveBeenCalledWith(
				'datasource-123',
				undefined,
				undefined
			);
		});
	});

	describe('processPage', () => {
		it('should process a single page successfully', async () => {
			const mockPage = {
				id: 'page-123',
				properties: {}
			} as any;

			const mockPostData: PostData = {
				page_id: 'page-123',
				datasource_id: 'datasource-123',
				title: 'Test',
				slug: 'test',
				content: 'Content',
				publish_at: '2025-01-01T00:00:00Z',
				updated_at: '2025-01-01T00:00:00Z',
				tags: null,
				authors: null,
				meta: null
			};

			mockPostBuilder.buildPost.mockResolvedValue(mockPostData);
			mockPostRepository.upsert.mockResolvedValue(undefined);

			const result = await orchestrator.processPage(mockPage);

			expect(result).toBe(true);
			expect(mockPostBuilder.buildPost).toHaveBeenCalledWith(mockPage);
			expect(mockPostRepository.upsert).toHaveBeenCalledWith(mockPostData);
		});

		it('should return false if page is not publishable', async () => {
			const mockPage = {
				id: 'page-123',
				properties: {}
			} as any;

			mockPostBuilder.buildPost.mockResolvedValue(null);

			const result = await orchestrator.processPage(mockPage);

			expect(result).toBe(false);
			expect(mockPostRepository.upsert).not.toHaveBeenCalled();
		});

		it('should throw error if processing fails', async () => {
			const mockPage = {
				id: 'page-123',
				properties: {}
			} as any;

			mockPostBuilder.buildPost.mockRejectedValue(new Error('Processing failed'));

			await expect(orchestrator.processPage(mockPage)).rejects.toThrow('Processing failed');
		});
	});

	describe('error handling', () => {
		it('should mark sync as failed if query fails', async () => {
			mockNotionAdapter.queryDataSource.mockRejectedValue(new Error('Query failed'));

			const result = await orchestrator.syncDataSource();

			expect(result.status).toBe('error');
			expect(result.processed).toBe(0);
		});

		it('should track failed pages', async () => {
			const mockPages: PageObjectResponse[] = [
				{ id: 'page-1', properties: {} } as any,
				{ id: 'page-2', properties: {} } as any
			];

			mockNotionAdapter.queryDataSource.mockResolvedValue({
				pages: mockPages,
				nextCursor: null
			});

			mockPostBuilder.buildPost
				.mockRejectedValueOnce(new Error('Error 1'))
				.mockRejectedValueOnce(new Error('Error 2'));

			const result = await orchestrator.syncDataSource();

			expect(result.failed).toBe(2);
		});
	});

	describe('metrics', () => {
		it('should track duration', async () => {
			mockNotionAdapter.queryDataSource.mockResolvedValue({
				pages: [],
				nextCursor: null
			});

			const result = await orchestrator.syncDataSource();

			expect(result.duration_ms).toBeGreaterThanOrEqual(0);
		});
	});
});
