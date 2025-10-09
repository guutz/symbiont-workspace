// Client-side exports for symbiont-cms

export { default as Editor } from './components/Editor.svelte';

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

// Config loading (client-safe, returns PublicSymbiontConfig)
export { loadConfig } from './client/load-config.js';

// Image zoom utilities (optional, requires medium-zoom to be installed separately)
export { initializeImageZoom, imageZoom } from './client/image-zoom.js';
export type { ImageZoomOptions } from './client/image-zoom.js';