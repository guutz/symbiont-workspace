// Client-side exports for symbiont-cms

export { default as Renderer } from './components/Renderer.svelte';
export { default as Editor } from './components/Editor.svelte';
export { default as BlogPostPage } from './components/BlogPostPage.svelte';

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

export { defineSymbiontConfig } from './types.js';

export {
	GET_POST_BY_SLUG,
	createSymbiontGraphQLClient,
	getPostBySlug
} from './client/queries.js';

export type {
	GetPostBySlugResult,
	SymbiontGraphQLClientOptions
} from './client/queries.js';