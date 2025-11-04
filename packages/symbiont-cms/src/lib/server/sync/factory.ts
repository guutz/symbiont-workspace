import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import type { DatabaseBlueprint } from '../../types.js';
import { requireEnvVar } from '../../utils/env.js';
import { gqlAdminClient } from '../graphql.js';
import { NotionAdapter } from '../notion/adapter.js';
import { PostRepository } from './post-repository.js';
import { PostBuilder } from './post-builder.js';
import { SyncOrchestrator } from './orchestrator.js';

/**
 * Factory function to create a fully-wired SyncOrchestrator
 * 
 * This handles all the dependency injection:
 * - Notion client initialization
 * - GraphQL client setup
 * - Class instantiation in the correct order
 * 
 * @example
 * const orchestrator = createSyncOrchestrator(config);
 * await orchestrator.syncDataSource({ syncAll: true });
 */
export function createSyncOrchestrator(config: DatabaseBlueprint): SyncOrchestrator {
	// Initialize Notion client with datasource-specific token
	const notion = new Client({ auth: config.notionToken });
	const n2m = new NotionToMarkdown({ notionClient: notion });

	// Create adapter layer (Notion API)
	const notionAdapter = new NotionAdapter(notion, n2m);

	// Create repository layer (GraphQL/Database)
	// Note: gqlAdminClient is a lazy-initialized wrapper that loads config on first use
	const postRepository = new PostRepository(gqlAdminClient as any);

	// Create business logic layer (PostBuilder)
	const postBuilder = new PostBuilder(config, notionAdapter, postRepository);

	// Create orchestrator (coordination layer)
	const orchestrator = new SyncOrchestrator(
		notionAdapter,
		postBuilder,
		postRepository,
		config
	);

	return orchestrator;
}

/**
 * Create multiple orchestrators for multi-database sync
 * Keyed by alias for easy lookup
 */
export function createSyncOrchestrators(configs: DatabaseBlueprint[]): Map<string, SyncOrchestrator> {
	const orchestrators = new Map<string, SyncOrchestrator>();

	for (const config of configs) {
		orchestrators.set(config.alias, createSyncOrchestrator(config));
	}

	return orchestrators;
}
