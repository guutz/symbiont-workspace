// Client-side exports for symbiont-cms

export { default as Renderer } from './components/Renderer.svelte';
export { default as Editor } from './components/Editor.svelte';
export { default as PostPage } from './components/PostPage.svelte';

// Config helper for type-safe .js configs
export { defineConfig } from './config.js';

export type {
	ClassMap,
	Post,
	SyncSummary,
	SymbiontConfig,
	DatabaseBlueprint,
	HydratedDatabaseConfig,
	HydratedSymbiontConfig,
	PageObjectResponse,
	PublicSymbiontConfig
} from './types.js';

// GraphQL client utilities (new simple API)
export {
	getPosts,
	getPost,
	GET_POST_BY_SLUG,
	GET_ALL_POSTS,
	createSymbiontGraphQLClient,
	getPostBySlug,
	getAllPosts
} from './client/queries.js';

export type {
	GetPostsOptions,
	GetPostBySlugResult,
	GetAllPostsResult,
	SymbiontGraphQLClientOptions
} from './client/queries.js';

// Config loading (client-safe, returns PublicSymbiontConfig)
export { loadConfig } from './client/load-config.js';

// Image zoom utilities (optional, requires medium-zoom to be installed separately)
export { initializeImageZoom, imageZoom } from './client/image-zoom.js';
export type { ImageZoomOptions } from './client/image-zoom.js';