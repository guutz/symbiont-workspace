import { Client, type PageObjectResponse } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import { createLogger } from '../utils/logger.js';

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
			// Delete existing blocks
			const existingBlocks = await this.notion.blocks.children.list({ block_id: pageId });
			
			for (const block of existingBlocks.results) {
				if ('type' in block) {
					await this.notion.blocks.delete({ block_id: block.id });
				}
			}

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
	 * Get raw blocks from a Notion page.
	 * Returns BlockObjectResponse[] for content:preprocess hook.
	 */
	async getBlocks(pageId: string): Promise<any[]> {
		this.logger.debug({ event: 'fetch_blocks', pageId });

		try {
			const response = await this.notion.blocks.children.list({ block_id: pageId });
			return response.results as any[];
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