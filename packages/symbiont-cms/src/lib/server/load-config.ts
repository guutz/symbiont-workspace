import path from 'path';
import fs from 'fs';
import type { SymbiontConfig } from '../types.js';
import { createLogger } from '../utils/logger.js';

/**
 * Loads the full symbiont.config.js (including server-only rules and functions).
 * 
 * ⚠️ SERVER-ONLY - Will fail if called client-side (no process.cwd()).
 * 
 * @returns Full configuration including database rules and functions
 */
export async function loadConfig(): Promise<SymbiontConfig> {
	const logger = createLogger({ operation: 'load_config' });
	const cwd = process.cwd();
	const configPaths = [
		path.resolve(cwd, 'symbiont.config.js'),
		path.resolve(cwd, 'symbiont.config.mjs')
	];
	
	const configPath = configPaths.find(p => fs.existsSync(p));
	
	if (!configPath) {
		logger.error({ 
			event: 'config_not_found',
			searched_paths: configPaths
		});
		throw new Error(
			'Could not find symbiont.config.js in project root.\n' +
			'Create a symbiont.config.js file to configure Symbiont CMS.'
		);
	}
	
	logger.debug({ event: 'config_found', path: configPath });
	
	const module = await import(/* @vite-ignore */ configPath);
	const config: SymbiontConfig = module.default;
	
	// Validate databases array exists and has at least one entry
	if (!config.databases || config.databases.length === 0) {
		logger.error({ 
			event: 'config_invalid',
			reason: 'No databases configured'
		});
		throw new Error(
			'symbiont.config.js must have at least one database configured in the databases array.'
		);
	}
	
	// Set primaryShortDbId to first database's dbNickname if not explicitly set
	if (!config.primaryShortDbId) {
		config.primaryShortDbId = config.databases[0].dbNickname;
		logger.debug({ 
			event: 'primary_db_defaulted',
			primaryShortDbId: config.primaryShortDbId
		});
	}
	
	// No validation needed for rules - both are optional and work together
	// isPublicRule defaults to () => true
	// publishDateRule defaults to reading 'Publish Date' property
	
	return config;
}

export async function loadDatabaseConfig(shortDbId: string) : Promise<SymbiontConfig['databases'][0] | void> {
	const logger = createLogger({ 
		operation: 'load_database_config',
		shortDbId 
	});
	
	const config = await loadConfig();
	const dbConfig = config.databases.find(db => db.dbNickname === shortDbId);
	
	if (!dbConfig) {
		logger.error({ 
			event: 'database_config_not_found', 
			shortDbId 
		});
		return;
	}
	
	return dbConfig;
}