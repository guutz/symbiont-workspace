# Notion Sync Architecture Refactor - Implementation Plan

**Date:** October 31, 2025  
**Status:** Planning → Implementation  
**Goal:** Simplify and clarify the Notion→Postgres sync logic

---

## Problems with Current Code

1. **Spaghetti Logic**: Sync flow scattered across 4 files (notion-ingest.ts, notion-helpers.server.ts, sync.ts, webhook.ts)
2. **Unclear Boundaries**: Business logic mixed with API calls and database operations
3. **Dead Code**: `sourceOfTruthRule` exists but does nothing (Tiptap editor not implemented)
4. **Slug Complexity**: Slug resolution logic tangled with sync orchestration
5. **Inconsistent Naming**: Mix of "database" and "dataSource" terminology
6. **Over-Engineering**: `dbNickname` adds layer of indirection without clear benefit

---

## Architectural Decisions

### 1. Class-Based Separation of Concerns

```
NotionAdapter (API layer)
    ↓
PostBuilder (Business logic)
    ↓
PostRepository (Database layer)
    ↓
SyncOrchestrator (Coordination)
```

**Benefits:**
- Clear responsibilities
- Easy to test (mock individual layers)
- Webhook and batch sync share code
- Slug logic consolidated in one place

### 2. Terminology Consistency

**Change all references from "database" to "dataSource":**

| Old | New | Reason |
|-----|-----|--------|
| `notionDatabaseId` | `notionDataSourceId` | Notion now calls them "data sources" |
| `dbNickname` | (remove) | Adds complexity without benefit - use `source_id` directly |
| `databaseId` (internal) | `dataSourceId` | Consistency |

### 3. Simplified Configuration Schema

```typescript
interface DatabaseBlueprint {
  // ============================================
  // REQUIRED
  // ============================================
  
  /** Unique source_id for this data source in Postgres/GraphQL */
  sourceId: string;
  
  /** Notion data source ID (from URL) */
  notionDataSourceId: string;
  
  // ============================================
  // PUBLISHING RULES
  // ============================================
  
  /** Boolean gate: determines IF a page should be published */
  isPublicRule?: (page: PageObjectResponse) => boolean;
  // Default: () => true
  
  /** Date extraction: determines WHEN a page should be published */
  publishDateRule?: (page: PageObjectResponse) => string | null;
  // Default: page.last_edited_time
  
  // ============================================
  // SLUG CONFIGURATION
  // ============================================
  
  /** Extract custom slug from Notion (return null for auto-generation) */
  slugRule?: (page: PageObjectResponse) => string | null;
  // Default: null (auto-generate from title)
  
  /** Notion property name to sync generated slugs back to */
  slugSyncProperty?: string | null;
  // Default: null (don't sync back)
  
  // ============================================
  // METADATA - Optional property mappings
  // ============================================
  
  /** Tags property name (must be multi_select) */
  tagsProperty?: string | null;
  // Default: null (no tags)
  
  /** Authors property name (people or multi_select) */
  authorsProperty?: string | null;
  // Default: null (no authors)
  
  // ============================================
  // FLEXIBLE METADATA - Pass-through to JSONB
  // ============================================
  
  /**
   * Extract arbitrary metadata to store in JSONB field
   * Use this for cover images, layout config, custom fields, etc.
   * 
   * @example
   * metadataExtractor: (page) => ({
   *   coverImage: page.properties['Cover']?.files?.[0]?.file?.url,
   *   homepageWeight: page.properties['Weight']?.number,
   *   featured: page.properties['Featured']?.checkbox
   * })
   */
  metadataExtractor?: (page: PageObjectResponse) => Record<string, any>;
  // Default: null (no extra metadata)
}
```

**Key Changes:**
- ✅ `dbNickname` removed - use `sourceId` directly
- ✅ `coverProperty` removed - use `metadataExtractor` instead
- ✅ No auto-detection for tags/authors (explicit only)
- ✅ Auto-detection ONLY for title (type: 'title') and unique_id (type: 'unique_id')
- ✅ Flexible `metadataExtractor` for any custom fields

**Example Config:**
```javascript
// Minimal
{
  sourceId: 'blog',
  notionDataSourceId: 'abc123...',
  isPublicRule: (page) => page.properties.Status?.select?.name === 'Published'
}

// With custom metadata
{
  sourceId: 'blog',
  notionDataSourceId: 'abc123...',
  isPublicRule: (page) => page.properties.Status?.select?.name === 'Published',
  tagsProperty: 'Tags',
  slugRule: (page) => page.properties.Slug?.rich_text?.[0]?.plain_text || null,
  slugSyncProperty: 'Slug',
  metadataExtractor: (page) => ({
    coverImage: page.properties['Cover']?.files?.[0]?.file?.url,
    weight: page.properties['Homepage Weight']?.number || 0,
    featured: page.properties['Featured']?.checkbox || false
  })
}
```

### 4. Database Schema Changes

**Current `posts` table uses UUID primary key** - unnecessary complexity.

**New approach:**
- Primary key: `notion_page_id` (already unique, already indexed)
- Keep `source_id` for multi-tenancy
- Remove separate `id` UUID column
- Add `metadata` JSONB column for flexible data

```sql
CREATE TABLE posts (
  notion_page_id TEXT NOT NULL,
  source_id TEXT NOT NULL,
  
  -- Core required fields
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT,
  
  -- Publishing
  publish_at TIMESTAMPTZ,
  
  -- Optional standard fields
  tags TEXT[],
  authors TEXT[],
  
  -- Flexible metadata (cover images, layout config, custom fields)
  metadata JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  PRIMARY KEY (notion_page_id, source_id),
  UNIQUE (source_id, slug)
);
```

**Migration Notes:**
- Keep notion_short_id if you want human-readable IDs in URLs
- Or use slugs as primary URLs (cleaner)
- metadata JSONB is indexed with GIN for fast queries

### 5. Source of Truth - Future Hook

**Current Decision:** Remove `sourceOfTruthRule` entirely until Tiptap editor exists.

**Future Design (when implementing bidirectional sync):**

```typescript
// Future config option
interface DatabaseBlueprint {
  /**
   * Determines sync direction for content
   * - 'NOTION': Notion → DB (current behavior)
   * - 'WEB_EDITOR': DB → Notion (when Tiptap implemented)
   * - Custom function for per-page logic
   */
  contentSourceRule?: 'NOTION' | 'WEB_EDITOR' | ((page: PageObjectResponse) => 'NOTION' | 'WEB_EDITOR');
}

// Implementation hook in PostBuilder
class PostBuilder {
  async buildPost(page: PageObjectResponse): Promise<PostData | null> {
    // ... existing logic ...
    
    // Future: Check content source
    const contentSource = this.resolveContentSource(page);
    
    if (contentSource === 'NOTION') {
      // Overwrite DB content from Notion
      content = await this.notionAdapter.pageToMarkdown(page.id);
    } else {
      // Preserve DB content, only update metadata
      const existing = await this.postRepository.getByNotionPageId(page.id, this.config.sourceId);
      content = existing?.content || ''; // Keep existing content
    }
  }
}
```

**Why this works:**
- Content sync decision separate from metadata sync
- Easy to add when needed
- Clear semantics: "where does content come from?"

---

## New File Structure

```
src/lib/server/
├── notion/
│   ├── adapter.ts           # Pure Notion API interactions
│   └── markdown-converter.ts # notion-to-md wrapper
│
├── sync/
│   ├── post-builder.ts      # Notion page → Post data transformation
│   ├── post-repository.ts   # Database operations (GraphQL)
│   ├── orchestrator.ts      # High-level sync coordination
│   └── types.ts             # Sync-specific types
│
├── graphql.ts               # GraphQL client + queries (keep)
├── load-config.ts           # Config loading (keep)
└── webhook.ts               # Webhook handlers (simplified)
```

**Files to DELETE:**
- ❌ `notion-ingest.ts` (logic moves to post-builder.ts)
- ❌ `notion-helpers.server.ts` (utility functions absorbed into classes)
- ❌ `sync.ts` (logic moves to orchestrator.ts)

---

## Implementation Classes

### 1. NotionAdapter
**Responsibility:** Talk to Notion API, convert to markdown

```typescript
export class NotionAdapter {
  constructor(private notion: Client, private n2m: NotionToMarkdown) {}
  
  async getPage(pageId: string): Promise<PageObjectResponse>
  async queryDataSource(dataSourceId: string, filter?: any): Promise<PageObjectResponse[]>
  async updateProperty(pageId: string, propertyName: string, value: any): Promise<void>
  async pageToMarkdown(pageId: string): Promise<string>
}
```

### 2. PostBuilder
**Responsibility:** Business logic (rules, slug resolution, transformation)

```typescript
export class PostBuilder {
  constructor(
    private config: DatabaseBlueprint,
    private notionAdapter: NotionAdapter,
    private postRepository: PostRepository
  ) {}
  
  async buildPost(page: PageObjectResponse): Promise<PostData | null> {
    // 1. Check publishing rules
    if (!this.shouldPublish(page)) return null;
    
    // 2. Extract metadata
    const meta = this.extractMetadata(page);
    
    // 3. Resolve slug (handles conflicts, sync-back)
    const slug = await this.resolveSlug(page, meta.title);
    
    // 4. Get content
    const content = await this.notionAdapter.pageToMarkdown(page.id);
    
    // 5. Build post data
    return {
      notion_page_id: page.id,
      source_id: this.config.sourceId,
      title: meta.title,
      slug,
      content,
      publish_at: this.getPublishDate(page),
      tags: meta.tags,
      authors: meta.authors,
      metadata: this.extractCustomMetadata(page)
    };
  }
  
  private shouldPublish(page: PageObjectResponse): boolean
  private extractMetadata(page: PageObjectResponse): { title: string; tags: string[]; authors: string[] }
  private async resolveSlug(page: PageObjectResponse, title: string): Promise<string>
  private getPublishDate(page: PageObjectResponse): string | null
  private extractCustomMetadata(page: PageObjectResponse): Record<string, any>
}
```

**Slug Resolution Logic (consolidated):**
```typescript
private async resolveSlug(page: PageObjectResponse, title: string): Promise<string> {
  // 1. Check for custom slug from Notion
  const customSlug = this.config.slugRule?.(page) ?? null;
  
  // 2. Check if page already exists in DB
  const existingPost = await this.postRepository.getByNotionPageId(
    page.id,
    this.config.sourceId
  );
  
  // 3. Determine final slug
  let slug: string;
  
  if (existingPost) {
    // Existing post - handle slug changes
    if (customSlug && customSlug !== existingPost.slug) {
      slug = await this.ensureUniqueSlug(customSlug);
    } else {
      slug = existingPost.slug; // Keep existing
    }
  } else {
    // New post - generate or use custom
    const baseSlug = customSlug || createSlug(title);
    slug = await this.ensureUniqueSlug(baseSlug);
  }
  
  // 4. Sync back to Notion if configured
  if (this.config.slugSyncProperty) {
    await this.notionAdapter.updateProperty(page.id, this.config.slugSyncProperty, slug);
  }
  
  return slug;
}

private async ensureUniqueSlug(baseSlug: string): Promise<string> {
  const existingPost = await this.postRepository.getBySlug(baseSlug, this.config.sourceId);
  
  if (!existingPost) return baseSlug;
  
  // Auto-resolve conflicts: try -2, -3, -4, etc.
  for (let i = 2; i <= 100; i++) {
    const numberedSlug = `${baseSlug}-${i}`;
    const conflict = await this.postRepository.getBySlug(numberedSlug, this.config.sourceId);
    if (!conflict) return numberedSlug;
  }
  
  // Fallback: use page ID
  return `${baseSlug}-${page.id.slice(-8)}`;
}
```

### 3. PostRepository
**Responsibility:** Database operations (GraphQL)

```typescript
export class PostRepository {
  constructor(private gqlClient: GraphQLClient) {}
  
  async getByNotionPageId(pageId: string, sourceId: string): Promise<Post | null>
  async getBySlug(slug: string, sourceId: string): Promise<Post | null>
  async getAllForSource(sourceId: string): Promise<Post[]>
  async upsert(post: PostData): Promise<void>
  async deleteForSource(sourceId: string): Promise<number>
}
```

### 4. SyncOrchestrator
**Responsibility:** Coordinate sync flow, handle errors, collect metrics

```typescript
export class SyncOrchestrator {
  constructor(
    private notionAdapter: NotionAdapter,
    private postBuilder: PostBuilder,
    private postRepository: PostRepository
  ) {}
  
  async syncDataSource(config: DatabaseBlueprint, options: SyncOptions): Promise<SyncSummary>
  async processPage(page: PageObjectResponse): Promise<void>
}
```

---

## Migration Strategy

### Phase 1: Create New Classes (Non-Breaking)
```bash
# Create new files alongside old ones
src/lib/server/notion/adapter.ts
src/lib/server/sync/post-builder.ts
src/lib/server/sync/post-repository.ts
src/lib/server/sync/orchestrator.ts

# Test in isolation with unit tests
```

### Phase 2: Update Webhook Handler (Low Risk)
```typescript
// webhook.ts - simplified
export async function handleNotionWebhookRequest(event: RequestEvent) {
  const config = await loadConfig();
  const orchestrator = createOrchestrator(config);
  
  const { pageId } = await event.request.json();
  const page = await notionAdapter.getPage(pageId);
  
  await orchestrator.processPage(page);
  
  return json({ success: true });
}
```

### Phase 3: Update Batch Sync (Low Risk)
```typescript
// New sync.ts - simplified
export async function syncFromNotion(options: SyncOptions) {
  const config = await loadConfig();
  const orchestrator = createOrchestrator(config);
  
  const results = await Promise.all(
    config.databases.map(db => orchestrator.syncDataSource(db, options))
  );
  
  return { summaries: results };
}
```

### Phase 4: Database Migration (Careful!)
```sql
-- Add metadata column
ALTER TABLE posts ADD COLUMN metadata JSONB;

-- Migrate existing layout_config to metadata
UPDATE posts SET metadata = jsonb_build_object('layout', layout_config);

-- Drop old column after verification
ALTER TABLE posts DROP COLUMN layout_config;
```

### Phase 5: Config Migration
```javascript
// Old config
{
  short_db_ID: 'blog',
  notionDatabaseId: 'abc123...',
  coverImagePropertyName: 'Cover'
}

// New config
{
  sourceId: 'blog',
  notionDataSourceId: 'abc123...',
  metadataExtractor: (page) => ({
    coverImage: page.properties.Cover?.files?.[0]?.file?.url
  })
}
```

### Phase 6: Delete Old Files
```bash
rm notion-ingest.ts
rm notion-helpers.server.ts
rm sync.ts (keep only new version)
```

---

## Testing Strategy

### Unit Tests (Per Class)
```typescript
// post-builder.test.ts
describe('PostBuilder', () => {
  it('should auto-generate slug from title', async () => {
    const mockNotion = createMockNotionAdapter();
    const mockRepo = createMockPostRepository();
    const builder = new PostBuilder(config, mockNotion, mockRepo);
    
    const post = await builder.buildPost(mockPage);
    expect(post.slug).toBe('test-post-title');
  });
  
  it('should resolve slug conflicts', async () => {
    const mockRepo = {
      getBySlug: vi.fn()
        .mockResolvedValueOnce({ slug: 'test' }) // First check: conflict
        .mockResolvedValueOnce(null) // Second check: test-2 available
    };
    // ...
  });
});
```

### Integration Tests (Full Flow)
```typescript
describe('Sync Flow', () => {
  it('should sync new post from Notion', async () => {
    const orchestrator = createOrchestrator(config);
    const summary = await orchestrator.syncDataSource(config.databases[0], {});
    
    expect(summary.processed).toBe(1);
    expect(summary.skipped).toBe(0);
  });
});
```

---

## Open Questions

### 1. Wipe Functionality
**Current:** URL parameter `?wipe=true` deletes all posts for a data source before syncing.

**Decision:** Keep as URL parameter (safer, explicit action required).

**Usage:**
```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  "http://localhost:5173/api/sync?wipe=true"
```

### 2. Webhook Security
**Current:** No signature verification (security hole!).

**Options:**
- A) Add Notion signature verification (proper, but complex)
- B) Use bearer token auth (simple, good enough)
- C) Both

**Recommendation:** Start with (B), add (A) later.

```typescript
// Simple bearer token protection
export async function handleNotionWebhookRequest(event: RequestEvent) {
  const token = event.request.headers.get('authorization')?.replace('Bearer ', '');
  if (token !== process.env.WEBHOOK_SECRET) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }
  // ... rest of handler
}
```

### 3. Unique ID Property
**Current:** Uses `notion_short_id` from Notion's unique_id property.

**Question:** Do you actually use this? Or is slug sufficient?

**Options:**
- A) Keep it (auto-detect if present)
- B) Remove it (simplify)
- C) Make it optional metadata

**My vote:** (A) - auto-detect but don't require it.

---

## Success Criteria

✅ All sync logic in clear, testable classes  
✅ Config schema simplified and documented  
✅ Webhook and batch sync share code  
✅ Slug resolution in one place  
✅ Auto-resolves conflicts (-2, -3, etc.)  
✅ Flexible metadata via JSONB  
✅ Terminology consistent (dataSource everywhere)  
✅ Old files deleted, no dead code  
✅ Migration path documented  
✅ Tests added for critical paths  

---

## Next Steps

1. **Review this memo** - confirm all decisions align with your vision
2. **Draft PostBuilder class** - implement slug resolution in detail
3. **Write unit tests** - test slug logic thoroughly
4. **Implement other classes** - NotionAdapter, PostRepository, Orchestrator
5. **Migration script** - update config schema, database schema
6. **Update docs** - reflect new architecture in INTEGRATION_GUIDE.md