/**
 * Tests for Notion helper utilities
 */
import { describe, it, expect } from 'vitest';
import { getTitle, getShortPostID, getTags, getPublishDate, defaultSlugRule, buildPostLookups } from './notion-helpers.server.js';
import { createMockNotionPage } from '../../__tests__/utils.js';
import type { PageObjectResponse } from '@notionhq/client';
import type { HydratedDatabaseConfig } from '../types.js';

describe('notion-helpers', () => {
	describe('getTitle', () => {
		it('should extract title from page properties', () => {
			const page = createMockNotionPage();
			const title = getTitle(page);
			expect(title).toBe('Test Post');
		});

		it('should return "Untitled" for page without title', () => {
			const page = createMockNotionPage({
				properties: {
					Name: {
						id: 'title',
						type: 'title',
						title: []
					}
				}
			});
			const title = getTitle(page);
			expect(title).toBe('Untitled');
		});

		it('should return "Untitled" for malformed title property', () => {
			const page = createMockNotionPage({
				properties: {
					Name: {
						id: 'title',
						type: 'title',
						title: undefined
					}
				}
			} as any);
			const title = getTitle(page);
			expect(title).toBe('Untitled');
		});
	});

	describe('getShortPostID', () => {
		it('should extract unique_id with prefix', () => {
			const page = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					ID: {
						id: 'id',
						type: 'unique_id',
						unique_id: {
							prefix: 'POST',
							number: 123
						}
					}
				}
			} as any);
			const id = getShortPostID(page);
			expect(id).toBe('POST-123');
		});

		it('should extract unique_id without prefix', () => {
			const page = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					ID: {
						id: 'id',
						type: 'unique_id',
						unique_id: {
							number: 456
						}
					}
				}
			} as any);
			const id = getShortPostID(page);
			expect(id).toBe('456');
		});

		it('should return null if ID property is missing', () => {
			const page = createMockNotionPage();
			const id = getShortPostID(page);
			expect(id).toBeNull();
		});

		it('should return null if unique_id is undefined', () => {
			const page = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					ID: {
						id: 'id',
						type: 'unique_id',
						unique_id: undefined
					}
				}
			} as any);
			const id = getShortPostID(page);
			expect(id).toBeNull();
		});
	});

	describe('getTags', () => {
		it('should extract tags from multi_select property', () => {
			const page = createMockNotionPage();
			const tags = getTags(page);
			expect(tags).toEqual(['Test', 'Tutorial']);
		});

		it('should return empty array if no tags', () => {
			const page = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					Tags: {
						id: 'tags',
						type: 'multi_select',
						multi_select: []
					}
				}
			});
			const tags = getTags(page);
			expect(tags).toEqual([]);
		});

		it('should return empty array if Tags property is missing', () => {
			const page = createMockNotionPage({
				properties: {
					Name: createMockNotionPage().properties.Name
				}
			});
			const tags = getTags(page);
			expect(tags).toEqual([]);
		});

		it('should handle tags with special characters', () => {
			const page = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					Tags: {
						id: 'tags',
						type: 'multi_select',
						multi_select: [
							{ id: 't1', name: 'C++', color: 'blue' },
							{ id: 't2', name: 'AI/ML', color: 'green' },
							{ id: 't3', name: 'Data Science 📊', color: 'red' }
						]
					}
				}
			});
			const tags = getTags(page);
			expect(tags).toEqual(['C++', 'AI/ML', 'Data Science 📊']);
		});
	});

	describe('getPublishDate', () => {
		const mockConfig: HydratedDatabaseConfig = {
			dbNickname: 'test-blog',
			notionDatabaseId: 'test-db',
			isPublicRule: (page: PageObjectResponse) => {
				const status = page.properties.Status;
				return status?.type === 'select' && status.select?.name === 'Published';
			},
			sourceOfTruthRule: () => 'NOTION' as const,
			slugRule: (page: PageObjectResponse) => null
		};

		it('should return last_edited_time when gate passes (default behavior)', () => {
			const page = createMockNotionPage();
			const publishDate = getPublishDate(page, mockConfig);
			// Default uses last_edited_time, not the 'Publish Date' property
			expect(publishDate).toBe('2025-01-01T00:00:00.000Z');
		});

		it('should return last_edited_time even without Publish Date property', () => {
			const page = createMockNotionPage({
				properties: {
					Name: createMockNotionPage().properties.Name,
					Status: createMockNotionPage().properties.Status
				}
			});
			const publishDate = getPublishDate(page, mockConfig);
			
			// Should use last_edited_time (always present)
			expect(publishDate).toBe('2025-01-01T00:00:00.000Z');
		});

		it('should return null when gate fails (isPublicRule = false)', () => {
			const page = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					Status: {
						id: 'status',
						type: 'select',
						select: {
							id: 'draft',
							name: 'Draft',
							color: 'gray'
						}
					}
				}
			});
			const publishDate = getPublishDate(page, mockConfig);
			expect(publishDate).toBeNull();
		});

		it('should use default gate (always pass) when no isPublicRule', () => {
			const configNoGate: HydratedDatabaseConfig = {
				dbNickname: 'test-blog',
				notionDatabaseId: 'test-db',
				sourceOfTruthRule: () => 'NOTION' as const
			};

			const page = createMockNotionPage();
			const publishDate = getPublishDate(page, configNoGate);
			// Default: gate passes, uses last_edited_time
			expect(publishDate).toBe('2025-01-01T00:00:00.000Z');
		});
	});

	describe('getPublishDate with publishDateRule', () => {
		it('should use custom publishDateRule with default gate', () => {
			const mockConfig: HydratedDatabaseConfig = {
				dbNickname: 'test-blog',
				notionDatabaseId: 'test-db',
				publishDateRule: (page: PageObjectResponse) => {
					const goLive = (page.properties['Go Live'] as any)?.date?.start;
					return goLive || null;
				},
				sourceOfTruthRule: () => 'NOTION' as const
			};

			const page = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					'Go Live': {
						id: 'golive',
						type: 'date',
						date: {
							start: '2025-06-15',
							end: null,
							time_zone: null
						}
					}
				}
			});

			const publishDate = getPublishDate(page, mockConfig);
			expect(publishDate).toBe('2025-06-15');
		});

		it('should return null when publishDateRule returns null (even if gate passes)', () => {
			const mockConfig: HydratedDatabaseConfig = {
				dbNickname: 'test-blog',
				notionDatabaseId: 'test-db',
				publishDateRule: () => null,
				sourceOfTruthRule: () => 'NOTION' as const
			};

			const page = createMockNotionPage();
			const publishDate = getPublishDate(page, mockConfig);
			expect(publishDate).toBeNull();
		});

		it('should combine isPublicRule gate with publishDateRule date extraction', () => {
			const mockConfig: HydratedDatabaseConfig = {
				dbNickname: 'test-blog',
				notionDatabaseId: 'test-db',
				isPublicRule: (page) => (page.properties.Ready as any)?.checkbox === true,
				publishDateRule: (page) => (page.properties['Go Live'] as any)?.date?.start || null,
				sourceOfTruthRule: () => 'NOTION' as const
			};

			// Page passes gate + has date = published
			const readyPage = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					Ready: {
						id: 'ready',
						type: 'checkbox',
						checkbox: true
					},
					'Go Live': {
						id: 'golive',
						type: 'date',
						date: { start: '2025-12-31', end: null, time_zone: null }
					}
				}
			});
			expect(getPublishDate(readyPage, mockConfig)).toBe('2025-12-31');

			// Page fails gate = unpublished (even with date)
			const notReadyPage = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					Ready: {
						id: 'ready',
						type: 'checkbox',
						checkbox: false
					},
					'Go Live': {
						id: 'golive',
						type: 'date',
						date: { start: '2025-12-31', end: null, time_zone: null }
					}
				}
			});
			expect(getPublishDate(notReadyPage, mockConfig)).toBeNull();
		});

		it('should support complex publishDateRule with gate', () => {
			const mockConfig: HydratedDatabaseConfig = {
				dbNickname: 'test-blog',
				notionDatabaseId: 'test-db',
				isPublicRule: (page) => (page.properties.Status as any)?.select?.name === 'Published',
				publishDateRule: (page: PageObjectResponse) => {
					const scheduledDate = (page.properties['Scheduled'] as any)?.date?.start;
					return scheduledDate || new Date('2025-01-01').toISOString();
				},
				sourceOfTruthRule: () => 'NOTION' as const
			};

			// Published + scheduled date
			const scheduledPage = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					Status: {
						id: 'status',
						type: 'select',
						select: { id: 'pub', name: 'Published', color: 'green' }
					},
					'Scheduled': {
						id: 'sched',
						type: 'date',
						date: { start: '2025-08-20', end: null, time_zone: null }
					}
				}
			});
			expect(getPublishDate(scheduledPage, mockConfig)).toBe('2025-08-20');

			// Published but no scheduled date = fallback
			const unscheduledPage = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					Status: {
						id: 'status',
						type: 'select',
						select: { id: 'pub', name: 'Published', color: 'green' }
					}
				}
			});
			expect(getPublishDate(unscheduledPage, mockConfig)).toBe('2025-01-01T00:00:00.000Z');

			// Draft = gate fails, not published
			const draftPage = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					Status: {
						id: 'status',
						type: 'select',
						select: { id: 'draft', name: 'Draft', color: 'gray' }
					},
					'Scheduled': {
						id: 'sched',
						type: 'date',
						date: { start: '2025-08-20', end: null, time_zone: null }
					}
				}
			});
			expect(getPublishDate(draftPage, mockConfig)).toBeNull();
		});
	});

	describe('defaultSlugRule', () => {
		it('should extract slug from Slug property', () => {
			const page = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					Slug: {
						id: 'slug',
						type: 'rich_text',
						rich_text: [
							{
								type: 'text',
								text: { content: 'custom-slug', link: null },
								annotations: {
									bold: false,
									italic: false,
									strikethrough: false,
									underline: false,
									code: false,
									color: 'default'
								},
								plain_text: 'custom-slug',
								href: null
							}
						]
					}
				}
			});
			const slug = defaultSlugRule(page);
			expect(slug).toBe('custom-slug');
		});

		it('should trim whitespace from slug', () => {
			const page = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					Slug: {
						id: 'slug',
						type: 'rich_text',
						rich_text: [
							{
								type: 'text',
								text: { content: '  spaces-around  ', link: null },
								annotations: {
									bold: false,
									italic: false,
									strikethrough: false,
									underline: false,
									code: false,
									color: 'default'
								},
								plain_text: '  spaces-around  ',
								href: null
							}
						]
					}
				}
			});
			const slug = defaultSlugRule(page);
			expect(slug).toBe('spaces-around');
		});

		it('should return null if Slug property is empty', () => {
			const page = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					Slug: {
						id: 'slug',
						type: 'rich_text',
						rich_text: []
					}
				}
			});
			const slug = defaultSlugRule(page);
			expect(slug).toBeNull();
		});

		it('should return null if Slug property is missing', () => {
			const page = createMockNotionPage();
			const slug = defaultSlugRule(page);
			expect(slug).toBeNull();
		});

		it('should return null for whitespace-only slug', () => {
			const page = createMockNotionPage({
				properties: {
					...createMockNotionPage().properties,
					Slug: {
						id: 'slug',
						type: 'rich_text',
						rich_text: [
							{
								type: 'text',
								text: { content: '   ', link: null },
								annotations: {
									bold: false,
									italic: false,
									strikethrough: false,
									underline: false,
									code: false,
									color: 'default'
								},
								plain_text: '   ',
								href: null
							}
						]
					}
				}
			});
			const slug = defaultSlugRule(page);
			expect(slug).toBeNull();
		});
	});

	describe('buildPostLookups', () => {
		it('should build lookup maps from posts array', () => {
			const posts = [
				{ id: 'post-1', notion_page_id: 'page-1', slug: 'first-post' },
				{ id: 'post-2', notion_page_id: 'page-2', slug: 'second-post' },
				{ id: 'post-3', notion_page_id: 'page-3', slug: 'third-post' }
			];

			const { byPageId, slugs } = buildPostLookups(posts);

			expect(byPageId.size).toBe(3);
			expect(byPageId.get('page-1')).toEqual({ id: 'post-1', slug: 'first-post' });
			expect(byPageId.get('page-2')).toEqual({ id: 'post-2', slug: 'second-post' });
			expect(byPageId.get('page-3')).toEqual({ id: 'post-3', slug: 'third-post' });

			expect(slugs.size).toBe(3);
			expect(slugs.has('first-post')).toBe(true);
			expect(slugs.has('second-post')).toBe(true);
			expect(slugs.has('third-post')).toBe(true);
		});

		it('should handle empty posts array', () => {
			const { byPageId, slugs } = buildPostLookups([]);

			expect(byPageId.size).toBe(0);
			expect(slugs.size).toBe(0);
		});

		it('should handle duplicate slugs (keeps last one)', () => {
			const posts = [
				{ id: 'post-1', notion_page_id: 'page-1', slug: 'same-slug' },
				{ id: 'post-2', notion_page_id: 'page-2', slug: 'same-slug' }
			];

			const { slugs } = buildPostLookups(posts);

			// Set only keeps unique values
			expect(slugs.size).toBe(1);
			expect(slugs.has('same-slug')).toBe(true);
		});
	});
});
