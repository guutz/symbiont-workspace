import path from 'path';
import fs from 'fs';
import type { SymbiontConfig } from '../types.js';
import { createLogger } from './utils/logger.js';

/**
 * Loads the full symbiont.config.js (including server-only rules and functions).
 * 
 * ⚠️ SERVER-ONLY - Will fail if called client-side (no process.cwd()).
 * 
 * @returns Full configuration including database rules and functions
 */
export async function loadServerConfig(): Promise<SymbiontConfig> {
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

	// Validate required fields
	for (const db of config.databases) {
		if (!db.alias) {
			throw new Error('Each database must have an "alias" field (e.g., "blog", "docs")');
		}
		if (!db.dataSourceId) {
			throw new Error(`Database "${db.alias}" missing required "dataSourceId" field`);
		}
		if (!db.notionToken) {
			throw new Error(`Database "${db.alias}" missing required "notionToken" field`);
		}
	}	// No validation needed for rules - both are optional and work together
	// isPublicRule defaults to () => true
	// publishDateRule defaults to reading 'Publish Date' property
	
	return config;
}

/**
 * Get a datasource configuration by its alias.
 * 
 * @param alias - The human-readable datasource alias (e.g., 'blog', 'docs')
 * @returns The database configuration including dataSourceId and notionToken
 */
export async function getSourceByAlias(alias: string): Promise<SymbiontConfig['databases'][0]> {
	const logger = createLogger({ 
		operation: 'get_source_by_alias',
		alias 
	});
	
	const config = await loadServerConfig();
	const source = config.databases.find((db: any) => db.alias === alias);
	
	if (!source) {
		logger.error({ 
			event: 'datasource_not_found', 
			alias,
			available_aliases: config.databases.map((db: any) => db.alias)
		});
		throw new Error(
			`No datasource configured with alias "${alias}". ` +
			`Available aliases: ${config.databases.map((db: any) => db.alias).join(', ')}`
		);
	}
	
	logger.debug({ event: 'datasource_found', alias, dataSourceId: source.dataSourceId });
	return source;
}

/**
 * @deprecated Use getSourceByAlias() instead
 */
export async function loadDatabaseConfig(shortDbId: string): Promise<SymbiontConfig['databases'][0] | void> {
	const logger = createLogger({ 
		operation: 'load_database_config',
		shortDbId 
	});
	
	logger.warn({ 
		event: 'deprecated_function_called',
		message: 'loadDatabaseConfig() is deprecated, use getSourceByAlias() instead'
	});
	
	return getSourceByAlias(shortDbId);
}