# ID Usage Guide

## The Two IDs in Symbiont CMS

### 1. `notionDatabaseId` (Full Notion Database ID)
- **What**: The full UUID from Notion (e.g., `'6cc3888f-d9fa-4075-add9-b596e6fc44f3'`)
- **Source**: Hardcoded in `symbiont.config.js`
- **Purpose**: Identifies which Notion database to sync from
- **Used When**:
  - Calling Notion API (`notion.databases.query({ database_id: notionDatabaseId })`)
  - Receiving Notion webhooks (payload contains this ID)
  - Syncing slug back to Notion (`syncSlugToNotion()` needs this to find the right database config)

### 2. `short_db_ID` (Your Custom Source Identifier)
- **What**: Your chosen short identifier (e.g., `'tech-blog'`, `'personal-notes'`)
- **Source**: Hardcoded in `symbiont.config.js`
- **Database Column**: Stored as `source_id` in Postgres
- **Purpose**: Multi-tenant identifier - allows multiple Notion databases' content in one Postgres table
- **Used When**:
  - Querying GraphQL/Postgres (`where: { source_id: { _eq: short_db_ID } }`)
  - Inserting posts into database (`source_id: config.short_db_ID`)
  - Client-side queries (`getPosts()` uses `primaryShortDbId` from virtual config)

## Typical Flow: Translation Between IDs

### Sync Process (Notion → Database)
```
1. Start: Know the short_db_ID (from config)
2. Look up: Get notionDatabaseId from config using short_db_ID
3. Call Notion API: Use notionDatabaseId to query pages
4. Store in DB: Use short_db_ID as source_id column value
```

### Webhook Process (Notion → Database)
```
1. Start: Webhook payload has notionDatabaseId
2. Look up: Find config where config.notionDatabaseId matches
3. Get: config.short_db_ID from that config
4. Query DB: Use short_db_ID to check if post exists
5. Store in DB: Use short_db_ID as source_id column value
```

### Client Query (Database → User)
```
1. Start: Virtual config provides primaryShortDbId (which is a short_db_ID)
2. Query GraphQL: Filter by source_id = primaryShortDbId
3. Return: Posts from that specific Notion database
```

## Code Audit Results ✅

All usages are CORRECT:

### `webhook.ts` ✅
- **Line 28**: Receives `notionDatabaseId` from Notion webhook payload
- **Line 31**: Finds config by matching `notionDatabaseId` 
- **Line 41**: Uses `short_db_ID` to query GraphQL (correct - querying our DB)

### `notion.ts` ✅
- **Line 20**: Function parameter is `databaseConfigId` (actually the `notionDatabaseId`)
- **Line 23**: Finds config by matching `notionDatabaseId`
- Used to sync slug back to Notion (needs to know which config's rules to use)

### `sync.ts` ✅
- **Line 60**: Uses `short_db_ID` for GraphQL DELETE (correct - deleting from our DB)
- **Line 65**: Uses `notionDatabaseId` for Notion API query (correct - querying Notion)
- **Line 105**: Uses `short_db_ID` for GraphQL query (correct - querying our DB)

### `page-processor.ts` ✅
- **Line 51, 103**: Passes `config.notionDatabaseId` to `syncSlugToNotion()` 
- **Line 80, 172, 198**: Uses `config.short_db_ID` as `source_id` in GraphQL mutations

### `graphql.ts` ✅
- All GraphQL queries use `source_id` or `short_db_ID` (correct - querying Postgres)

### `queries.ts` (client) ✅
- Uses `short_db_ID` for GraphQL queries (correct - querying Postgres)

## Naming Consistency Recommendation

Current naming is GOOD and CLEAR:
- ✅ `notionDatabaseId` - Explicitly says "this is from Notion"
- ✅ `short_db_ID` - Explicitly says "this is our short identifier"
- ✅ `source_id` (in DB) - Legacy name, but consistent with GraphQL schema

**Do NOT rename** - the current naming makes it very clear which ID you're working with!

## Summary

The config is used as a **translation table**:
- **Notion** knows pages by `notionDatabaseId`
- **Postgres** knows posts by `source_id` (aka `short_db_ID`)
- **Config** provides the mapping between them

All current usage is correct! ✅
