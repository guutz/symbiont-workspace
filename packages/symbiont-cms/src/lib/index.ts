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

// GraphQL client utilities
export {
	GET_POST_BY_SLUG,
	GET_ALL_POSTS,
	createSymbiontGraphQLClient,
	getPostBySlug,
	getAllPosts,
	getPostsFromPrimarySource,
	getPostsFromAllSources
} from './client/queries.js';

export { requirePublicEnvVar } from './utils/env.js';

export type {
	GetPostBySlugResult,
	GetAllPostsResult,
	SymbiontGraphQLClientOptions
} from './client/queries.js';