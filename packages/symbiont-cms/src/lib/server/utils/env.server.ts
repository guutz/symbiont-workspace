import { env as privateEnv } from '$env/dynamic/private';

/**
 * Read an environment variable (server-only).
 * Tries SvelteKit's dynamic env first, then falls back to process.env.
 * 
 * @param name - The environment variable name
 * @returns The environment variable value or undefined
 */
export function readEnvVar(name: string): string | undefined {
	// Try SvelteKit's dynamic env first, then fall back to process.env
	// Note: privateEnv is a Proxy that returns undefined in tests/Node contexts
	return privateEnv[name] ?? process.env[name];
}

/**
 * Require an environment variable (server-only).
 * 
 * @param name - The environment variable name
 * @param hint - Optional hint for error message
 * @returns The environment variable value
 * @throws Error if the variable is missing
 */
export function requireEnvVar(name: string, hint?: string): string {
	const value = readEnvVar(name);

	if (!value) {
		const suffix = hint ? ` ${hint}` : '';
		throw new Error(`Missing required environment variable '${name}'.${suffix}`);
	}

	return value;
}

/**
 * Resolve a Notion token from config (server-only).
 * Can be:
 * - An env var name (e.g., 'NOTION_TOKEN') - will be resolved from environment
 * - An actual token value (e.g., 'secret_abc123...') - used as-is
 * - Omitted/undefined/empty - defaults to NOTION_TOKEN env var
 * 
 * @param tokenValue - The value from config.notionToken
 * @param alias - The database alias for error messages
 * @returns The resolved token
 * @throws Error if token cannot be resolved
 */
export function resolveNotionToken(tokenValue: string | undefined, alias: string): string {
	// If provided and not empty, check if it's an env var name first
	if (tokenValue && tokenValue.trim()) {
		const fromEnv = readEnvVar(tokenValue);
		if (fromEnv) {
			return fromEnv; // It was an env var name!
		}
		// Not an env var, assume it's the actual token
		return tokenValue;
	}
	
	// No token provided or empty string, try default NOTION_TOKEN
	const defaultToken = readEnvVar('NOTION_TOKEN');
	if (!defaultToken) {
		throw new Error(
			`Missing notionToken for database '${alias}'. ` +
			`Either set NOTION_TOKEN environment variable or specify notionToken in your config.`
		);
	}
	return defaultToken;
}
