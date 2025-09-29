// Reexport your entry components here

// This file defines the public API of your @symbiont/cms package.

export { default as Renderer } from './Renderer.svelte';
export { default as Editor } from './Editor.svelte';

// Add `Post` to the list of exported types
export type {
	ClassMap,
	Post,
	SyncSummary,
	SymbiontConfig,
	DatabaseBlueprint,
	HydratedDatabaseConfig,
	HydratedSymbiontConfig,
	PageObjectResponse
} from './types.js';

// Export the config helper function
export { defineSymbiontConfig } from './types.js';

// Note: Server-only functions (loadConfig, syncFromNotion, handlePollBlogRequest) 
// are exported from './server.js' to prevent client-side bundling issues

export {
	GET_POST_BY_SLUG,
	createSymbiontGraphQLClient,
	getPostBySlug
} from './blog-client.js';

export type {
	GetPostBySlugResult,
	SymbiontGraphQLClientOptions
} from './blog-client.js';

// Note: blogLoad and createBlogLoad are server-only and exported from './server.js'

export { default as BlogPostPage } from './blog/BlogPostPage.svelte';