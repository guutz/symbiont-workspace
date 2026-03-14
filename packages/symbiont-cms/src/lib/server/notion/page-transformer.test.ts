import { describe, expect, it, vi } from 'vitest';
import { NotionPageToDatabasePageTransformer } from './page-transformer.js';
import type { DatabaseBlueprint } from '../../types.js';

describe('NotionPageToDatabasePageTransformer', () => {
	it('keeps publish_at explicitly null when publish:date resolves to no value', async () => {
		const config: DatabaseBlueprint = {
			alias: 'test-source',
			dataSourceId: 'test-datasource',
			hooks: [
				{
					name: 'test:publish:check',
					event: 'publish:check',
					priority: 'override',
					fn: async () => true,
				},
				{
					name: 'test:publish:date:none',
					event: 'publish:date',
					priority: 'override',
					fn: async () => false,
					},
					{
						name: 'test:slug:conflict:passthrough',
						event: 'slug:conflict',
						priority: 'override',
						fn: async (ctx) => ctx.input as string,
				},
			],
		};

		const notionClient = {
			pageToMarkdown: vi.fn().mockResolvedValue(''),
				getDatabaseSchema: vi.fn().mockResolvedValue({
					properties: {
						Status: {
							type: 'status',
							status: {
								groups: [
									{ name: 'Complete', option_ids: ['published-status-id'] },
								],
							},
						},
					},
				}),
		} as any;
		const pageCrud = {
			upsert: vi.fn().mockResolvedValue(undefined),
		} as any;
		const supabase = {} as any;

		const transformer = new NotionPageToDatabasePageTransformer(
			config,
			notionClient,
			pageCrud,
			supabase,
		);

		const page = {
			id: 'page-123',
			last_edited_time: '2026-03-12T12:00:00.000Z',
			properties: {
				Title: {
					type: 'title',
					title: [{ plain_text: 'Print Only Draft' }],
				},
				Status: {
					type: 'status',
					status: { id: 'published-status-id', name: 'Published' },
				},
			},
		} as any;

		const result = await transformer.transformPage(page);

		expect(result).not.toBeNull();
		expect(result?.publish_at).toBeNull();
		expect(pageCrud.upsert).toHaveBeenCalledWith(
			expect.objectContaining({
				page_id: 'page-123',
				publish_at: null,
			})
		);
	});
});