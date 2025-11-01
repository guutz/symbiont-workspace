import type { Plugin } from 'vite';
import path from 'path';
import fs from 'fs';

const VIRTUAL_MODULE_ID = 'virtual:symbiont/config';
const RESOLVED_VIRTUAL_MODULE_ID = '\0' + VIRTUAL_MODULE_ID;

/**
 * Vite plugin that reads symbiont.config.js at build time and extracts
 * only the public, client-safe configuration data.
 * 
 * This creates a virtual module 'virtual:symbiont/config' that can be
 * imported anywhere (client or server) and contains only:
 * - graphqlEndpoint
 * - primaryShortDbId (explicit config value or first database's dbNickname)
 * - shortDbIds[] (all databases' dbNicknames)
 * 
 * All server-only data (functions, rules) stays in the original config
 * and is never exposed to the client bundle.
 * 
 * **Note**: Only .js config files are supported. Use `defineConfig()` from
 * 'symbiont-cms/config' for full TypeScript autocomplete in .js files.
 */
export function symbiontVitePlugin(): Plugin {
	return {
		name: 'symbiont-virtual-config',
		
		resolveId(id: string) {
			if (id === VIRTUAL_MODULE_ID) {
				return RESOLVED_VIRTUAL_MODULE_ID;
			}
		},
		
		async load(id: string) {
			if (id === RESOLVED_VIRTUAL_MODULE_ID) {
				try {
					// Look for config file (.js or .mjs only)
					const cwd = process.cwd();
					const configPaths = [
						{ path: path.resolve(cwd, 'symbiont.config.js'), ext: '.js' },
						{ path: path.resolve(cwd, 'symbiont.config.mjs'), ext: '.mjs' }
					];
					
					// Check for .ts file and provide helpful error
					const tsConfigPath = path.resolve(cwd, 'symbiont.config.ts');
					if (fs.existsSync(tsConfigPath)) {
						throw new Error(
							'Found symbiont.config.ts but only .js configs are supported.\n\n' +
							'Please rename your config to .js:\n' +
							'  mv symbiont.config.ts symbiont.config.js\n\n' +
							'Use `defineConfig()` from "symbiont-cms/config" for full TypeScript autocomplete:\n\n' +
							'  import { defineConfig } from "symbiont-cms/config";\n' +
							'  export default defineConfig({ ... });\n'
						);
					}
					
					const configEntry = configPaths.find(c => fs.existsSync(c.path));
					
					if (!configEntry) {
						throw new Error(
							'Could not find symbiont.config.js in project root.\n\n' +
							'Create a symbiont.config.js file to configure Symbiont CMS.\n' +
							'Use `defineConfig()` for full TypeScript autocomplete:\n\n' +
							'  import { defineConfig } from "symbiont-cms/config";\n' +
							'  export default defineConfig({ ... });'
						);
					}
					
					// Load config using standard import (works in dev and build)
					const configUrl = new URL(`file://${configEntry.path}`);
					const configModule = await import(configUrl.href + '?t=' + Date.now());
					const config = configModule.default;
					
					if (!config) {
						throw new Error(`Config file ${configEntry.path} must export a default object`);
					}
					
					// Extract ONLY public data (no functions, no secrets)
					const primaryShortDbId = config.primaryShortDbId || config.databases?.[0]?.dbNickname || '';
					const shortDbIds = config.databases?.map((db: any) => db.dbNickname) || [];

					const publicConfig = {
						graphqlEndpoint: config.graphqlEndpoint,
						primaryShortDbId,
						shortDbIds
					};
					
					// Return as a static module with only JSON data
					return `export default ${JSON.stringify(publicConfig, null, 2)};`;
				} catch (error) {
					// Provide helpful error message
					const errorMessage = error instanceof Error ? error.message : String(error);
					throw new Error(
						`Failed to load Symbiont config: ${errorMessage}\n\n` +
						`Make sure you have a symbiont.config.js file in your project root.`
					);
				}
			}
		},
		
		// Enable HMR for config changes during development
		handleHotUpdate({ file, server }) {
			if (file.match(/symbiont\.config\.(js|mjs)$/)) {
				// Invalidate the virtual module so it reloads with new config
				const module = server.moduleGraph.getModuleById(RESOLVED_VIRTUAL_MODULE_ID);
				if (module) {
					server.moduleGraph.invalidateModule(module);
				}
				return [];
			}
		}
	};
}

// Export type for virtual module (for TypeScript autocomplete)
export interface VirtualSymbiontConfig {
	graphqlEndpoint: string;
	primaryShortDbId: string;
	shortDbIds: string[];
}
