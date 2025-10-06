/**
 * Type declarations for virtual modules provided by the Symbiont Vite plugin.
 * 
 * The symbiontVitePlugin() generates these virtual modules at build time:
 * - 'virtual:symbiont/config' - Client-safe public configuration
 */

declare module 'virtual:symbiont/config' {
	import type { PublicSymbiontConfig } from './lib/types';
	const config: PublicSymbiontConfig;
	export default config;
}
