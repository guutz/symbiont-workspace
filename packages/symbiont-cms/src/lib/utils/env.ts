import { env as privateEnv } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const FALLBACK_ENV = process.env as Record<string, string | undefined>;

export function readEnvVar(name: string): string | undefined {
	return privateEnv[name] ?? FALLBACK_ENV[name];
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
	const value = publicEnv[name as keyof typeof publicEnv] ?? FALLBACK_ENV[name];

	if (!value) {
		const suffix = hint ? ` ${hint}` : '';
		throw new Error(`Missing required public environment variable '${name}'.${suffix}`);
	}

	return value;
}
