/**
 * Integration tests for page processor orchestration
 * Tests the coordination logic between Notion, GraphQL, and slug generation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processPageBatch, processPageWebhook } from './page-processor.js';
import type { PageObjectResponse } from '@notionhq/client';
import type { HydratedDatabaseConfig } from '../types.js';
import { createMockNotionPage } from '../../__tests__/utils.js';

// Mock all external dependencies
vi.mock('./notion.js', () => ({
	pageToMarkdown: vi.fn().mockResolvedValue('# Mock Markdown Content'),
	syncSlugToNotion: vi.fn().mockResolvedValue(undefined)
}));

vi.mock('./graphql.js', () => ({
	gqlAdminClient: {
		request: vi.fn()
	},
	UPSERT_POST_MUTATION: 'MOCK_UPSERT_MUTATION',
	CHECK_SLUG_QUERY: 'MOCK_CHECK_SLUG_QUERY'
}));

// Import mocked modules
import { pageToMarkdown, syncSlugToNotion } from './notion.js';
import { gqlAdminClient } from './graphql.js';

describe('page-processor', () => {
	const mockConfig: HydratedDatabaseConfig = {
		short_db_ID: 'test-blog',
		notionDatabaseId: 'test-notion-db',
		isPublicRule: () => true,
		sourceOfTruthRule: () => 'NOTION' as const,
		slugRule: (page: PageObjectResponse) => {
			const prop = page.properties['Website Slug'];
			if (prop?.type === 'rich_text') {
				return prop.rich_text?.[0]?.plain_text?.trim() || null;
			}
			return null;
		}
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Default mock implementations
		vi.mocked(pageToMarkdown).mockResolvedValue('# Mock Markdown');
		vi.mocked(syncSlugToNotion).mockResolvedValue(undefined);
		vi.mocked(gqlAdminClient.request).mockResolvedValue({});
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe('processPageBatch', () => {
		describe('new posts', () => {
			it('should create new post with custom slug from Notion', async () => {
				const page = createMockNotionPage({
					id: 'page-123',
					properties: {
						Name: {
							id: 'title',
							type: 'title',
							title: [{
								type: 'text',
								text: { content: 'My Post', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'My Post',
								href: null
							}]
						},
						'Website Slug': {
							id: 'slug',
							type: 'rich_text',
							rich_text: [{
								type: 'text',
								text: { content: 'custom-slug', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'custom-slug',
								href: null
							}]
						},
						Status: {
							id: 'status',
							type: 'select',
							select: { id: 'pub', name: 'Published', color: 'green' }
						}
					}
				});

				const existingPosts = new Map();
				const usedSlugs = new Set<string>();

				await processPageBatch(page, mockConfig, existingPosts, usedSlugs);

				// Should fetch markdown
				expect(pageToMarkdown).toHaveBeenCalledWith('page-123');

				// Should sync slug back to Notion
				expect(syncSlugToNotion).toHaveBeenCalledWith(page, 'test-notion-db', 'custom-slug');

				// Should upsert with custom slug
				expect(gqlAdminClient.request).toHaveBeenCalledWith(
					'MOCK_UPSERT_MUTATION',
					expect.objectContaining({
						post: expect.objectContaining({
							slug: 'custom-slug',
							notion_page_id: 'page-123',
							source_id: 'test-blog',
							title: 'My Post'
						})
					})
				);

				// Should add slug to usedSlugs
				expect(usedSlugs.has('custom-slug')).toBe(true);
			});

			it('should generate slug from title when no custom slug', async () => {
				const page = createMockNotionPage({
					id: 'page-456',
					properties: {
						Name: {
							id: 'title',
							type: 'title',
							title: [{
								type: 'text',
								text: { content: 'Hello World', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'Hello World',
								href: null
							}]
						},
						Status: {
							id: 'status',
							type: 'select',
							select: { id: 'pub', name: 'Published', color: 'green' }
						}
					}
				});

				const existingPosts = new Map();
				const usedSlugs = new Set<string>();

				await processPageBatch(page, mockConfig, existingPosts, usedSlugs);

				// Should generate slug 'hello-world' from title
				expect(syncSlugToNotion).toHaveBeenCalledWith(page, 'test-notion-db', 'hello-world');
				expect(gqlAdminClient.request).toHaveBeenCalledWith(
					'MOCK_UPSERT_MUTATION',
					expect.objectContaining({
						post: expect.objectContaining({
							slug: 'hello-world'
						})
					})
				);
			});

			it('should handle slug conflicts with numbered suffix', async () => {
				const page = createMockNotionPage({
					id: 'page-789',
					properties: {
						Name: {
							id: 'title',
							type: 'title',
							title: [{
								type: 'text',
								text: { content: 'Conflict Post', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'Conflict Post',
								href: null
							}]
						},
						Status: {
							id: 'status',
							type: 'select',
							select: { id: 'pub', name: 'Published', color: 'green' }
						}
					}
				});

				const existingPosts = new Map();
				const usedSlugs = new Set(['conflict-post', 'conflict-post-2']);

				await processPageBatch(page, mockConfig, existingPosts, usedSlugs);

				// Should generate 'conflict-post-3'
				expect(syncSlugToNotion).toHaveBeenCalledWith(page, 'test-notion-db', 'conflict-post-3');
				expect(usedSlugs.has('conflict-post-3')).toBe(true);
			});

			it('should use short ID for conflicts when available', async () => {
				const page = createMockNotionPage({
					id: 'page-with-id',
					properties: {
						Name: {
							id: 'title',
							type: 'title',
							title: [{
								type: 'text',
								text: { content: 'Test', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'Test',
								href: null
							}]
						},
						ID: {
							id: 'id',
							type: 'unique_id',
							unique_id: {
								prefix: 'POST',
								number: 42
							}
						},
						Status: {
							id: 'status',
							type: 'select',
							select: { id: 'pub', name: 'Published', color: 'green' }
						}
					}
				} as any);

				const existingPosts = new Map();
				const usedSlugs = new Set(['test']);

				await processPageBatch(page, mockConfig, existingPosts, usedSlugs);

				// Should use 'test-post-42' (slug-shortid)
				expect(syncSlugToNotion).toHaveBeenCalledWith(page, 'test-notion-db', 'test-post-42');
			});
		});

		describe('updating existing posts', () => {
			it('should keep existing slug when Notion slug unchanged', async () => {
				const page = createMockNotionPage({
					id: 'existing-page',
					properties: {
						Name: {
							id: 'title',
							type: 'title',
							title: [{
								type: 'text',
								text: { content: 'Updated Title', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'Updated Title',
								href: null
							}]
						},
						'Website Slug': {
							id: 'slug',
							type: 'rich_text',
							rich_text: [{
								type: 'text',
								text: { content: 'original-slug', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'original-slug',
								href: null
							}]
						},
						Status: {
							id: 'status',
							type: 'select',
							select: { id: 'pub', name: 'Published', color: 'green' }
						}
					}
				});

				const existingPosts = new Map([
					['existing-page', { id: 'sql-id-123', slug: 'original-slug' }]
				]);
				const usedSlugs = new Set<string>();

				await processPageBatch(page, mockConfig, existingPosts, usedSlugs);

				// Should keep original slug
				expect(syncSlugToNotion).toHaveBeenCalledWith(page, 'test-notion-db', 'original-slug');
				expect(gqlAdminClient.request).toHaveBeenCalledWith(
					'MOCK_UPSERT_MUTATION',
					expect.objectContaining({
						post: expect.objectContaining({
							slug: 'original-slug',
							title: 'Updated Title'
						})
					})
				);
			});

			it('should update slug when user changes it in Notion', async () => {
				const page = createMockNotionPage({
					id: 'existing-page',
					properties: {
						Name: {
							id: 'title',
							type: 'title',
							title: [{
								type: 'text',
								text: { content: 'Post Title', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'Post Title',
								href: null
							}]
						},
						'Website Slug': {
							id: 'slug',
							type: 'rich_text',
							rich_text: [{
								type: 'text',
								text: { content: 'new-slug', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'new-slug',
								href: null
							}]
						},
						Status: {
							id: 'status',
							type: 'select',
							select: { id: 'pub', name: 'Published', color: 'green' }
						}
					}
				});

				const existingPosts = new Map([
					['existing-page', { id: 'sql-id-456', slug: 'old-slug' }]
				]);
				const usedSlugs = new Set<string>();

				await processPageBatch(page, mockConfig, existingPosts, usedSlugs);

				// Should update to new slug
				expect(syncSlugToNotion).toHaveBeenCalledWith(page, 'test-notion-db', 'new-slug');
				expect(usedSlugs.has('new-slug')).toBe(true);
			});

			it('should handle slug conflict when updating', async () => {
				const page = createMockNotionPage({
					id: 'existing-page',
					properties: {
						Name: {
							id: 'title',
							type: 'title',
							title: [{
								type: 'text',
								text: { content: 'Post', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'Post',
								href: null
							}]
						},
						'Website Slug': {
							id: 'slug',
							type: 'rich_text',
							rich_text: [{
								type: 'text',
								text: { content: 'taken-slug', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'taken-slug',
								href: null
							}]
						},
						Status: {
							id: 'status',
							type: 'select',
							select: { id: 'pub', name: 'Published', color: 'green' }
						}
					}
				});

				const existingPosts = new Map([
					['existing-page', { id: 'sql-id-789', slug: 'old-slug' }]
				]);
				const usedSlugs = new Set(['taken-slug']); // Conflict!

				await processPageBatch(page, mockConfig, existingPosts, usedSlugs);

				// Should generate unique variant
				expect(syncSlugToNotion).toHaveBeenCalledWith(page, 'test-notion-db', 'taken-slug-2');
				expect(usedSlugs.has('taken-slug-2')).toBe(true);
			});
		});

		describe('data extraction and upsert', () => {
			it('should extract all post data correctly', async () => {
				const page = createMockNotionPage({
					id: 'full-page',
					last_edited_time: '2025-10-08T14:30:00.000Z',
					properties: {
						Name: {
							id: 'title',
							type: 'title',
							title: [{
								type: 'text',
								text: { content: 'Full Test Post', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'Full Test Post',
								href: null
							}]
						},
						'Website Slug': {
							id: 'slug',
							type: 'rich_text',
							rich_text: [{
								type: 'text',
								text: { content: 'full-test', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'full-test',
								href: null
							}]
						},
						'Publish Date': {
							id: 'date',
							type: 'date',
							date: { start: '2025-10-01', end: null, time_zone: null }
						},
						Tags: {
							id: 'tags',
							type: 'multi_select',
							multi_select: [
								{ id: 't1', name: 'Testing', color: 'blue' },
								{ id: 't2', name: 'TypeScript', color: 'purple' }
							]
						},
						ID: {
							id: 'id',
							type: 'unique_id',
							unique_id: { number: 100 }
						},
						Status: {
							id: 'status',
							type: 'select',
							select: { id: 'pub', name: 'Published', color: 'green' }
						}
					}
				} as any);

				vi.mocked(pageToMarkdown).mockResolvedValue('# Full Markdown Content\n\nWith paragraphs.');

				const existingPosts = new Map();
				const usedSlugs = new Set<string>();

			await processPageBatch(page, mockConfig, existingPosts, usedSlugs);

			// Should upsert with all data
			expect(gqlAdminClient.request).toHaveBeenCalledWith(
				'MOCK_UPSERT_MUTATION',
				{
					post: {
						source_id: 'test-blog',
						notion_page_id: 'full-page',
						notion_short_id: '100',
						title: 'Full Test Post',
						slug: 'full-test',
						tags: ['Testing', 'TypeScript'],
						updated_at: '2025-10-08T14:30:00.000Z',
						publish_at: '2025-10-08T14:30:00.000Z', // Now uses last_edited_time (default)
						content: '# Full Markdown Content\n\nWith paragraphs.'
					}
				}
			);
		});			it('should handle missing optional fields', async () => {
				const page = createMockNotionPage({
					id: 'minimal-page',
					properties: {
						Name: {
							id: 'title',
							type: 'title',
							title: [{
								type: 'text',
								text: { content: 'Minimal', link: null },
								annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
								plain_text: 'Minimal',
								href: null
							}]
						},
						Status: {
							id: 'status',
							type: 'select',
							select: { id: 'pub', name: 'Published', color: 'green' }
						}
					}
				});

				const existingPosts = new Map();
				const usedSlugs = new Set<string>();

				await processPageBatch(page, mockConfig, existingPosts, usedSlugs);

				expect(gqlAdminClient.request).toHaveBeenCalledWith(
					'MOCK_UPSERT_MUTATION',
					expect.objectContaining({
						post: expect.objectContaining({
							title: 'Minimal',
							slug: 'minimal',
							notion_short_id: null,
							tags: []
						})
					})
				);
			});
		});
	});

	describe('processPageWebhook', () => {
		it('should query for slug conflicts when creating new post', async () => {
			const page = createMockNotionPage({
				id: 'webhook-page',
				properties: {
					Name: {
						id: 'title',
						type: 'title',
						title: [{
							type: 'text',
							text: { content: 'Webhook Test', link: null },
							annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
							plain_text: 'Webhook Test',
							href: null
						}]
					},
					Status: {
						id: 'status',
						type: 'select',
						select: { id: 'pub', name: 'Published', color: 'green' }
					}
				}
			});

			// Mock no conflicts
			vi.mocked(gqlAdminClient.request)
				.mockResolvedValueOnce({ posts: [] }) // First call: CHECK_SLUG_QUERY
				.mockResolvedValueOnce({}); // Second call: UPSERT_POST_MUTATION

			await processPageWebhook(page, mockConfig, null);

		// Should check if slug exists
		expect(gqlAdminClient.request).toHaveBeenNthCalledWith(
			1,
			'MOCK_CHECK_SLUG_QUERY',
			{
				short_db_ID: 'test-blog',
				slug: 'webhook-test'
			}
		);			// Should upsert
			expect(gqlAdminClient.request).toHaveBeenNthCalledWith(
				2,
				'MOCK_UPSERT_MUTATION',
				expect.objectContaining({
					post: expect.objectContaining({
						slug: 'webhook-test'
					})
				})
			);
		});

		it('should resolve conflicts when slug is taken', async () => {
			const page = createMockNotionPage({
				id: 'conflict-webhook',
				properties: {
					Name: {
						id: 'title',
						type: 'title',
						title: [{
							type: 'text',
							text: { content: 'Conflict', link: null },
							annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
							plain_text: 'Conflict',
							href: null
						}]
					},
					Status: {
						id: 'status',
						type: 'select',
						select: { id: 'pub', name: 'Published', color: 'green' }
					}
				}
			});

			vi.mocked(gqlAdminClient.request)
				.mockResolvedValueOnce({ posts: [{ id: 'existing' }] }) // 'conflict' is taken
				.mockResolvedValueOnce({ posts: [] }) // 'conflict-2' is free
				.mockResolvedValueOnce({}); // UPSERT

			await processPageWebhook(page, mockConfig, null);

		// Should check 'conflict', then 'conflict-2'
		expect(gqlAdminClient.request).toHaveBeenNthCalledWith(1, 'MOCK_CHECK_SLUG_QUERY', {
			short_db_ID: 'test-blog',
			slug: 'conflict'
		});
		expect(gqlAdminClient.request).toHaveBeenNthCalledWith(2, 'MOCK_CHECK_SLUG_QUERY', {
			short_db_ID: 'test-blog',
			slug: 'conflict-2'
		});			// Should upsert with 'conflict-2'
			expect(gqlAdminClient.request).toHaveBeenNthCalledWith(
				3,
				'MOCK_UPSERT_MUTATION',
				expect.objectContaining({
					post: expect.objectContaining({
						slug: 'conflict-2'
					})
				})
			);
		});

		it('should update existing post with new slug when changed in Notion', async () => {
			const page = createMockNotionPage({
				id: 'existing-webhook',
				properties: {
					Name: {
						id: 'title',
						type: 'title',
						title: [{
							type: 'text',
							text: { content: 'Updated', link: null },
							annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
							plain_text: 'Updated',
							href: null
						}]
					},
					'Website Slug': {
						id: 'slug',
						type: 'rich_text',
						rich_text: [{
							type: 'text',
							text: { content: 'new-webhook-slug', link: null },
							annotations: { bold: false, italic: false, strikethrough: false, underline: false, code: false, color: 'default' },
							plain_text: 'new-webhook-slug',
							href: null
						}]
					},
					Status: {
						id: 'status',
						type: 'select',
						select: { id: 'pub', name: 'Published', color: 'green' }
					}
				}
			});

			const existingPost = { id: 'sql-existing', slug: 'old-webhook-slug' };

			vi.mocked(gqlAdminClient.request)
				.mockResolvedValueOnce({ posts: [] }) // CHECK_SLUG_QUERY - no conflict
				.mockResolvedValueOnce({}); // UPSERT

			await processPageWebhook(page, mockConfig, existingPost);


		// Should check new slug availability
		expect(gqlAdminClient.request).toHaveBeenNthCalledWith(1, 'MOCK_CHECK_SLUG_QUERY', {
			short_db_ID: 'test-blog',
			slug: 'new-webhook-slug'
		});			// Should upsert with new slug
			expect(gqlAdminClient.request).toHaveBeenNthCalledWith(
				2,
				'MOCK_UPSERT_MUTATION',
				expect.objectContaining({
					post: expect.objectContaining({
						slug: 'new-webhook-slug'
					})
				})
			);
		});
	});
});
