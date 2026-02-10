# Supabase Migration Plan

**Date:** January 19, 2026  
**Status:** Planning  
**Decision:** Migrate from Nhost to Supabase + Vercel

---

## 🎯 Architecture

**From:**
```
Notion → Nhost (Postgres + Hasura GraphQL + Storage) → Vercel (SvelteKit)
```

**To:**
```
Notion → Supabase (Postgres + PostgREST + Storage + Realtime) → Vercel (SvelteKit)
```

**Future:**
- Collaborative editing via Supabase Realtime (instead of Hocuspocus)
- No additional services needed

---

## 🔑 Key Benefits

1. **Path-Based Storage:** `/images/2025/slug/cover.jpg` instead of file IDs
2. **Easy Backups:** Built-in point-in-time recovery + S3-compatible tools
3. **TypeScript API:** Type-safe PostgREST client (no query strings)
4. **Realtime:** Built-in collaborative features (no Hocuspocus needed)
5. **Better DX:** Excellent docs, CLI, dashboard
6. **Migration-Friendly:** Standard Postgres, easy to move in/out

---

## 📋 Migration Phases

### Phase 0: Preparation (Day 0) ✅ COMPLETED
- [x] Create Supabase account
- [x] Create new project (us-west-1 region)
- [x] Note credentials (project URL, anon key, service role key)
- [x] Install Supabase CLI locally (`brew install supabase/tap/supabase`)
- [x] Initialize Supabase project (`supabase init`)

### Phase 1: Database Migration (Day 1) ✅ COMPLETED

#### 1.1 Export from Nhost

**Get your password from `.env` or Nhost dashboard**, then run:

```bash
# Export schema only (table structures, indexes, constraints)
pg_dump "postgres://postgres:[YOUR-PASSWORD]@ygsdnfrbruuhtxczekur.db.us-west-2.nhost.run:5432/ygsdnfrbruuhtxczekur" \
  --schema-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  > nhost_schema.sql

# Export data only (all rows)
pg_dump "postgres://postgres:[YOUR-PASSWORD]@ygsdnfrbruuhtxczekur.db.us-west-2.nhost.run:5432/ygsdnfrbruuhtxczekur" \
  --data-only \
  --schema=public \
  --no-owner \
  --no-privileges \
  > nhost_data.sql

# Optional: Full backup (schema + data)
pg_dump "postgres://postgres:[YOUR-PASSWORD]@ygsdnfrbruuhtxczekur.db.us-west-2.nhost.run:5432/ygsdnfrbruuhtxczekur" \
  --schema=public \
  --no-owner \
  --no-privileges \
  > nhost_full_backup.sql
```

**Flags explained:**
- `--schema-only` / `--data-only` - Export structure or data separately
- `--schema=public` - Only export public schema (not internal Nhost tables)
- `--no-owner` - Don't include ownership commands (prevents permission errors on import)
- `--no-privileges` - Don't include GRANT/REVOKE commands

**Replace `[YOUR-PASSWORD]`** with your actual Nhost Postgres password.

#### 1.2 Create Schema in Supabase ✅

**Applied via SQL Editor:**
- Schema created from `supabase/schemas/symbiont_pages.sql`
- Includes all tables, indexes, constraints
- RLS (Row Level Security) policies applied

#### 1.3 Import Data ✅

**What Worked: Session Pooler Connection**

```bash
# Use Session Pooler (IPv4 compatible)
psql "postgresql://postgres.xguzskbxiptvhbyggkpl:[PASSWORD]@aws-1-us-west-1.pooler.supabase.com:5432/postgres" < nhost_data.sql
```

**Result:** `COPY 405` - Successfully imported 405 rows.

**Why Session Pooler?**
- Direct connection requires IPv6 (may not resolve on some networks)
- Session Pooler is IPv4 compatible and more reliable
- Format: `postgresql://postgres.<project-ref>:[PASSWORD]@aws-1-<region>.pooler.supabase.com:5432/postgres`

**Note:** SQL Editor doesn't work for large data files. Use psql with Session Pooler connection string.

#### 1.4 Verify Data
- [x] Check row counts match (405 rows imported)
- [x] Verify indexes exist (from schema)
- [x] Test PostgREST queries in API Docs

**Next Steps:**
- Clear data and regenerate via sync (images need Supabase Storage URLs)
- Run migration script to re-upload all images from Notion/Nhost to Supabase Storage

---

### Phase 2: Test PostgREST API (Day 1)

Supabase's PostgREST API is enabled by default - no setup needed!

#### 2.1 Test API in Dashboard

1. Go to Supabase Dashboard → API Docs
2. See auto-generated endpoints for all tables
3. Test queries in browser or with curl

#### 2.2 Test Basic Queries

```bash
# Get all pages (using anon key)
curl 'https://<project-ref>.supabase.co/rest/v1/pages?select=*' \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <anon-key>"

# Get specific page by slug
curl 'https://<project-ref>.supabase.co/rest/v1/pages?slug=eq.test-article&select=*' \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <anon-key>"
```

#### 2.3 TypeScript Types & End-User Setup Strategy

**Generating Types:**
```bash
# Generate types from live Supabase project
supabase gen types typescript --project-id <project-ref> > database.types.ts

# Or from local schema
supabase gen types typescript --local > database.types.ts
```

**End-User Setup Strategy:**

Symbiont adopters need:
1. Create Supabase project
2. Apply schema
3. Configure RLS policies
4. Get credentials (URL, anon key, service role key)
5. Add to config

**Approach A: Template Schema in Symbiont Package (Recommended)**

```
symbiont-cms/
  schemas/
    pages.sql          # Core pages table schema
    storage.sql        # Storage buckets and policies
    rls.sql           # RLS policies
  setup-scripts/
    init-supabase.sh  # Automated setup script
```

**Setup Flow:**
```bash
# User creates Supabase project, then:
cd my-blog
npx symbiont init

# Prompts:
# > Supabase project URL: https://xxx.supabase.co
# > Supabase anon key: eyJxxx...
# > Supabase service role key: eyJxxx...
# > Apply schema to Supabase? (Y/n)

# Generates:
# - symbiont.config.ts with Supabase credentials
# - Applies schema via Supabase Management API
# - Creates .env.example
# - Optionally generates database.types.ts
```

**TypeScript Types Strategy:**

**Option 1: Bake Types into Symbiont Package**
```typescript
// symbiont-cms/src/lib/database.types.ts (shipped with package)
export interface Database {
  public: {
    Tables: {
      pages: {
        Row: { page_id: string; title: string; /* ... */ };
        Insert: { /* ... */ };
        Update: { /* ... */ };
      };
    };
  };
}
```

**Pros:**
- ✅ Works out of the box
- ✅ No user setup needed
- ✅ Types always match schema

**Cons:**
- ❌ User can't extend schema easily
- ❌ Custom columns require forking types

**Option 2: Generate Types During User Setup (Recommended)**
```bash
# During `npx symbiont init`
supabase gen types typescript --project-id <user-project-ref> > src/lib/database.types.ts

# Add to .gitignore
echo "database.types.ts" >> .gitignore

# Regenerate types when schema changes
npx symbiont sync-types
```

**Pros:**
- ✅ Supports custom schema extensions
- ✅ Always matches user's actual database
- ✅ User can add custom columns/tables

**Cons:**
- ⚠️ Requires Supabase CLI installed
- ⚠️ User must regenerate types after schema changes

**Hybrid Approach (Best):**
- Ship base types with package (for core `pages` table)
- Allow user to override with generated types
- Provide `symbiont sync-types` command for convenience

```typescript
// symbiont-cms/src/lib/types.ts
export type Database = typeof import('./database.types').Database;

// User can override in their project:
// src/database.types.ts (generated, takes precedence)
```

**Recommendation for Initial Release:**
- Ship with baked-in types for core schema
- Document how to extend schema + regenerate types
- Add `symbiont sync-types` command in v2

---

### Phase 3: Update Symbiont CMS Code (Day 2)

#### 3.1 Install Supabase Client
```bash
cd packages/symbiont-cms
pnpm add @supabase/supabase-js
pnpm remove @nhost/nhost-js
```

#### 3.2 Update Types (`src/lib/types.ts`)

**Before:**
```typescript
export interface SymbiontConfig {
  nhost: {
    subdomain: string;
    region: string;
  };
  // ...
}
```

**After:**
```typescript
export interface SymbiontConfig {
  supabase: {
    url: string;         // https://<project-ref>.supabase.co
    anonKey: string;     // Public anon key
  };
  // ...
}

// Remove graphqlEndpoint since we're using PostgREST
export interface HydratedSymbiontConfig extends SymbiontConfig {
  // graphqlEndpoint no longer needed
}
```

#### 3.3 Update Config Loader (`src/lib/server/load-config.ts`)

**Before:**
```typescript
function buildGraphQLEndpoint(subdomain: string, region: string): string {
  return `https://${subdomain}.graphql.${region}.nhost.run/v1`;
}

return { ...config, graphqlEndpoint } as HydratedSymbiontConfig;
```

**After:**
```typescript
// No need to build GraphQL endpoint anymore
// PostgREST is accessed via Supabase client

export function loadConfig(): SymbiontConfig {
  const config = loadSymbiontConfig();
  
  // Validate supabase config
  if (!config.supabase?.url || !config.supabase?.anonKey) {
    throw new Error('Supabase config missing');
  }
  
  return config;
}
```

#### 3.4 Create Supabase Client Factory (`src/lib/server/supabase-client.ts`)

```typescript
import { createClient } from '@supabase/supabase-js';

export function createSupabaseClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}
```

#### 3.5 Update Queries (`src/lib/server/queries.ts`)

**Complete rewrite to use PostgREST TypeScript API:**

```typescript
// Before (Hasura GraphQL)
import { graphqlClient } from './graphql-client';

const GET_POSTS = `
  query GetPosts($limit: Int, $offset: Int) {
    pages(
      order_by: { publish_at: desc }
      limit: $limit
      offset: $offset
    ) {
      id
      slug
      title
      publish_at
      meta
      content
    }
  }
`;

export async function getAllPosts({ limit, offset }) {
  const result = await graphqlClient.request(GET_POSTS, { limit, offset });
  return result.pages;
}

// After (Supabase PostgREST)
import { createSupabaseClient } from './supabase-client';

export async function getAllPosts({ limit, offset }: { limit?: number; offset?: number }) {
  const supabase = createSupabaseClient();
  
  let query = supabase
    .from('pages')
    .select('*')
    .order('publish_at', { ascending: false });
  
  if (limit && offset !== undefined) {
    query = query.range(offset, offset + limit - 1);
  }
  
  const { data, error } = await query;
  
  if (error) throw new Error(`Failed to fetch posts: ${error.message}`);
  return data;
}

// Get single post by slug
export async function getPostBySlug({ slug }: { slug: string }) {
  const supabase = createSupabaseClient();
  
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('slug', slug)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') return null; // Not found
    throw new Error(`Failed to fetch post: ${error.message}`);
  }
  
  return data;
}

// Upsert post (insert or update)
export async function upsertPost(post: PostData) {
  const supabase = createSupabaseClient();
  
  const { data, error } = await supabase
    .from('pages')
    .upsert(post, {
      onConflict: 'datasource_id,slug',
      ignoreDuplicates: false
    })
    .select()
    .single();
  
  if (error) throw new Error(`Failed to upsert post: ${error.message}`);
  return data;
}
```

**Key Changes:**
- ❌ Remove all GraphQL query strings
- ❌ Remove GraphQL client
- ✅ Use Supabase client with chainable methods
- ✅ Type-safe queries
- ✅ Built-in error handling
- ✅ Simpler syntax

**PostgREST Query Patterns:**
```typescript
// Select with filters
.from('pages')
.select('id, slug, title')
.eq('status', 'published')
.gte('publish_at', '2025-01-01')
.order('publish_at', { ascending: false })
.limit(10)

// Insert
.from('pages')
.insert({ slug: 'test', title: 'Test' })
.select()

// Update
.from('pages')
.update({ title: 'New Title' })
.eq('slug', 'test')
.select()

// Delete
.from('pages')
.delete()
.eq('slug', 'test')
```

#### 3.6 Update Image Upload (`src/lib/server/image-upload.ts`)

**Before (Nhost):**
```typescript
await nhostClient.storage.upload({
  file,
  bucketId: 'default'
});
```

**After (Supabase):**
```typescript
await supabase.storage
  .from('images')
  .upload('2025/california-tech/slug/cover.jpg', file, {
    contentType: 'image/jpeg',
    cacheControl: '3600',
    upsert: false
  });

// Get public URL
const { data } = supabase.storage
  .from('images')
  .getPublicUrl('2025/california-tech/slug/cover.jpg');

return data.publicUrl;
```

**Key Changes:**
- Path-based uploads (no more file IDs!)
- Organize by year/site/slug
- Public URL is predictable

---

### Phase 4: Update California Tech Config (Day 2)

#### 4.1 Update `symbiont.config.js`

**Before:**
```javascript
export default {
  nhost: {
    subdomain: 'ygsdnfrbruuhtxczekur',
    region: 'us-west-2'
  },
  // ...
}
```

**After:**
```javascript
export default {
  supabase: {
    url: 'https://<project-ref>.supabase.co',
    anonKey: process.env.PUBLIC_SUPABASE_ANON_KEY // or hardcode if public
  },
  // ...
}
```

#### 4.2 Update `.env`

**Before:**
```bash
NHOST_ADMIN_SECRET=xxx
```

**After:**
```bash
PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
PUBLIC_SUPABASE_ANON_KEY=xxx # Safe to expose (public)
SUPABASE_SERVICE_ROLE_KEY=xxx # Secret, server-side only (for image uploads)
```

**Note:** No GraphQL endpoint needed - PostgREST is accessed via Supabase client.

#### 4.3 Update `.env.example`
```bash
# Supabase Configuration
PUBLIC_SUPABASE_URL=https://your-project.supabase.co
PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key # Server-side only

# Notion Configuration (unchanged)
NOTION_TOKEN=secret_xxx
CRON_SECRET=your-random-secret
```

---

### Phase 5: Storage Migration (Day 3)

#### 5.1 Create Storage Buckets
```sql
-- Run in Supabase SQL editor
INSERT INTO storage.buckets (id, name, public)
VALUES ('images', 'images', true);
```

Or via dashboard: Storage → New Bucket → "images" (public)

#### 5.2 Set Storage Policies
```sql
-- Allow public reads
CREATE POLICY "Public read access"
ON storage.objects FOR SELECT
USING (bucket_id = 'images');

-- Allow service role uploads (for sync process)
CREATE POLICY "Service role upload"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'images' AND auth.role() = 'service_role');
```

#### 5.2b Set Row Level Security (RLS) on Pages Table

**Enable RLS on pages table:**
```sql
-- Enable RLS
ALTER TABLE pages ENABLE ROW LEVEL SECURITY;

-- Allow public read access (only published pages)
CREATE POLICY "Public pages read access"
ON pages FOR SELECT
USING ((publish_at IS NOT NULL) AND (publish_at <= NOW()));

-- Allow service role full access (for sync process)
CREATE POLICY "Service role full access"
ON pages FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');
```

**Why RLS?**
- Secures database at row level (defense in depth)
- Service role key bypasses RLS for server-side operations
- Anon key respects RLS policies (read-only for public)
- Prevents accidental data exposure

**Testing RLS:**
```sql
-- As anon user (should work)
SELECT * FROM pages WHERE slug = 'test-article';

-- As anon user (should fail)
INSERT INTO pages (page_id, title, slug, datasource_id, datasource_alias, updated_at)
VALUES ('test', 'Test', 'test', 'test', 'test', NOW());

-- As service role (should work)
-- Use service_role key in Authorization header
```

#### 5.3 Re-upload Images from Nhost

**Script:** `scripts/migrate-images.ts`

```typescript
import { createClient as createNhostClient } from '@nhost/nhost-js';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const nhost = createNhostClient({ ... });
const supabase = createSupabaseClient( ... );

// Get all files from Nhost
const { files } = await nhost.storage.list();

for (const file of files) {
  // Download from Nhost
  const { fileMetadata } = await nhost.storage.getMetadata({ fileId: file.id });
  const response = await fetch(file.url);
  const blob = await response.blob();
  
  // Upload to Supabase with path structure
  // Use page slug + filename from metadata
  const path = `2025/california-tech/${fileMetadata.slug}/${file.name}`;
  
  await supabase.storage
    .from('images')
    .upload(path, blob, {
      contentType: file.mimeType,
      cacheControl: '3600'
    });
  
  console.log(`Migrated: ${file.name} → ${path}`);
}
```

#### 5.4 Update Database URLs

After images are migrated, update database to point to new Supabase URLs:

```sql
-- Update cover images in meta.cover
UPDATE pages
SET meta = jsonb_set(
  meta,
  '{cover}',
  to_jsonb(
    replace(
      meta->>'cover',
      'https://ygsdnfrbruuhtxczekur.storage.us-west-2.nhost.run/v1/files/',
      'https://<project-ref>.supabase.co/storage/v1/object/public/images/'
    )
  )
)
WHERE meta->>'cover' IS NOT NULL;

-- Similar for markdown content URLs (if any)
-- This is more complex, need to parse markdown
```

---

### Phase 6: Testing (Day 3-4)

#### 6.1 Local Testing
```bash
# Start california-tech with new Supabase config
cd packages/california-tech
pnpm dev

# Verify:
# - Homepage loads posts
# - Post pages render
# - Cover images display
# - Sync endpoint works
```

#### 6.2 Test Sync (After Data Regeneration)

**Note:** After code migration, clear existing data and regenerate via sync:

```sql
-- Clear old data (with Nhost URLs)
DELETE FROM pages;
```

**Then trigger full sync:**
```bash
# Trigger manual sync (re-fetches all pages from Notion)
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:5173/api/sync/poll-blog

# Verify:
# - All posts from Notion appear in Supabase
# - Images upload to Supabase Storage with correct paths
# - Cover images use Supabase URLs
# - Content images use Supabase URLs
```

#### 6.3 Test Queries
```typescript
// Test getAllPosts
const posts = await getAllPosts({ fetch });
console.log('Posts:', posts.length);

// Test getPostBySlug
const post = await getPostBySlug({ fetch, slug: 'test-article' });
console.log('Post:', post?.title);
```

---

### Phase 7: Deployment (Day 4)

#### 7.1 Update Vercel Environment Variables
```bash
# In Vercel dashboard or CLI
vercel env add PUBLIC_SUPABASE_URL production
vercel env add PUBLIC_SUPABASE_ANON_KEY production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add NOTION_TOKEN production
vercel env add CRON_SECRET production

# Remove old Nhost vars
vercel env rm NHOST_ADMIN_SECRET production
vercel env rm PUBLIC_NHOST_GRAPHQL_URL production
```

#### 7.2 Deploy to Vercel
```bash
git add .
git commit -m "feat: migrate to Supabase"
git push origin main

# Vercel auto-deploys from main
```

#### 7.3 Verify Production
- [ ] Visit tech.caltech.edu
- [ ] Homepage loads
- [ ] Post pages work
- [ ] Images load from Supabase Storage
- [ ] Trigger sync, verify new content appears

#### 7.4 Update Cron Job (if using)
```bash
# If using cron service (like Vercel Cron or external)
# Point to new domain/endpoint
# Ensure CRON_SECRET is set
```

---

### Phase 8: Cleanup (Day 5)

#### 8.1 Verify Everything Works
- [ ] All posts visible
- [ ] All images load
- [ ] Sync working
- [ ] No errors in logs

#### 8.2 Monitor for 24-48 Hours
- Check Vercel logs
- Check Supabase logs
- Monitor error rates

#### 8.3 Decommission Nhost (After Verification)
- [ ] Download final backup
- [ ] Cancel Nhost subscription
- [ ] Update docs

---

## 🔄 Rollback Plan

If issues arise during migration:

### Quick Rollback (< 1 hour)
```bash
# Revert git commit
git revert HEAD
git push origin main

# Restore Vercel env vars
vercel env add NHOST_ADMIN_SECRET production
vercel env add PUBLIC_NHOST_GRAPHQL_URL production
```

### Data Rollback
- Nhost data still intact (don't delete until verified)
- Can re-import from Nhost dump if needed

---

## 📊 Migration Checklist

### Pre-Migration
- [ ] Backup Nhost database (pg_dump)
- [ ] List all Nhost Storage files
- [ ] Document current env vars
- [ ] Create Supabase project
- [ ] Test Supabase locally

### Database
- [ ] Export Nhost schema
- [ ] Export Nhost data
- [ ] Import to Supabase
- [ ] Verify row counts
- [ ] Test PostgREST queries

### Code Changes
- [ ] Install @supabase/supabase-js
- [ ] Remove @nhost/nhost-js
- [ ] Update types.ts (remove graphqlEndpoint)
- [ ] Update load-config.ts (remove graphqlEndpoint construction)
- [ ] Update queries.ts (rewrite for PostgREST)
- [ ] Update image-upload.ts (use Supabase Storage)
- [ ] Update factory.ts (initialize Supabase client)
- [ ] Remove graphql-client.ts (no longer needed)

### Storage
- [ ] Create Supabase bucket
- [ ] Set storage policies
- [ ] Migrate images from Nhost
- [ ] Update database URLs
- [ ] Verify images accessible

### Configuration
- [ ] Update symbiont.config.js
- [ ] Update .env
- [ ] Update .env.example
- [ ] Update Vercel env vars

### Testing
- [ ] Local dev works
- [ ] Sync works
- [ ] Images load
- [ ] No console errors
- [ ] Production deploy
- [ ] Production verification

### Cleanup
- [ ] Monitor 24-48h
- [ ] Final Nhost backup
- [ ] Cancel Nhost subscription
- [ ] Update documentation

---

## 🚀 Future: Collaborative Editing with Supabase Realtime

After migration is stable, implement collaborative features:

### Setup Realtime Channel
```typescript
// In Tiptap editor component
const channel = supabase.channel('post-123')
  .on('broadcast', { event: 'cursor' }, (payload) => {
    // Update other users' cursor positions
  })
  .on('broadcast', { event: 'content' }, (payload) => {
    // Merge content changes
  })
  .subscribe()

// Broadcast local changes
channel.send({
  type: 'broadcast',
  event: 'content',
  payload: { delta: changes }
})
```

### CRDT Strategy
Options:
1. **Yjs** (same as Hocuspocus) + custom Supabase provider
2. **Automerge** + Supabase Realtime
3. **Simple operational transforms** (if basic needs)

**Recommendation:** Start simple, add CRDT if multi-user conflicts become issue.

---

## 📝 Notes

### API Differences

**Hasura GraphQL (Nhost):**
```graphql
query {
  pages(where: { status: { _eq: "published" } }, order_by: { publish_at: desc }) {
    id
    slug
    title
  }
}
```

**PostgREST (Supabase):**
```typescript
await supabase
  .from('pages')
  .select('id, slug, title')
  .eq('status', 'published')
  .order('publish_at', { ascending: false });
```

**Why PostgREST:**
- ✅ No query string parsing
- ✅ Type-safe TypeScript API
- ✅ Chainable methods
- ✅ Built-in error handling
- ✅ Easier to test and debug

### Storage Organization

Recommended path structure:
```
images/
  2025/
    california-tech/
      article-slug-1/
        cover.jpg
        image-1.jpg
        image-2.jpg
      article-slug-2/
        cover.jpg
  2024/
    california-tech/
      ...
```

Benefits:
- ✅ Year-based organization
- ✅ Site-specific folders (multi-tenant ready)
- ✅ Article-specific folders (easy to find)
- ✅ Human-readable URLs
- ✅ Easy backup/restore

---

## 💰 Cost Comparison

### Nhost
- Free: 1GB DB, 1GB storage
- Pro: $25/mo (8GB DB, 100GB storage)

### Supabase
- Free: 500MB DB, 1GB storage, 2GB bandwidth
- Pro: $25/mo (8GB DB, 100GB storage, 200GB bandwidth)

**Verdict:** Similar pricing, comparable features.

---

## 📚 Resources

- [Supabase Docs](https://supabase.com/docs)
- [Supabase Storage Guide](https://supabase.com/docs/guides/storage)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)
- [PostgREST API](https://postgrest.org/en/stable/)
- [pg_graphql Extension](https://github.com/supabase/pg_graphql)
- [Migration from Nhost](https://supabase.com/docs/guides/migrations)

---

## 🎯 Success Criteria

- [ ] All posts display correctly
- [ ] All images load from Supabase Storage
- [ ] Notion sync working
- [ ] Cover images working
- [ ] No errors in production logs
- [ ] Performance same or better than Nhost
- [ ] Zero downtime during migration

---

**Timeline:** 4-5 days  
**Risk Level:** Medium (data migration always has risk)  
**Reversibility:** High (Nhost backup available for rollback)

**Next Step:** Create Supabase project and start Phase 0 (Preparation)

---

**Last Updated:** January 19, 2026
