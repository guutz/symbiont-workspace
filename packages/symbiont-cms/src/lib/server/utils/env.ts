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
