import type { SymbiontConfig } from './types.js';

/**
 * Helper function for defining Symbiont configuration with full TypeScript type checking.
 * 
 * Use this in your symbiont.config.js file for autocomplete and type safety:
 * 
 * @example
 * ```js
 * // symbiont.config.js
 * import { defineConfig } from 'symbiont-cms/config';
 * 
 * export default defineConfig({
 *   graphqlEndpoint: 'https://your-project.nhost.run/v1/graphql',
 *   databases: [
 *     {
 *       short_db_ID: 'blog',
 *       notionDatabaseId: 'abc123...',
 *       // ... full autocomplete here!
 *     }
 *   ]
 * });
 * ```
 */
export function defineConfig(config: SymbiontConfig): SymbiontConfig {
	return config;
}
