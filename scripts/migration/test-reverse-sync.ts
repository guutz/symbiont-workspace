#!/usr/bin/env tsx
/**
 * Test script for reverse sync (DB → Notion)
 * 
 * Usage:
 *   cd packages/symbiont-cms
 *   pnpm tsx scripts/test-publish-to-notion.ts <notion-page-id> [--dry-run]
 * 
 * Environment variables needed:
 *   NHOST_ADMIN_SECRET
 *   NOTION_TOKEN (or specify in symbiont.config.js)
 */

import { createSyncOrchestrator, publishPostToNotion } from 'symbiont-cms/server';
import type { DatabaseBlueprint } from 'symbiont-cms';

const notionPageId = process.argv[2];
const isDryRun = process.argv.includes('--dry-run');

if (!notionPageId) {
  console.error('Usage: pnpm tsx scripts/test-publish-to-notion.ts <notion-page-id> [--dry-run]');
  process.exit(1);
}

console.log('\n🔄 Testing reverse sync (DB → Notion)\n');
console.log(`Notion Page ID: ${notionPageId}`);
console.log(`Dry Run: ${isDryRun}\n`);

// Mock config for testing
const testConfig: DatabaseBlueprint = {
  alias: 'test',
  dataSourceId: process.env.NOTION_DATABASE_ID || 'your-database-id',
  notionToken: process.env.NOTION_TOKEN || 'NOTION_TOKEN',
  isPublicRule: () => true,
  publishDateRule: () => null,
  slugRule: () => null
};

async function main() {
  try {
    // Create orchestrator to get NotionAdapter and PostRepository instances
    const orchestrator = createSyncOrchestrator(testConfig);
    
    // Access internal components (for testing only)
    const notionAdapter = (orchestrator as any).notionAdapter;
    const postRepository = (orchestrator as any).postRepository;
    
    await publishPostToNotion(
      notionPageId,
      testConfig,
      notionAdapter,
      postRepository,
      { dryRun: isDryRun }
    );
    
    console.log('\n✅ Test completed successfully!\n');
  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

main();
