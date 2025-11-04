/**
 * Test utilities and mocks for Symbiont CMS tests
 */

import type { PageObjectResponse } from '@notionhq/client';
import type { SymbiontConfig, DatabaseBlueprint } from '../lib/types.js';

/**
 * Create a mock Notion page response
 */
export function createMockNotionPage(overrides: Partial<PageObjectResponse> = {}): PageObjectResponse {
	const defaultPage: Partial<PageObjectResponse> = {
		object: 'page',
		id: '123e4567-e89b-12d3-a456-426614174000',
		created_time: '2025-01-01T00:00:00.000Z',
		last_edited_time: '2025-01-01T00:00:00.000Z',
		created_by: { object: 'user', id: 'user-id' },
		last_edited_by: { object: 'user', id: 'user-id' },
		cover: null,
		icon: null,
		parent: {
			type: 'database_id',
			database_id: 'db-123'
		},
		archived: false,
		in_trash: false,
		is_locked: false,
		properties: {
			Name: {
				id: 'title',
				type: 'title',
				title: [
					{
						type: 'text',
						text: { content: 'Test Post', link: null },
						annotations: {
							bold: false,
							italic: false,
							strikethrough: false,
							underline: false,
							code: false,
							color: 'default'
						},
						plain_text: 'Test Post',
						href: null
					}
				]
			},
			Status: {
				id: 'status',
				type: 'select',
				select: {
					id: 'published',
					name: 'Published',
					color: 'green'
				}
			},
			'Website Slug': {
				id: 'slug',
				type: 'rich_text',
				rich_text: [
					{
						type: 'text',
						text: { content: 'test-post', link: null },
						annotations: {
							bold: false,
							italic: false,
							strikethrough: false,
							underline: false,
							code: false,
							color: 'default'
						},
						plain_text: 'test-post',
						href: null
					}
				]
			},
			'Publish Date': {
				id: 'date',
				type: 'date',
				date: {
					start: '2025-01-01',
					end: null,
					time_zone: null
				}
			},
			Tags: {
				id: 'tags',
				type: 'multi_select',
				multi_select: [
					{ id: 'tag1', name: 'Test', color: 'blue' },
					{ id: 'tag2', name: 'Tutorial', color: 'green' }
				]
			}
		},
		url: 'https://www.notion.so/test-page',
		public_url: null
	};

	return { ...defaultPage, ...overrides } as PageObjectResponse;
}

/**
 * Create a mock Symbiont configuration for testing
 */
export function createMockConfig(overrides: Partial<SymbiontConfig> = {}): SymbiontConfig {
	const defaultDatabase: DatabaseBlueprint = {
		alias: 'test-blog',
		dataSourceId: 'test-database-id',
		notionToken: 'test-notion-token',
		isPublicRule: (page: PageObjectResponse) => {
			const status = page.properties.Status;
			return status?.type === 'select' && status.select?.name === 'Published';
		},
		slugRule: (page: PageObjectResponse) => {
			const prop = page.properties['Website Slug'];
			if (prop?.type === 'rich_text') {
				return prop.rich_text?.[0]?.plain_text?.trim() || null;
			}
			return null;
		}
	};

	const defaultConfig: SymbiontConfig = {
		graphqlEndpoint: 'http://localhost:8080/v1/graphql',
		databases: [defaultDatabase]
	};

	return {
		...defaultConfig,
		...overrides
	};
}

/**
 * Mock GraphQL response
 */
export function createMockGraphQLResponse(data: any) {
	return {
		data,
		errors: undefined
	};
}

/**
 * Sample markdown content for testing
 */
export const sampleMarkdown = {
	basic: '# Hello World\n\nThis is a **test** post.',
	
	withCode: `# Code Example

Here's some code:

\`\`\`javascript
function hello() {
  console.log('Hello, world!');
}
\`\`\`

And inline \`code\` too.`,

	withMath: `# Math Example

Inline math: $E = mc^2$

Block math:

$$
\\int_0^\\infty e^{-x^2} dx = \\frac{\\sqrt{\\pi}}{2}
$$`,

	withImages: `# Images

![Alt text](https://example.com/image.jpg =800x600)

![Another image](https://example.com/image2.jpg)`,

	withLinks: `# Links

[Regular link](https://example.com)

[Link with title](https://example.com "Example Site")`,

	complex: `# Complex Post

## Introduction

This post has **bold**, *italic*, and ~~strikethrough~~ text.

### Code Block

\`\`\`typescript
interface User {
  id: string;
  name: string;
}
\`\`\`

### Math

The equation $E = mc^2$ is famous.

### List

- Item 1
- Item 2
  - Nested item
- Item 3

### Image

![Example](https://example.com/image.jpg =400x300)

### Blockquote

> This is a quote.
> 
> With multiple lines.

### Link

Check out [the docs](https://example.com) for more info.`
};
