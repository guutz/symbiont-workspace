import path from 'path';
import type { DatabaseBlueprint, HydratedDatabaseConfig, HydratedSymbiontConfig, SymbiontConfig } from './types.js';
import { readEnvVar } from './env.js';

function resolveDatabaseId(db: DatabaseBlueprint): HydratedDatabaseConfig {
	const { databaseIdEnvVar, databaseId, ...rules } = db;

	const resolvedId = databaseId ?? (databaseIdEnvVar && readEnvVar(databaseIdEnvVar));

	if (!resolvedId) {
		const hint = databaseIdEnvVar
			? `Set the ${databaseIdEnvVar} environment variable (e.g. in Vercel) or provide a databaseId directly.`
			: 'Provide a databaseId.';
		throw new Error(`Database ID for config '${rules.id}' is missing. ${hint}`);
	}

	return { ...rules, databaseId: resolvedId };
}

/**
 * Dynamically loads the symbiont.config.ts file from the project root,
 * resolves environment variables referenced by name in the blueprint and returns
 * the fully hydrated config.
 * 
 * This is a server-only function that should not be imported on the client.
 */
export async function loadConfig(): Promise<HydratedSymbiontConfig> {
	const configPath = path.resolve(process.cwd(), 'symbiont.config.ts');
	const module = await import(/* @vite-ignore */ configPath);
	const config: SymbiontConfig = module.default;

	return {
		databases: config.databases.map(resolveDatabaseId)
	};
}