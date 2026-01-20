# Backend Platform Evaluation for Symbiont CMS

**Date:** January 18, 2026  
**Status:** Evaluation Phase  
**Context:** Cover image sync implementation revealed storage limitations

---

## 🎯 Executive Summary

While implementing cover image sync from Notion, we identified limitations with Nhost Storage that prompted a broader evaluation of backend platforms. This memo evaluates alternatives considering:

1. **Storage UX** - Path-based access vs file-ID-based
2. **Backup/Migration** - Ease of data portability
3. **Platform Consolidation** - All-in-one vs multi-service
4. **Future Features** - Collaborative editing (Hocuspocus/Tiptap)

**Current Stack:**
- **Backend:** Nhost (Postgres + Hasura GraphQL + Storage)
- **Frontend Hosting:** Vercel (SvelteKit SSR)
- **Content Source:** Notion API

**Key Finding:** Supabase offers superior storage UX while maintaining feature parity with Nhost, but collaborative editing requires separate service regardless.

---

## 📍 Current Issues with Nhost Storage

### File Access by ID Only

**Nhost Storage URLs:**
```
https://ygsdnfrbruuhtxczekur.storage.us-west-2.nhost.run/v1/files/abc-123-uuid-456
```

**Problems:**
- ❌ No path-based organization (`/images/2025/slug/cover.jpg`)
- ❌ Can't browse files intuitively
- ❌ File ID is opaque - no indication of content
- ❌ Difficult to backup (requires GraphQL queries to map IDs → metadata)
- ❌ Migration complexity (all IDs change if moving platforms)
- ❌ Can't manually inspect/organize files in bucket

### Current Workarounds Considered

**Option A: Proxy API Endpoint**
```
Your Site: /api/images/2025/slug/cover.jpg
  ↓ Query by filename
Nhost: /v1/files/abc-123-uuid
```

**Issues:**
- Adds latency (extra hop)
- Requires deployment before images work
- Complex for new Symbiont adopters
- Doesn't solve backup/migration concerns

**Option B: Hash-Based Deduplication**
```
1. Download image from Notion
2. Calculate SHA-256 hash
3. Query Nhost: "Do we have this hash?"
4. If yes → reuse URL, if no → upload
```

**Benefits:**
- ✅ Avoids duplicate uploads
- ✅ Works immediately in local dev
- ✅ Notion URLs never break (stay in Notion)

**Still doesn't solve:**
- File organization/browsing
- Backup complexity
- Migration difficulty

---

## 🔍 Notion URL Clarification

**Initial Concern:** Notion CDN URLs expire after 1 hour, requiring us to replace them with permanent URLs.

**Reality:** Notion auto-refreshes URLs internally. They only expire if accessed externally after 1 hour without refresh.

**Implication:** Less urgent to replace Notion URLs. Main reason for permanent storage is:
- Database needs stable URLs (don't want to re-fetch from Notion on every page load)
- Frontend needs reliable image access
- Backup/archival purposes

---

## 🌐 Platform Evaluation

### Option 1: Supabase (Recommended)

**Features:**
- ✅ **Postgres** (same as Nhost)
- ✅ **GraphQL** (`pg_graphql` extension, similar to Hasura)
- ✅ **Storage** (path-based, S3-compatible)
- ✅ **Auth** (similar to Nhost Auth)
- ✅ **Realtime** (Postgres changes → WebSocket)
- ✅ **Edge Functions** (Deno-based)
- ✅ **Excellent CLI** with migrations
- ✅ **Built-in backups** (point-in-time recovery)

**Storage Example:**
```typescript
// Upload with path structure
await supabase.storage
  .from('images')
  .upload('2025/california-tech/article-slug/cover.jpg', file);

// Get public URL
const { data } = supabase.storage
  .from('images')
  .getPublicUrl('2025/california-tech/article-slug/cover.jpg');

// URL format:
// https://proj.supabase.co/storage/v1/object/public/images/2025/slug/cover.jpg
```

**Storage Features:**
- ✅ Path-based organization (like S3)
- ✅ Public/private buckets
- ✅ RLS (Row Level Security)
- ✅ Easy backup (standard S3-compatible tools)
- ✅ Browse files in dashboard
- ✅ Manual file management possible

**Migration from Nhost:**
1. Export Postgres schema + data (pg_dump)
2. Create Supabase project
3. Import schema + data
4. Update `symbiont-cms` to use `@supabase/supabase-js` client
5. Re-upload images with proper path structure
6. Update GraphQL endpoint config

**What Changes:**
- Client library (Nhost → Supabase)
- Storage API calls
- GraphQL endpoint URL

**What Stays Same:**
- Postgres queries (95%+ compatible)
- GraphQL API structure (both use Hasura-style)
- SvelteKit app logic
- Notion sync logic

**Pricing:**
- **Free Tier:** 500MB DB, 1GB storage, 2GB bandwidth
- **Pro:** $25/mo (8GB DB, 100GB storage, 200GB bandwidth)

**Collaborative Editing:**
- ❌ Edge Functions can't run Hocuspocus (Deno, short-lived)
- ✅ Has Supabase Realtime (WebSocket broadcast)
- ⚠️ Would need custom Tiptap integration (not drop-in Hocuspocus)

---

### Option 2: Firebase

**Features:**
- ❌ **No Postgres** (Firestore NoSQL or Realtime Database)
- ❌ **No native GraphQL**
- ✅ Storage (path-based, GCS)
- ✅ Auth
- ✅ Hosting
- ✅ Functions

**Why Not:**
- Fundamentally different data model (NoSQL)
- Would require complete rewrite of queries
- No GraphQL layer

**Verdict:** ❌ Not suitable for relational data model

---

### Option 3: Cloudflare

**Features:**
- ⚠️ **D1** (SQLite at edge, not Postgres)
- ❌ **No native GraphQL** (need custom implementation)
- ✅ **R2 Storage** (S3-compatible, zero egress fees)
- ✅ **Pages/Workers** (excellent hosting)
- ✅ **Durable Objects** (stateful edge computing)

**Considerations:**
- Different SQL dialect (SQLite vs Postgres)
- Would need to build GraphQL layer (or use REST)
- Durable Objects could run collaborative editing (complex)

**Pricing:**
- Very cost-effective (especially R2 storage)
- No egress fees on R2

**Why Not (For Now):**
- Significant rewrite (Postgres → SQLite)
- No ready-made GraphQL
- More DIY approach

**Future Consideration:**
- If migrating to edge-native architecture
- If GraphQL becomes unnecessary

**Verdict:** ⚠️ Future option, too much rewrite now

---

### Option 4: Railway

**Features:**
- ✅ **Postgres** (native)
- ⚠️ **No GraphQL** (need to add Hasura/PostGraphile)
- ⚠️ **No built-in storage** (need S3/R2/etc)
- ✅ **Excellent hosting** (Node.js, persistent processes)
- ✅ **Can run Hocuspocus** natively

**Considerations:**
- More DIY than Supabase/Nhost
- Would need separate storage solution
- Could run everything (DB + API + Hocuspocus + SvelteKit)

**Pricing:**
- Usage-based, ~$5-20/mo for small projects

**Why Not:**
- More setup than Supabase
- Storage still needs separate solution

**Verdict:** ⚠️ Good for Hocuspocus, but not all-in-one

---

### Option 5: Hybrid Approaches

#### 5a. Nhost (Current) + Separate Storage

**Keep:**
- Nhost for Postgres + GraphQL

**Add:**
- **Cloudflare R2** (S3-compatible, zero egress)
- **Backblaze B2** (cheaper than AWS S3)
- **AWS S3** (standard, but egress costs)

**Pros:**
- ✅ Minimal migration
- ✅ Better storage UX
- ✅ Keep existing GraphQL setup

**Cons:**
- ❌ More services to manage
- ❌ More config complexity

---

#### 5b. Supabase + Railway (Hocuspocus)

**Architecture:**
```
Notion → Supabase (DB + Storage + Auth)
         ↓
      Vercel (SvelteKit SSR)
         ↓
      Railway (Hocuspocus WebSocket server)
```

**Pros:**
- ✅ Best storage UX (Supabase)
- ✅ Native Hocuspocus support (Railway)
- ✅ Keep Vercel for frontend

**Cons:**
- ❌ Three platforms to manage

**Cost:**
- Supabase: $25/mo Pro
- Railway: $5-10/mo
- Vercel: Free (hobby) or $20/mo (Pro)
- **Total:** ~$30-55/mo

---

#### 5c. Railway for Everything

**Run on Railway:**
- Postgres
- Hasura (or PostGraphile)
- Hocuspocus
- SvelteKit SSR

**Pros:**
- ✅ Single platform
- ✅ Full control
- ✅ Native Hocuspocus

**Cons:**
- ❌ More DIY setup
- ❌ Still need separate storage (or use Railway volumes)
- ❌ More ops responsibility

---

## 🎯 Collaborative Editing Considerations

**Requirement:** Run Hocuspocus (Yjs provider) for Tiptap collaborative editing.

**Technical Needs:**
- Persistent WebSocket connections
- Stateful server (maintain CRDT state)
- Node.js runtime

### Can Each Platform Run Hocuspocus?

| Platform | Can Run Hocuspocus? | Notes |
|----------|---------------------|-------|
| **Nhost** | ❌ No | Functions are short-lived, no WebSocket state |
| **Supabase** | ❌ No | Edge Functions are Deno, short-lived |
| **Firebase** | ❌ No | Cloud Functions are short-lived |
| **Cloudflare** | ⚠️ Complex | Durable Objects could work, but custom implementation |
| **Railway** | ✅ Yes | Native Node.js, persistent processes |
| **Fly.io** | ✅ Yes | Similar to Railway |
| **Render** | ✅ Yes | Background workers support |

### Alternative: Supabase Realtime

Supabase has built-in **Realtime** (WebSocket broadcast):

```typescript
const channel = supabase.channel('document-123')
  .on('broadcast', { event: 'update' }, (payload) => {
    // Handle document updates
  })
  .subscribe()
```

**Pros:**
- ✅ Built into Supabase
- ✅ No separate server

**Cons:**
- ⚠️ Not Yjs/Tiptap native
- ⚠️ Would need custom CRDT implementation
- ⚠️ Different API than Hocuspocus

**Verdict:** Possible, but more work than Hocuspocus.

---

## 🏗️ Architecture Recommendations

### Recommendation A: Supabase + Railway (Best Balance)

**For:**
- Best storage UX (path-based, easy backup)
- Native Hocuspocus support
- Proven GraphQL layer
- Minimal migration from Nhost

**Services:**
- **Supabase:** Postgres + GraphQL + Storage + Auth
- **Railway:** Hocuspocus server (optional, when ready for collab editing)
- **Vercel:** SvelteKit SSR

**Migration Effort:** Medium (2-3 days)

**Cost:** ~$30-35/mo

---

### Recommendation B: Stay with Nhost + Add R2

**For:**
- Minimal disruption
- Keep existing setup
- Better storage without full migration

**Services:**
- **Nhost:** Postgres + GraphQL + Auth
- **Cloudflare R2:** Storage only
- **Railway:** Hocuspocus (when needed)
- **Vercel:** SvelteKit SSR

**Migration Effort:** Low (1 day - just storage API changes)

**Cost:** ~$25-30/mo

**Why This Works:**
- Keep GraphQL setup (already working)
- R2 gives path-based storage
- Easy backup (standard S3 tools)
- Add Railway later for collaborative editing

---

### Recommendation C: Wait and See

**For:**
- Not urgent (Nhost storage works, just not ideal UX)
- Cover image sync doesn't require perfect storage
- Evaluate after implementing hash-based deduplication

**Current Plan:**
1. Implement hash-based deduplication (avoid re-uploads)
2. Ship cover image sync with Nhost
3. Monitor storage pain points in production
4. Migrate to Supabase or add R2 if problems arise

**Migration Effort:** None now, defer decision

**Cost:** Current (~$0-25/mo Nhost)

---

## 📊 Decision Matrix

| Criteria | Nhost (Current) | Nhost + R2 | Supabase | Railway (All) |
|----------|-----------------|------------|----------|---------------|
| **Storage UX** | ❌ ID-only | ✅ Path-based | ✅ Path-based | ⚠️ DIY |
| **GraphQL** | ✅ Hasura | ✅ Hasura | ✅ pg_graphql | ⚠️ Add Hasura |
| **Backup Ease** | ❌ Complex | ✅ S3 tools | ✅ Built-in | ✅ pg_dump |
| **Migration Effort** | - | Low | Medium | High |
| **Hocuspocus** | ❌ Need Railway | ❌ Need Railway | ❌ Need Railway | ✅ Native |
| **All-in-One** | ⚠️ Mostly | ❌ No | ⚠️ Mostly | ✅ Yes |
| **Cost** | $25/mo | $30/mo | $25/mo | $15/mo |
| **Ops Burden** | Low | Medium | Low | High |

---

## 🎯 Recommended Path Forward

### Phase 1: Ship Cover Images (Now)

**Approach:** Hash-based deduplication with current Nhost Storage

**Why:**
- ✅ Works with existing setup
- ✅ No deployment dependencies
- ✅ Database has permanent URLs
- ✅ Avoids duplicate uploads

**Accepts:**
- File access by ID (not ideal, but functional)
- Backup requires custom tooling (tolerable for now)

**Timeline:** 1-2 days

---

### Phase 2: Evaluate Storage Pain Points (1-2 months)

**Monitor:**
- How often do we need to browse files?
- How painful is backup/migration?
- Are file IDs causing real problems?

**If pain points are real:**
- Proceed to Phase 3a (Supabase) or 3b (R2)

**If tolerable:**
- Stay with Nhost, revisit later

---

### Phase 3a: Migrate to Supabase (If Storage UX Matters)

**When:** After evaluating storage pain points

**Steps:**
1. Create Supabase project
2. Export Nhost data (pg_dump)
3. Import to Supabase
4. Update `symbiont-cms` client library
5. Re-upload images with path structure
6. Test locally
7. Deploy frontend with new config
8. Migrate DNS/domain

**Timeline:** 2-3 days

**Risk:** Medium (data migration always has risk)

---

### Phase 3b: Add Cloudflare R2 (If Just Storage Matters)

**When:** After evaluating storage pain points

**Steps:**
1. Create R2 bucket
2. Update `symbiont-cms` image upload to use R2 SDK
3. Re-upload images with path structure
4. Test locally
5. Deploy

**Timeline:** 1 day

**Risk:** Low (storage only, no database changes)

---

### Phase 4: Add Hocuspocus (When Collaborative Editing Needed)

**When:** Collaborative editing becomes priority

**Steps:**
1. Create Railway project
2. Deploy Hocuspocus server
3. Integrate Tiptap editor in frontend
4. Connect to Hocuspocus WebSocket

**Timeline:** 3-5 days

**Risk:** Low (separate service, doesn't affect existing features)

---

## 📝 Open Questions

1. **Storage frequency:** How often will you manually browse/manage files?
2. **Backup schedule:** How often do you need full backups?
3. **Collaborative editing timeline:** When is this needed? (affects platform choice)
4. **Budget:** What's acceptable monthly cost? ($25, $50, $100?)
5. **Ops tolerance:** How much platform management is acceptable?

---

## 🔄 Next Steps

1. **Immediate:** Implement hash-based deduplication (ship cover images)
2. **Week 1:** Test cover image sync in production
3. **Month 1:** Monitor storage pain points
4. **Month 2:** Decide on Supabase migration or R2 addition
5. **Month 3+:** Add Hocuspocus if collaborative editing needed

---

## 📚 References

- [Supabase Storage Docs](https://supabase.com/docs/guides/storage)
- [Cloudflare R2 Docs](https://developers.cloudflare.com/r2/)
- [Railway Docs](https://docs.railway.app/)
- [Hocuspocus Docs](https://tiptap.dev/hocuspocus)
- [Supabase Realtime](https://supabase.com/docs/guides/realtime)

---

**Last Updated:** January 18, 2026
