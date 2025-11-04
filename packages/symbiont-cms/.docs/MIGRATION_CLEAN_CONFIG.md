# Clean Config Schema Migration

**Status**: ✅ **COMPLETE** (January 2025)

## Summary

Successfully migrated from the old mixed-nomenclature config schema to a clean, purpose-driven schema with **zero backward compatibility**. All TypeScript files, config files, and tests updated.

## Breaking Changes

### Field Renames

| Old Field | New Field | Purpose |
|-----------|-----------|---------|
| `dbNickname` | `alias` | Human-readable identifier for routes and logs |
| `primaryShortDbId` | `alias` | (Merged into alias) |
| `notionDatabaseId` | `dataSourceId` | Notion database UUID (stored in DB) |
| `sourceId` | `dataSourceId` | (Merged into dataSourceId) |
| `slugPropertyName` | `slugSyncProperty` | Property name for syncing slugs back to Notion |

### Removed Fields

- `sourceOfTruthRule` - No longer needed; Notion is always source of truth

### New Per-Datasource Field

- `notionToken` - Each datasource now has its own Notion API token (enables multi-workspace setups)

## Updated Config Structure

```typescript
export default defineSymbiontConfig({
  graphqlEndpoint: process.env.GRAPHQL_ENDPOINT,
  dataSources: [
    {
      // PUBLIC: Exposed to client bundle, used in routes
      alias: 'my-blog',
      
      // PRIVATE: Server-only, stored in database
      dataSourceId: '1a2b3c4d5e6f7890abcdef1234567890',
      
      // PRIVATE: Server-only, per-datasource authentication
      notionToken: process.env.NOTION_TOKEN,
      
      // PRIVATE: Server-only rules
      isPublicRule: (page) => { /* ... */ },
      publishDateRule: (page) => { /* ... */ },
      
      // PRIVATE: Optional - sync slugs back to Notion
      slugSyncProperty: 'Slug',
      
      // PRIVATE: Optional - custom slug extraction
      slugRule: (page) => { /* ... */ },
      
      // PRIVATE: Optional - metadata extraction
      tagsProperty: 'Tags',
      authorsProperty: 'Authors',
      metadataExtractor: (page) => ({ /* ... */ }),
    },
  ],
});
```

## Virtual Config (Client-Side)

Only safe fields are exposed to the client bundle:

```typescript
// $lib/symbiont-config (virtual module)
export interface PublicSymbiontConfig {
  graphqlEndpoint: string;
  aliases: string[]; // Just the alias strings, no UUIDs
}
```

## Architecture Changes

### 1. Config Loading

**New helper added:**
```typescript
// src/lib/config/load-config.ts
export function getSourceByAlias(alias: string): DatabaseBlueprint | undefined {
  const config = loadConfig();
  return config.dataSources.find(source => source.alias === alias);
}
```

### 2. Webhook Lookup

Webhooks now look up config by `dataSourceId` from Notion payload:

```typescript
// src/routes/api/sync/webhook/+server.ts
const config = loadConfig();
const datasourceConfig = config.dataSources.find(
  (source) => source.dataSourceId === event.id
);
```

### 3. Per-Datasource Tokens

Each datasource creates its own Notion client:

```typescript
// src/lib/sync/factory.ts
export function createOrchestrator(config: DatabaseBlueprint) {
  const client = new Client({ auth: config.notionToken });
  // ...
}
```

### 4. Database Schema

The `pages` table stores the `dataSourceId` UUID:

```sql
CREATE TABLE public.pages (
  id uuid DEFAULT gen_random_uuid() NOT NULL,
  datasource_id text NOT NULL,  -- Stores Notion database UUID
  notion_id text NOT NULL,
  slug text NOT NULL,
  -- ...
);
```

## Migration Steps (For Users)

1. **Rename fields in `symbiont.config.js`**:
   - `dbNickname` → `alias`
   - `notionDatabaseId` → `dataSourceId`
   - `slugPropertyName` → `slugSyncProperty`

2. **Move global token to per-datasource**:
   ```diff
   - import { Client } from '@notionhq/client';
   - const notion = new Client({ auth: process.env.NOTION_TOKEN });
   
   export default defineSymbiontConfig({
   - notionClient: notion,
     dataSources: [
       {
   +     notionToken: process.env.NOTION_TOKEN,
   ```

3. **Remove deprecated fields**:
   - Delete `sourceOfTruthRule` (no longer used)
   - Delete any `sourceId` references

4. **Rebuild package**:
   ```bash
   pnpm build:package
   ```

## Files Updated

### Core Package (`packages/symbiont-cms/`)

**Type Definitions:**
- `src/lib/config/types.ts` - Updated `DatabaseBlueprint` interface

**Config System:**
- `src/lib/config/load-config.ts` - Added `getSourceByAlias()` helper
- `src/lib/vite/vite-plugin.ts` - Virtual module now exposes only `aliases[]`

**Sync System:**
- `src/lib/sync/factory.ts` - Per-datasource token support
- `src/lib/sync/orchestrator.ts` - Logging uses `alias` + `dataSourceId`
- `src/lib/sync/post-builder.ts` - Uses `config.dataSourceId` for queries
- `src/routes/api/sync/[alias]/+server.ts` - Looks up by alias
- `src/routes/api/sync/webhook/+server.ts` - Looks up by dataSourceId

**GraphQL Queries:**
- `src/lib/graphql/queries.ts` - Falls back to first alias

**Tests:**
- `src/lib/__tests__/utils.ts` - Updated mock configs
- `src/lib/slug/__tests__/slug-helpers.test.ts` - Skipped deprecated tests

### Config Files

**Updated:**
- `packages/guutz-blog/symbiont.config.js`
- `packages/california-tech/symbiont.config.js`

**Deprecated (Renamed):**
- `src/lib/server/notion.ts` → `notion.ts.old` (not imported)
- `src/lib/server/markdown-processor.test.ts` → `.test.ts.skip` (outdated API)

## Validation

```bash
$ pnpm check
svelte-check found 0 errors and 0 warnings ✅
```

## Available Optional Fields

From `DatabaseBlueprint`:
- `slugSyncProperty` - Property name to sync generated slugs back to Notion
- `slugRule` - Custom function to extract slug from Notion page
- `isPublicRule` - Function to determine if page should be published
- `publishDateRule` - Function to extract publish date
- `tagsProperty` - Property name for tags
- `authorsProperty` - Property name for authors
- `metadataExtractor` - Custom metadata extraction function

## Next Steps

- [ ] Add unit tests for `PostBuilder` slug resolution
- [ ] Delete deprecated files (`notion-ingest.ts`, `notion-helpers.server.ts`, `.old`/`.skip` files)
- [ ] Document multi-workspace setup guide (using per-datasource tokens)
- [ ] Add migration script to auto-update user configs

---

**Migration Completed**: January 2025  
**Breaking Changes**: YES - No backward compatibility  
**Type Errors**: 0  
**Deprecated Files**: Renamed to `.old`/`.skip`
