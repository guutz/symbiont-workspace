import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import type { DatabaseBlueprint } from '../../types.js';
import type { SymbiontClient } from '../../client.js';
import { requireEnvVar } from '../utils/env.server.js';
import { NotionAdapter } from '../notion/adapter.js';
import { PostRepository } from './post-repository.js';
import { PostBuilder } from './post-builder.js';
import { SyncOrchestrator } from './orchestrator.js';

/**
 * Factory function to create a fully-wired SyncOrchestrator
 * 
 * This handles all the dependency injection:
 * - Notion client initialization (with token resolution)
 * - Database client setup
 * - Class instantiation in the correct order
 * 
 * @param client - Symbiont client instance
 * @param config - Database configuration blueprint
 * 
 * @example
 * const orchestrator = createSyncOrchestrator(client, dbConfig);
 * await orchestrator.syncDataSource({ syncAll: true });
 */
export function createSyncOrchestrator(
	client: SymbiontClient,
	config: DatabaseBlueprint
): SyncOrchestrator {
	const notionToken = requireEnvVar("NOTION_TOKEN");
	const serviceRoleKey = requireEnvVar("SUPABASE_SERVICE_ROLE_KEY");
	
	// Initialize Notion client with resolved token
	const notion = new Client({ auth: notionToken });
	const n2m = new NotionToMarkdown({ notionClient: notion });

	// Create adapter layer (Notion API)
	const notionAdapter = new NotionAdapter(notion, n2m);

	// Create repository layer (Database) with Supabase admin client
	const postRepository = new PostRepository(
		client.config.supabase.url,
		serviceRoleKey
	);

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
