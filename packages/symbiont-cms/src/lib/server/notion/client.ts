import { Client, type PageObjectResponse } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { createLogger } from '../utils/logger.js';
import type { DiffResult, EditOperation } from './blocks-diff.js';

/**
 * NotionClient - Pure Notion API interactions
 * 
 * Responsibilities:
 * - Talk to Notion API (query databases, fetch pages, update properties)
 * - Convert Notion pages to markdown
 * - Extract property values from Notion pages
 * 
 * Does NOT contain business logic - just API calls and data extraction.
 */
export class NotionClient {
	private logger = createLogger({ operation: 'notion_client' });

	constructor(private notion: Client, public n2m: NotionToMarkdown) {}

	// ── Rate-limit-aware retry wrapper ──────────────────────────────────────

	/**
	 * Wrap a single Notion API call with retry logic for 429 (rate-limited)
	 * responses. Reads the `Retry-After` header when present and falls back to
	 * exponential backoff (1 s, 2 s, 4 s) for up to 3 attempts.
	 *
	 * All other errors are re-thrown immediately.
	 */
	private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
		const MAX_RETRIES = 3;
		let attempt = 0;
		while (true) {
			try {
				return await fn();
			} catch (error: any) {
				const isRateLimit = error?.status === 429 || error?.code === 'rate_limited';
				if (!isRateLimit || attempt >= MAX_RETRIES - 1) {
					throw error;
				}
				const retryAfter =
					(error?.headers?.['retry-after'] ?? error?.headers?.['Retry-After']) as string | undefined;
				const waitMs = retryAfter ? Number(retryAfter) * 1000 : Math.pow(2, attempt) * 1000;
				this.logger.warn({
					event: 'rate_limited',
					attempt: attempt + 1,
					waitMs,
				});
				await new Promise((resolve) => setTimeout(resolve, waitMs));
				attempt++;
			}
		}
	}

	/**
	 * Fetch a single page by ID
	 */
	async getPage(pageId: string): Promise<PageObjectResponse> {
		this.logger.debug({ event: 'fetch_page', pageId });
		
		try {
			const response = await this.notion.pages.retrieve({ page_id: pageId });
			
			if (!('properties' in response)) {
				throw new Error(`Page ${pageId} is not a database page`);
			}
			
			return response as PageObjectResponse;
		} catch (error: any) {
			// Check for authentication errors
			if (error.code === 'unauthorized' || error.status === 401) {
				throw new Error(
					`Notion API authentication failed: Invalid or expired token. ` +
					`Please check your notionToken configuration. Original error: ${error.message}`
				);
			}
			throw error;
		}
	}

	/**
	 * Query a Notion database (with optional filtering and pagination)
	 */
	async queryDataSource(
		dataSourceId: string,
		filter?: any,
		cursor?: string
	): Promise<{ pages: PageObjectResponse[]; nextCursor: string | null }> {
		this.logger.debug({ 
			event: 'query_datasource', 
			dataSourceId, 
			hasFilter: !!filter,
			cursor 
		});

		try {
			const response = await this.notion.dataSources.query({
				data_source_id: dataSourceId,
				filter,
				start_cursor: cursor
			});

			const pages = response.results.filter((page: any): page is PageObjectResponse => 
				'properties' in page
			);

			return {
				pages,
				nextCursor: response.has_more ? response.next_cursor : null
			};
		} catch (error: any) {
			// Check for authentication errors
			if (error.code === 'unauthorized' || error.status === 401) {
				throw new Error(
					`Notion API authentication failed: Invalid or expired token. ` +
					`Please check your notionToken configuration. Original error: ${error.message}`
				);
			}
			throw error;
		}
	}

	/**
	 * Update a property on a Notion page
	 */
	async updateProperty(
		pageId: string,
		propertyName: string,
		value: string
	): Promise<void> {
		this.logger.debug({ 
			event: 'update_property', 
			pageId, 
			propertyName, 
			value 
		});

		try {
			await this.notion.pages.update({
				page_id: pageId,
				properties: {
					[propertyName]: {
						rich_text: [
							{
								type: 'text',
								text: { content: value }
							}
						]
					}
				}
			});
		} catch (error: any) {
			// Check for authentication errors
			if (error.code === 'unauthorized' || error.status === 401) {
				throw new Error(
					`Notion API authentication failed: Invalid or expired token. ` +
					`Please check your notionToken configuration. Original error: ${error.message}`
				);
			}
			
			this.logger.warn({ 
				event: 'update_property_failed', 
				pageId,
				propertyName,
				error: error?.message 
			});
			// Don't throw for other errors - property updates should be non-blocking
		}
	}

	/**
	 * Update a URL property on a Notion page
	 * Used to sync public CDN/storage URLs back to Notion url-type properties
	 */
	async updateUrlProperty(
		pageId: string,
		propertyName: string,
		url: string
	): Promise<void> {
		this.logger.debug({
			event: 'update_url_property',
			pageId,
			propertyName,
			url
		});

		try {
			await this.notion.pages.update({
				page_id: pageId,
				properties: {
					[propertyName]: {
						url
					}
				}
			});
			this.logger.info({
				event: 'url_property_updated',
				pageId,
				propertyName
			});
		} catch (error: any) {
			if (error.code === 'unauthorized' || error.status === 401) {
				throw new Error(
					`Notion API authentication failed: Invalid or expired token. ` +
					`Please check your notionToken configuration. Original error: ${error.message}`
				);
			}

			this.logger.warn({
				event: 'update_url_property_failed',
				pageId,
				propertyName,
				error: error?.message
			});
			// Non-blocking — same pattern as updateProperty
		}
	}

	/**
	 * Update a file property on a Notion page with an external URL
	 * Used to sync uploaded image URLs (Supabase/Nhost) back to Notion
	 */
	async updateFileProperty(
		pageId: string,
		propertyName: string,
		url: string
	): Promise<void> {
		this.logger.debug({ 
			event: 'update_file_property', 
			pageId, 
			propertyName, 
			url 
		});

		try {
			await this.notion.pages.update({
				page_id: pageId,
				properties: {
					[propertyName]: {
						files: [
							{
								type: 'external',
								name: 'Image',
								external: { url }
							}
						]
					}
				}
			});
			this.logger.info({ 
				event: 'file_property_updated', 
				pageId, 
				propertyName 
			});
		} catch (error: any) {
			// Check for authentication errors
			if (error.code === 'unauthorized' || error.status === 401) {
				throw new Error(
					`Notion API authentication failed: Invalid or expired token. ` +
					`Please check your notionToken configuration. Original error: ${error.message}`
				);
			}
			
			this.logger.warn({ 
				event: 'update_file_property_failed', 
				pageId,
				propertyName,
				error: error?.message 
			});
			// Don't throw for other errors - property updates should be non-blocking
		}
	}

	/**
	 * Replace all blocks in a Notion page
	 * 
	 * Note: Notion doesn't have a "replace all" operation, so this:
	 * 1. Deletes all existing blocks
	 * 2. Appends new blocks in chunks of 100 (Notion API limit)
	 */
	async updatePageBlocks(
		pageId: string,
		blocks: any[]
	): Promise<void> {
		this.logger.debug({ 
			event: 'update_page_blocks', 
			pageId, 
			blockCount: blocks.length 
		});

		try {
			// Delete existing blocks (paginated — pages with >100 blocks need multiple passes)
			let deleteCursor: string | undefined;
			do {
				const existingPage = await this.notion.blocks.children.list({
					block_id: pageId,
					start_cursor: deleteCursor,
				});
				for (const block of existingPage.results) {
					if ('type' in block) {
						await this.notion.blocks.delete({ block_id: block.id });
					}
				}
				deleteCursor = existingPage.has_more ? (existingPage.next_cursor ?? undefined) : undefined;
			} while (deleteCursor);

			// Add new blocks (100 blocks per request max)
			const chunkSize = 100;
			for (let i = 0; i < blocks.length; i += chunkSize) {
				const chunk = blocks.slice(i, i + chunkSize);
				await this.notion.blocks.children.append({
					block_id: pageId,
					children: chunk,
				});
			}
		} catch (error: any) {
			// Check for authentication errors
			if (error.code === 'unauthorized' || error.status === 401) {
				throw new Error(
					`Notion API authentication failed: Invalid or expired token. ` +
					`Please check your notionToken configuration. Original error: ${error.message}`
				);
			}
			throw error;
		}
	}

	/**
	 * Apply a surgical diff edit script to a Notion page.
	 *
	 * Operations are applied in an atomicity-safe order:
	 * 1. Updates  — non-destructive, page always coherent.
	 * 2. Inserts  — additive; no data loss if interrupted.
	 * 3. Replaces — insert new block, then delete old block (paired).
	 * 4. Deletes  — soft-deletes; stale blocks cleaned up on next sync if
	 *               interrupted.
	 *
	 * Each operation is individually try/caught: a failure in one operation
	 * logs a warning and continues, leaving the page in a superset state that
	 * is safe and will be corrected on the next sync.
	 *
	 * Adjacent inserts that share the same `afterId` anchor are batched into a
	 * single append call (up to 100 blocks per request).
	 *
	 * @returns `{ applied, failed }` counts for observability.
	 */
	async patchPageBlocks(
		pageId: string,
		diff: DiffResult,
	): Promise<{ applied: number; failed: number }> {
		this.logger.debug({
			event: 'patch_page_blocks',
			pageId,
			...diff.stats,
		});

		let applied = 0;
		let failed  = 0;

		// ── Step 1: Updates ──────────────────────────────────────────────────
		for (const op of diff.operations) {
			if (op.op !== 'update') continue;
			try {
				await this.withRetry(() =>
					this.notion.blocks.update({
						block_id: op.existingId,
						[op.existingType]: op.newContent,
					} as any)
				);
				applied++;
			} catch (e: any) {
				this.logger.warn({ event: 'patch_update_failed', blockId: op.existingId, error: e?.message });
				failed++;
			}
		}

		// ── Step 2: Inserts (batched by afterId) ─────────────────────────────
		// Collect all inserts and group consecutive ones with the same afterId
		// into batches of up to 100.
		const insertOps = diff.operations.filter((o): o is Extract<EditOperation, { op: 'insert' }> => o.op === 'insert');
		let k = 0;
		while (k < insertOps.length) {
			const anchor = insertOps[k].afterId;
			const batch: any[] = [];
			let batchStart = k;

			while (k < insertOps.length && insertOps[k].afterId === anchor && batch.length < 100) {
				batch.push(insertOps[k].block);
				k++;
			}

			try {
				const appendParams: any = {
					block_id: pageId,
					children: batch,
				};
				if (anchor !== null) {
					appendParams.after = anchor;
				}
				await this.withRetry(() => this.notion.blocks.children.append(appendParams));
				applied += batch.length;
			} catch (e: any) {
				this.logger.warn({
					event: 'patch_insert_failed',
					afterId: anchor,
					batchSize: batch.length,
					error: e?.message,
				});
				failed += batch.length;
				// Skip any remaining inserts that were grouped with this anchor
				// (they've already been advanced past above).
				void batchStart;
			}
		}

		// ── Step 3: Replaces (insert new, then delete old) ───────────────────
		for (const op of diff.operations) {
			if (op.op !== 'replace') continue;
			try {
				// Insert the new block after the one being replaced.
				await this.withRetry(() =>
					this.notion.blocks.children.append({
						block_id: pageId,
						children: [op.newBlock],
						after: op.existingId,
					} as any)
				);
				// Now soft-delete the old block.
				await this.withRetry(() =>
					this.notion.blocks.delete({ block_id: op.existingId })
				);
				applied += 2;
			} catch (e: any) {
				this.logger.warn({ event: 'patch_replace_failed', blockId: op.existingId, error: e?.message });
				failed++;
			}
		}

		// ── Step 4: Deletes ──────────────────────────────────────────────────
		for (const op of diff.operations) {
			if (op.op !== 'delete') continue;
			try {
				await this.withRetry(() =>
					this.notion.blocks.delete({ block_id: op.existingId })
				);
				applied++;
			} catch (e: any) {
				// 404 means the block was already deleted — safe to ignore.
				if (e?.status !== 404) {
					this.logger.warn({ event: 'patch_delete_failed', blockId: op.existingId, error: e?.message });
					failed++;
				}
			}
		}

		this.logger.debug({ event: 'patch_page_blocks_done', pageId, applied, failed });
		return { applied, failed };
	}

	/**
	 * Find a page by a specific property value
	 * Generic version of finding by any property type
	 */
	async findPageByProperty(
		dataSourceId: string,
		propertyName: string,
		propertyType: 'number' | 'rich_text' | 'select',
		value: number | string
	): Promise<string | null> {
		this.logger.debug({ 
			event: 'find_page_by_property', 
			dataSourceId,
			propertyName,
			propertyType,
			value 
		});

		try {
			let filter: any;
			
			switch (propertyType) {
				case 'number':
					filter = {
						property: propertyName,
						number: { equals: value }
					};
					break;
				case 'rich_text':
					filter = {
						property: propertyName,
						rich_text: { equals: value }
					};
					break;
				case 'select':
					filter = {
						property: propertyName,
						select: { equals: value }
					};
					break;
			}

			const response = await this.notion.dataSources.query({
				data_source_id: dataSourceId,
				filter
			});

			if (response.results.length === 0) {
				return null;
			}

			return response.results[0].id;
		} catch (error: any) {
			// Check for authentication errors
			if (error.code === 'unauthorized' || error.status === 401) {
				throw new Error(
					`Notion API authentication failed: Invalid or expired token. ` +
					`Please check your notionToken configuration. Original error: ${error.message}`
				);
			}
			throw error;
		}
	}

	/**
	 * Convert Notion page content to markdown
	 */
	async pageToMarkdown(pageId: string): Promise<string> {
		this.logger.debug({ event: 'convert_to_markdown', pageId });

		try {
			const mdblocks = await this.n2m.pageToMarkdown(pageId);
			const mdResult = this.n2m.toMarkdownString(mdblocks);
			return typeof mdResult === 'string' ? mdResult : mdResult?.parent ?? '';
		} catch (error: any) {
			// Check for authentication errors
			if (error.code === 'unauthorized' || error.status === 401) {
				throw new Error(
					`Notion API authentication failed: Invalid or expired token. ` +
					`Please check your notionToken configuration. Original error: ${error.message}`
				);
			}
			throw error;
		}
	}

	/**
	 * Extract property values from a Notion page
	 * Handles multi_select, select, people, rich_text, etc.
	 */
	getPropertyValues(page: PageObjectResponse, propertyName: string): string[] {
		const prop = page.properties[propertyName];
		if (!prop) return [];

		switch (prop.type) {
			case 'multi_select':
				return prop.multi_select.map((item) => item.name);
			
			case 'select':
				return prop.select ? [prop.select.name] : [];
			
			case 'people':
				return prop.people.map((person) => {
					if ('name' in person && person.name) return person.name;
					return person.id;
				});
			
			case 'rich_text':
				const text = prop.rich_text.map((item) => item.plain_text).join('');
				return text ? [text] : [];
			
			default:
				this.logger.warn({ 
					event: 'unsupported_property_type', 
					propertyName, 
					type: prop.type 
				});
				return [];
		}
	}

	/**
	 * Auto-detect title property (type: 'title')
	 */
	getTitleProperty(page: PageObjectResponse): string {
		const titleProp = Object.values(page.properties).find(
			(prop) => prop.type === 'title'
		);

		if (!titleProp || titleProp.type !== 'title') {
			this.logger.warn({ event: 'no_title_property', pageId: page.id });
			return 'Untitled';
		}

		return titleProp.title.map((item) => item.plain_text).join('') || 'Untitled';
	}

	/**
	 * Auto-detect unique_id property (type: 'unique_id')
	 */
	getUniqueIdProperty(page: PageObjectResponse): string | null {
		const uniqueIdProp = Object.values(page.properties).find(
			(prop) => prop.type === 'unique_id'
		);

		if (!uniqueIdProp || uniqueIdProp.type !== 'unique_id') {
			return null;
		}

		return uniqueIdProp.unique_id.prefix 
			? `${uniqueIdProp.unique_id.prefix}-${uniqueIdProp.unique_id.number}`
			: String(uniqueIdProp.unique_id.number);
	}

	/**
	 * Get raw blocks from a Notion page (paginated — fetches all blocks).
	 * Returns BlockObjectResponse[] for content:preprocess hook.
	 */
	async getBlocks(pageId: string): Promise<any[]> {
		this.logger.debug({ event: 'fetch_blocks', pageId });

		try {
			const allBlocks: any[] = [];
			let cursor: string | undefined;
			do {
				const response = await this.notion.blocks.children.list({
					block_id: pageId,
					start_cursor: cursor,
				});
				allBlocks.push(...(response.results as any[]));
				cursor = response.has_more ? (response.next_cursor ?? undefined) : undefined;
			} while (cursor);
			return allBlocks;
		} catch (error: any) {
			if (error.code === 'unauthorized' || error.status === 401) {
				throw new Error(
					`Notion API authentication failed: Invalid or expired token. ` +
					`Please check your notionToken configuration. Original error: ${error.message}`
				);
			}
			throw error;
		}
	}

	/**
	 * Get database schema (for publish:check hook to find Status property).
	 * Returns the full database object with properties definition.
	 */
	async getDatabaseSchema(databaseId: string): Promise<any> {
		this.logger.debug({ event: 'fetch_database_schema', databaseId });

		try {
			const response = await this.notion.dataSources.retrieve({ data_source_id: databaseId });
			return response;
		} catch (error: any) {
			if (error.code === 'unauthorized' || error.status === 401) {
				throw new Error(
					`Notion API authentication failed: Invalid or expired token. ` +
					`Please check your notionToken configuration. Original error: ${error.message}`
				);
			}
			throw error;
		}
	}
}