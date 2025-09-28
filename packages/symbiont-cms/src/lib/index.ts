// Reexport your entry components here

// This file defines the public API of your @symbiont/cms package.

export { default as Renderer } from './Renderer.svelte';
export { default as Editor } from './Editor.svelte';

// Add `Post` to the list of exported types
export type {
	ClassMap,
	Post,
	SymbiontConfig,
	DatabaseBlueprint,
	HydratedDatabaseConfig,
	HydratedSymbiontConfig
} from './types.ts';

// Export the config loader function
export { loadConfig } from './config-loader.ts';

// Export the poll blog handler
export { handlePollBlogRequest } from './handlers';

export {
	GET_POST_BY_SLUG,
	createSymbiontGraphQLClient,
	getPostBySlug
} from './blog-client.ts';

export type {
	GetPostBySlugResult,
	SymbiontGraphQLClientOptions
} from './blog-client.ts';

export {
	createBlogLoad,
	load as blogLoad
} from './blog';

export type {
	BlogServerLoad,
	BlogLoadOptions
} from './blog';

export { BlogPostPage } from './blog';
