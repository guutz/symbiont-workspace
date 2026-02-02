// Client-side exports for symbiont-cms

export { default as Editor } from './components/Editor.svelte';
export { default as PageHead } from './components/PageHead.svelte';
export { default as PageMeta } from './components/PageMeta.svelte';
export { default as TOC } from './components/TOC.svelte';

// Config helper for type-safe .js configs
export { defineConfig } from './config.js';

// Client initialization
export { createSymbiontClient } from './client.js';
export type { SymbiontClient, GetPageOptions, GetAllPagesOptions } from './client.js';

export type {
	ClassMap,
	DatabasePage,
	WebsitePage,
	FrontMatterLayout,
	TocItem,
	SyncResult,
	SymbiontConfig,
	DatabaseBlueprint,
	HydratedDatabaseConfig,
	HydratedSymbiontConfig,
	PageObjectResponse
} from './types.js';

// Public environment utilities (client-safe)
export { requirePublicEnvVar } from './client/utils/env.js';

// Image zoom utilities (optional, requires medium-zoom to be installed separately)
export { initializeImageZoom, imageZoom } from './client/image-zoom.js';
export type { ImageZoomOptions } from './client/image-zoom.js';
