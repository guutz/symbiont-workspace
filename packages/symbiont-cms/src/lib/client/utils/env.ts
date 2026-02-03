import { env as publicEnv } from '$env/dynamic/public';

/**
 * Require a public environment variable (client-safe).
 * Can be used in both client and server code.
 * 
 * @param name - The environment variable name (must start with PUBLIC_)
 * @param hint - Optional hint for error message
 * @returns The environment variable value
 * @throws Error if the variable is missing
 */
export function requirePublicEnvVar(name: string, hint?: string): string {
	const value = publicEnv[name as keyof typeof publicEnv] ?? process.env[name];

	if (!value) {
		const suffix = hint ? ` ${hint}` : '';
		throw new Error(`Missing required public environment variable '${name}'.${suffix}`);
	}

	return value;
}
