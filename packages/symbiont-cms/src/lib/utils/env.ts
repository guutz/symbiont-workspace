import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

export function readEnvVar(name: string): string | undefined {
	// Try SvelteKit's dynamic env first, then fall back to process.env
	// Note: privateEnv is a Proxy that returns undefined in tests/Node contexts
	return privateEnv[name] ?? process.env[name];
}

export function requireEnvVar(name: string, hint?: string): string {
	const value = readEnvVar(name);

	if (!value) {
		const suffix = hint ? ` ${hint}` : '';
		throw new Error(`Missing required environment variable '${name}'.${suffix}`);
	}

	return value;
}

export function requirePublicEnvVar(name: string, hint?: string): string {
	const value = publicEnv[name as keyof typeof publicEnv] ?? process.env[name];

	if (!value) {
		const suffix = hint ? ` ${hint}` : '';
		throw new Error(`Missing required public environment variable '${name}'.${suffix}`);
	}

	return value;
}

/**
 * Resolve a Notion token from config.
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
