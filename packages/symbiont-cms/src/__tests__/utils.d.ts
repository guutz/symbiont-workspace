/**
 * Test utilities and mocks for Symbiont CMS tests
 */
import type { PageObjectResponse } from '@notionhq/client';
import type { SymbiontConfig } from '../lib/types.js';
/**
 * Create a mock Notion page response
 */
export declare function createMockNotionPage(overrides?: Partial<PageObjectResponse>): PageObjectResponse;
/**
 * Create a mock Symbiont config
 */
export declare function createMockConfig(overrides?: Partial<SymbiontConfig>): SymbiontConfig;
/**
 * Mock GraphQL response
 */
export declare function createMockGraphQLResponse(data: any): {
    data: any;
    errors: undefined;
};
/**
 * Sample markdown content for testing
 */
export declare const sampleMarkdown: {
    basic: string;
    withCode: string;
    withMath: string;
    withImages: string;
    withLinks: string;
    complex: string;
};
//# sourceMappingURL=utils.d.ts.map