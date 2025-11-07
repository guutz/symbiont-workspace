import type { DatabaseBlueprint } from '../types.js';
import { loadServerConfig } from './load-config.js';
import { createLogger } from './utils/logger.js';
import { createSyncOrchestrator } from './sync/factory.js';
import type { SyncSummary, SyncOptions } from './sync/orchestrator.js';

/**
 * Sync content from Notion databases to Nhost
 * 
 * Refactored to use new SyncOrchestrator architecture
 */
export async function syncFromNotion(
	options: { 
		databaseId?: string | null; 
		since?: string | null; 
		syncAll?: boolean; 
		wipe?: boolean;
	} = {}
): Promise<{ since: string | null; summaries: SyncSummary[] }> {

	const logger = createLogger({ operation: 'sync' });
	logger.info({ event: 'sync_started', options });
	
	const config = await loadServerConfig();

	const sinceIso = options.syncAll ? null : options.since || new Date(Date.now() - 5 * 60 * 1000).toISOString();
	const targetDatabases = getTargetDatabases(config.databases, options.databaseId);

	if (targetDatabases.length === 0) {
		const hint = options.databaseId
			? `No database matched '${options.databaseId}'. Check symbiont.config.ts for valid ids.`
			: 'No databases configured.';
		logger.error({ event: 'sync_failed', reason: 'no_databases', hint });
		throw new Error(hint);
	}

	// Create sync options for orchestrator
	const syncOptions: SyncOptions = {
		since: sinceIso,
		syncAll: options.syncAll || false,
		wipe: options.wipe || false
	};

	// Sync each database using new orchestrator
	const summaries: SyncSummary[] = [];
	for (const dbConfig of targetDatabases) {
		const dbLogger = logger.child({ alias: dbConfig.alias, dataSourceId: dbConfig.dataSourceId });
		try {
			const orchestrator = createSyncOrchestrator(dbConfig);
			const summary = await orchestrator.syncDataSource(syncOptions);
			summaries.push(summary);
		} catch (err: any) {
			const message = err?.message ?? 'Unknown error';
			dbLogger.error({ 
				event: 'database_sync_failed', 
				error: message,
				stack: err?.stack 
			});
			summaries.push({
				alias: dbConfig.alias,
				dataSourceId: dbConfig.dataSourceId,
				processed: 0,
				skipped: 0,
				failed: 0,
				status: 'error',
				details: message
			});
		}
	}

	logger.info({ 
		event: 'sync_finished', 
		databases_synced: summaries.length,
		summaries 
	});
	return { since: sinceIso, summaries };
}

/**
 * Filter databases based on provided ID (alias or dataSourceId)
 */
function getTargetDatabases(
	databases: DatabaseBlueprint[],
	filterId: string | null | undefined
): DatabaseBlueprint[] {

	if (!filterId) return databases;
	return databases.filter((db) => 
		db.alias === filterId || 
		db.dataSourceId === filterId
	);
}
