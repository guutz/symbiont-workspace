/**
 * Type declarations for virtual modules provided by Symbiont (DEPRECATED).
 * 
 * ⚠️ The virtual module pattern has been replaced with createSymbiontClient().
 * 
 * New pattern:
 * ```ts
 * // src/lib/symbiont.ts
 * import { createSymbiontClient } from 'symbiont-cms';
 * import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
 * 
 * export const symbiont = createSymbiontClient({
 *   supabase: { url: PUBLIC_SUPABASE_URL, publishableKey: PUBLIC_SUPABASE_ANON_KEY },
 *   databases: [...]
 * });
 * ```
 * 
 * This file is kept for backwards compatibility only.
 */

declare module 'virtual:symbiont/config' {
	/** @deprecated Use createSymbiontClient() instead */
	const config: any;
	export default config;
}
