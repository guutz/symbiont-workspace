import type { PublicSymbiontConfig } from '../types.js';

/**
 * Loads the public, client-safe configuration.
 * This can be called from anywhere (client or server).
 * 
 * @returns Public configuration (graphqlEndpoint, sourceIds, primarySourceId)
 */
export async function loadConfig(): Promise<PublicSymbiontConfig> {
	const config: PublicSymbiontConfig = await import('virtual:symbiont/config').then(m => m.default);
	return config;
}
