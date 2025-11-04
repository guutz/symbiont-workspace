# Database Schema Update - `pages` Table

**Date:** November 2, 2025  
**Status:** ✅ **COMPLETE**

---

## 🎯 Summary

Replaced the old `posts` table with a cleaner `pages` table that:
- ✅ Uses `page_id` as primary key (simpler than UUID)
- ✅ Uses `datasource_id` instead of `source_id` (clearer naming)
- ✅ Stores tags/authors as JSONB arrays (more flexible)
- ✅ Has `meta` JSONB column for flexible metadata
- ✅ Includes proper indexes for Hasura/GraphQL performance

---

## 📊 Schema Comparison

### Old `posts` table
```sql
CREATE TABLE public.posts (
  id UUID PRIMARY KEY,                    -- Unnecessary extra layer
  source_id TEXT NOT NULL,                -- Less clear naming
  notion_page_id TEXT NOT NULL,           -- Should be primary key!
  notion_short_id TEXT NOT NULL,          -- Rarely used
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT,
  publish_at TIMESTAMPTZ,
  tags TEXT[],                            -- Arrays, not JSONB
  authors TEXT[],                         -- Arrays, not JSONB
  layout_config JSONB,                    -- Limited metadata
  UNIQUE (source_id, slug),
  UNIQUE (source_id, notion_page_id)
);
```

### New `pages` table ✨
```sql
CREATE TABLE public.pages (
  page_id TEXT PRIMARY KEY,               -- ✅ Notion UUID is the key
  datasource_id TEXT NOT NULL,            -- ✅ Clearer naming
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT,
  publish_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  tags JSONB DEFAULT '[]'::jsonb,         -- ✅ JSONB for flexibility
  authors JSONB DEFAULT '[]'::jsonb,      -- ✅ JSONB for flexibility
  meta JSONB DEFAULT '{}'::jsonb,         -- ✅ Flexible metadata
  UNIQUE (datasource_id, slug)            -- ✅ Slug unique per datasource
);

-- ✅ Performance indexes (Hasura uses these!)
CREATE INDEX idx_pages_datasource ON pages(datasource_id);
CREATE INDEX idx_pages_datasource_slug ON pages(datasource_id, slug);
CREATE INDEX idx_pages_publish_at ON pages(publish_at);
CREATE INDEX idx_pages_meta ON pages USING GIN (meta);
CREATE INDEX idx_pages_tags ON pages USING GIN (tags);
```

---

## 🔑 Key Decisions

### 1. ✅ `datasource_id` is NOT unique
**Why:** Multiple pages come from the same Notion database
```
datasource_id: 'blog-posts'  ← 100 pages share this
datasource_id: 'projects'    ← 50 pages share this
```

### 2. ✅ Slug must be unique PER datasource
**Why:** URLs need to be unique within each datasource
```
UNIQUE (datasource_id, slug)

✅ Allowed:
  - datasource: 'blog',   slug: 'hello-world'
  - datasource: 'projects', slug: 'hello-world'

❌ Not allowed:
  - datasource: 'blog', slug: 'hello-world'
  - datasource: 'blog', slug: 'hello-world'  ← Duplicate!
```

### 3. ✅ Indexes are CRITICAL for Hasura
**Why:** GraphQL queries need fast lookups

Without indexes:
```graphql
query GetPost($datasource: String!, $slug: String!) {
  pages(where: { 
    datasource_id: { _eq: $datasource },
    slug: { _eq: $slug }
  }) { title }
}
# ⚠️ Full table scan (slow with 1000+ posts)
```

With indexes:
```sql
CREATE INDEX idx_pages_datasource_slug ON pages(datasource_id, slug);
# ✅ Direct lookup (fast!)
```

---

## 🔄 Code Changes

### Updated Files

#### 1. **PostRepository** (`sync/post-repository.ts`)
- ✅ Changed `posts` → `pages` table
- ✅ Changed `notion_page_id` → `page_id`
- ✅ Changed `source_id` → `datasource_id`
- ✅ Updated all GraphQL queries
- ✅ Updated constraint: `pages_datasource_id_slug_key`

#### 2. **PostBuilder** (`sync/post-builder.ts`)
- ✅ Changed `notion_page_id` → `page_id`
- ✅ Changed `source_id` → `datasource_id`
- ✅ Removed `notion_short_id` (not needed)
- ✅ Changed `metadata` → `meta`

#### 3. **PostData Interface**
```typescript
// Old
export interface PostData {
  notion_page_id: string;
  source_id: string;
  notion_short_id?: string | null;
  metadata?: Record<string, any> | null;
}

// New ✅
export interface PostData {
  page_id: string;
  datasource_id: string;
  meta?: Record<string, any> | null;
}
```

#### 4. **Post Type** (`types.ts`)
```typescript
export type Post = {
  page_id?: string;           // ✅ Notion UUID
  datasource_id?: string;     // ✅ Database ID
  title: string | null;
  slug: string;
  content: string | null;
  publish_at: string | null;
  tags?: any[] | null;        // ✅ JSONB array
  authors?: any[] | null;     // ✅ JSONB array
  meta?: Record<string, any> | null; // ✅ Flexible metadata
  // ... rest
};
```

---

## 📝 Migration Path

### For New Installations
Just run the migration:
```bash
cd nhost
nhost up
```

### For Existing Installations (⚠️ Has Data)
You'll need a data migration:

```sql
-- Step 1: Create new pages table (already done via migration)

-- Step 2: Copy data from posts → pages
INSERT INTO public.pages (
  page_id,
  datasource_id,
  title,
  slug,
  content,
  publish_at,
  updated_at,
  tags,
  authors,
  meta
)
SELECT 
  notion_page_id,
  source_id,
  title,
  slug,
  content,
  publish_at,
  updated_at,
  to_jsonb(tags),      -- Convert TEXT[] to JSONB
  to_jsonb(authors),   -- Convert TEXT[] to JSONB
  COALESCE(layout_config, '{}'::jsonb) -- Migrate layout_config to meta
FROM public.posts;

-- Step 3: Verify data copied correctly
SELECT COUNT(*) FROM pages;
SELECT COUNT(*) FROM posts;

-- Step 4: Drop old table (CAREFUL!)
-- DROP TABLE public.posts;
```

---

## 🎯 Benefits

### Performance
- ✅ **Faster queries** - Indexes on common lookup patterns
- ✅ **Simpler primary key** - No extra UUID lookup
- ✅ **GIN indexes** - Fast JSONB queries

### Flexibility
- ✅ **JSONB metadata** - Store any custom fields in `meta`
- ✅ **JSONB arrays** - Rich tag/author data (not just strings)
- ✅ **No schema changes** - Add fields to `meta` without migrations

### Clarity
- ✅ **Clear naming** - `datasource_id` > `source_id`
- ✅ **Simpler model** - Removed rarely-used fields
- ✅ **Better constraints** - One composite unique key

---

## 🚀 Next Steps

1. **Test queries** in Hasura console:
   ```graphql
   query {
     pages(where: { datasource_id: { _eq: "blog" }}) {
       page_id
       title
       slug
     }
   }
   ```

2. **Verify indexes** are being used:
   ```sql
   EXPLAIN ANALYZE 
   SELECT * FROM pages 
   WHERE datasource_id = 'blog' AND slug = 'hello-world';
   ```
   Should show "Index Scan using idx_pages_datasource_slug"

3. **Update frontend queries** to use new field names

4. **(Optional) Migrate data** if you have existing posts

---

## 📚 Related Docs

- `.docs/REFACTOR_COMPLETE.md` - Sync architecture refactor
- `.docs/Symbiont_Refactor_Memo_Oct31.md` - Original design memo
- `nhost/migrations/default/1762037533950_create_table_public_pages/` - Migration files
