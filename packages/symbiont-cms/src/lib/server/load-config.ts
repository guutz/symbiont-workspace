import path from 'path';
import fs from 'fs';
import type { SymbiontConfig } from '../types.js';

/**
 * Loads the full symbiont.config.js (including server-only rules and functions).
 * 
 * ⚠️ SERVER-ONLY - Will fail if called client-side (no process.cwd()).
 * 
 * @returns Full configuration including database rules and functions
 */
export async function loadConfig(): Promise<SymbiontConfig> {
	const cwd = process.cwd();
	const configPaths = [
		path.resolve(cwd, 'symbiont.config.js'),
		path.resolve(cwd, 'symbiont.config.mjs')
	];
	
	const configPath = configPaths.find(p => fs.existsSync(p));
	
	if (!configPath) {
		throw new Error(
			'Could not find symbiont.config.js in project root.\n' +
			'Create a symbiont.config.js file to configure Symbiont CMS.'
		);
	}
	
	const module = await import(/* @vite-ignore */ configPath);
	return module.default;
}
