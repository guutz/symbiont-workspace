# Dynamic Redirect Management Strategy

> **📖 Part of the Zero-Rebuild CMS Vision** - See `.docs/zero-rebuild-cms-vision.md` for the complete architecture

> **⚠️ IMPLEMENTATION STATUS: DESIGNED ONLY**  
> This document contains a complete design for dynamic redirects, but **no code has been implemented yet**.  
> - ❌ No database migration for redirects table exists  
> - ❌ No middleware implementation in `hooks.server.ts`  
> - ❌ No admin UI for redirect management  
> 
> This is a **roadmap document** for Phase 3 implementation.

## Overview

Moving from build-time redirect configuration to runtime dynamic redirect management controlled by a database (potentially via Notion).

---

## The Problem with Static Redirects

**Current Vercel/Static Approach:**
```json
// vercel.json
{
  "redirects": [
    { "source": "/old-path", "destination": "/new-path", "permanent": true }
  ]
}
```

**Limitations:**
- ❌ Requires rebuild & redeploy to add/change redirects
- ❌ Hardcoded in configuration files
- ❌ No dynamic management from CMS
- ❌ Can't track redirect usage/analytics
- ❌ No expiring redirects (temporary campaigns)

---

## Dynamic Redirect Strategy

### Architecture

```
┌──────────────────┐
│  Redirect Config │
├──────────────────┤
│ • Notion DB      │
│ • Admin Panel    │──> Nhost Postgres ──> SvelteKit Middleware
│ • GraphQL API    │          │                    │
└──────────────────┘          │                    ├──> Check path
                              │                    ├──> Lookup redirect
                              ├──> Metadata        └──> 301/302 Response
                              └──> Analytics
```

---

## Implementation

### 1. Database Schema

**File**: `nhost/migrations/default/[timestamp]_create_redirects.sql`

```sql
-- Redirects table
CREATE TABLE public.redirects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Redirect configuration
  source_path text NOT NULL,           -- '/old-blog-post'
  destination_path text NOT NULL,      -- '/new-blog-post'
  redirect_type text NOT NULL          -- '301' (permanent) or '302' (temporary)
    CHECK (redirect_type IN ('301', '302')),
  
  -- Conditions (optional)
  enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz,              -- For temporary campaigns
  
  -- Context
  reason text,                         -- Why this redirect exists
  created_by uuid REFERENCES auth.users(id),
  related_post_id uuid REFERENCES posts(id),  -- If redirect is for a post
  
  -- Metadata
  notes text,
  priority int DEFAULT 0,              -- Higher = checked first
  
  -- Timestamps
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Unique constraint on source path
CREATE UNIQUE INDEX idx_redirects_source_path ON public.redirects(source_path) 
  WHERE enabled = true;

-- Index for fast lookups
CREATE INDEX idx_redirects_enabled ON public.redirects(enabled, expires_at);
CREATE INDEX idx_redirects_priority ON public.redirects(priority DESC);

-- Analytics table (optional but recommended)
CREATE TABLE public.redirect_hits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  redirect_id uuid NOT NULL REFERENCES public.redirects(id) ON DELETE CASCADE,
  
  -- Request info
  visited_at timestamptz NOT NULL DEFAULT now(),
  user_agent text,
  referer text,
  ip_address inet,
  
  -- Metadata
  country_code text,
  device_type text  -- 'mobile', 'desktop', 'tablet'
);

CREATE INDEX idx_redirect_hits_redirect_id ON public.redirect_hits(redirect_id);
CREATE INDEX idx_redirect_hits_visited_at ON public.redirect_hits(visited_at);

-- Row Level Security
ALTER TABLE public.redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.redirect_hits ENABLE ROW LEVEL SECURITY;

-- Public read for redirects (needed by middleware)
CREATE POLICY "Redirects are publicly readable"
  ON public.redirects FOR SELECT
  USING (enabled = true AND (expires_at IS NULL OR expires_at > now()));

-- Admin write access
CREATE POLICY "Admins can manage redirects"
  ON public.redirects FOR ALL
  USING (auth.role() = 'admin');

-- Analytics write (service role only)
CREATE POLICY "Service can log redirect hits"
  ON public.redirect_hits FOR INSERT
  WITH CHECK (true);
```

### 2. SvelteKit Middleware

**File**: `packages/qwer-test/src/hooks.server.ts`

```typescript
import type { Handle } from '@sveltejs/kit';
import { GraphQLClient, gql } from 'graphql-request';

const GRAPHQL_URL = process.env.PUBLIC_NHOST_GRAPHQL_URL!;
const gqlClient = new GraphQLClient(GRAPHQL_URL, {
  headers: { 'x-hasura-admin-secret': process.env.NHOST_ADMIN_SECRET! }
});

const GET_REDIRECT_QUERY = gql`
  query GetRedirect($sourcePath: String!) {
    redirects(
      where: {
        source_path: { _eq: $sourcePath },
        enabled: { _eq: true },
        _or: [
          { expires_at: { _is_null: true } },
          { expires_at: { _gt: "now()" } }
        ]
      },
      order_by: { priority: desc },
      limit: 1
    ) {
      id
      destination_path
      redirect_type
    }
  }
`;

const LOG_REDIRECT_HIT = gql`
  mutation LogRedirectHit($hit: redirect_hits_insert_input!) {
    insert_redirect_hits_one(object: $hit) {
      id
    }
  }
`;

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;
  
  // Skip redirect check for static assets and API routes
  if (
    pathname.startsWith('/_app/') ||
    pathname.startsWith('/api/') ||
    pathname.match(/\.(js|css|png|jpg|svg|ico|webp)$/)
  ) {
    return resolve(event);
  }
  
  try {
    // Check for redirect
    const result = await gqlClient.request<{
      redirects: Array<{
        id: string;
        destination_path: string;
        redirect_type: '301' | '302';
      }>;
    }>(GET_REDIRECT_QUERY, { sourcePath: pathname });
    
    if (result.redirects.length > 0) {
      const redirect = result.redirects[0];
      
      // Log the hit (fire and forget)
      logRedirectHit(redirect.id, event).catch(console.error);
      
      // Return redirect response
      return new Response(null, {
        status: parseInt(redirect.redirect_type),
        headers: {
          Location: redirect.destination_path,
          'Cache-Control': redirect.redirect_type === '301' 
            ? 'public, max-age=31536000'  // 1 year for permanent
            : 'public, max-age=3600'       // 1 hour for temporary
        }
      });
    }
  } catch (error) {
    console.error('[redirects] Error checking redirect:', error);
    // Fail open: continue to normal routing
  }
  
  return resolve(event);
};

async function logRedirectHit(redirectId: string, event: RequestEvent) {
  try {
    await gqlClient.request(LOG_REDIRECT_HIT, {
      hit: {
        redirect_id: redirectId,
        user_agent: event.request.headers.get('user-agent'),
        referer: event.request.headers.get('referer'),
        ip_address: event.getClientAddress(),
      }
    });
  } catch (error) {
    // Don't fail redirect if logging fails
    console.error('[redirects] Failed to log hit:', error);
  }
}
```

### 3. Notion Database for Redirects (Optional)

**Setup a Notion Database:**

| Source Path | Destination Path | Type | Enabled | Expires | Reason |
|-------------|------------------|------|---------|---------|--------|
| /old-post | /new-post | 301 | ✅ | | URL structure change |
| /promo | /special-offer | 302 | ✅ | 2025-12-31 | Holiday campaign |
| /beta | /features | 302 | ❌ | | Disabled temporarily |

**Sync Script:**

```typescript
// packages/symbiont-cms/src/lib/server/sync-redirects.ts

import { notion } from './notion';
import { gqlClient } from './graphql';
import { gql } from 'graphql-request';

const UPSERT_REDIRECT = gql`
  mutation UpsertRedirect($redirect: redirects_insert_input!) {
    insert_redirects_one(
      object: $redirect,
      on_conflict: {
        constraint: redirects_source_path_key,
        update_columns: [destination_path, redirect_type, enabled, expires_at, reason]
      }
    ) {
      id
    }
  }
`;

export async function syncRedirectsFromNotion(databaseId: string) {
  console.log('[symbiont] Syncing redirects from Notion...');
  
  const response = await notion.databases.query({
    database_id: databaseId,
  });
  
  for (const page of response.results) {
    if (!('properties' in page)) continue;
    
    const props = page.properties;
    
    // Extract properties (adjust based on your Notion schema)
    const sourcePath = getTextProperty(props['Source Path']);
    const destinationPath = getTextProperty(props['Destination Path']);
    const redirectType = getSelectProperty(props['Type']) || '301';
    const enabled = getCheckboxProperty(props['Enabled']) ?? true;
    const expiresAt = getDateProperty(props['Expires']);
    const reason = getTextProperty(props['Reason']);
    
    if (!sourcePath || !destinationPath) {
      console.warn('[symbiont] Skipping redirect with missing paths');
      continue;
    }
    
    await gqlClient.request(UPSERT_REDIRECT, {
      redirect: {
        source_path: sourcePath,
        destination_path: destinationPath,
        redirect_type: redirectType,
        enabled,
        expires_at: expiresAt,
        reason,
      }
    });
    
    console.log(`[symbiont] Synced redirect: ${sourcePath} → ${destinationPath}`);
  }
  
  console.log('[symbiont] Redirect sync complete!');
}

// Helper functions to extract Notion properties
function getTextProperty(prop: any): string | null {
  if (prop?.type === 'title' && prop.title?.[0]?.plain_text) {
    return prop.title[0].plain_text;
  }
  if (prop?.type === 'rich_text' && prop.rich_text?.[0]?.plain_text) {
    return prop.rich_text[0].plain_text;
  }
  return null;
}

function getSelectProperty(prop: any): string | null {
  return prop?.type === 'select' ? prop.select?.name : null;
}

function getCheckboxProperty(prop: any): boolean | null {
  return prop?.type === 'checkbox' ? prop.checkbox : null;
}

function getDateProperty(prop: any): string | null {
  return prop?.type === 'date' ? prop.date?.start : null;
}
```

**Add to Webhook Handler:**

```typescript
// In packages/symbiont-cms/src/lib/server/webhook.ts

export async function handleRedirectsWebhookRequest(event: RequestEvent) {
  // Similar to blog webhook, but for redirects database
  const { databaseId, pageId } = await event.request.json();
  
  // Sync single redirect or all redirects
  await syncRedirectsFromNotion(databaseId);
  
  return json({ message: 'Redirects synced successfully' });
}
```

---

## Use Cases

### Use Case 1: Post URL Migration

```sql
-- When you change a post slug
INSERT INTO redirects (source_path, destination_path, redirect_type, reason)
VALUES (
  '/old-slug',
  '/new-slug',
  '301',
  'Post URL structure changed'
);
```

**Automatic via Symbiont:**
```typescript
// In page processor, detect slug changes
if (existingPost && existingPost.slug !== newSlug) {
  // Create redirect from old slug to new slug
  await gqlClient.request(gql`
    mutation CreateRedirect($redirect: redirects_insert_input!) {
      insert_redirects_one(object: $redirect) { id }
    }
  `, {
    redirect: {
      source_path: `/${existingPost.slug}`,
      destination_path: `/${newSlug}`,
      redirect_type: '301',
      reason: 'Slug changed in Notion',
      related_post_id: existingPost.id,
    }
  });
}
```

### Use Case 2: Marketing Campaigns

```sql
-- Temporary redirect for campaign
INSERT INTO redirects (
  source_path, 
  destination_path, 
  redirect_type, 
  expires_at,
  reason
)
VALUES (
  '/sale',
  '/products/summer-sale',
  '302',
  '2025-08-31 23:59:59',
  'Summer sale campaign'
);
```

### Use Case 3: Domain Migration

```sql
-- Batch create redirects for domain migration
INSERT INTO redirects (source_path, destination_path, redirect_type, reason)
SELECT 
  old_path,
  new_path,
  '301',
  'Domain migration from old-site.com'
FROM migration_mapping;
```

---

## Performance Considerations

### Caching Strategy

```typescript
// Add in-memory cache to reduce database queries
import { LRUCache } from 'lru-cache';

const redirectCache = new LRUCache<string, RedirectResult>({
  max: 1000,           // Cache up to 1000 redirects
  ttl: 1000 * 60 * 5,  // 5 minute TTL
});

export const handle: Handle = async ({ event, resolve }) => {
  const pathname = event.url.pathname;
  
  // Check cache first
  const cached = redirectCache.get(pathname);
  if (cached) {
    return new Response(null, {
      status: parseInt(cached.redirect_type),
      headers: { Location: cached.destination_path }
    });
  }
  
  // Query database...
  const result = await gqlClient.request(/* ... */);
  
  if (result.redirects.length > 0) {
    const redirect = result.redirects[0];
    redirectCache.set(pathname, redirect);  // Cache it
    // Return redirect...
  }
  
  return resolve(event);
};
```

### Database Optimization

```sql
-- Partial index for active redirects only
CREATE INDEX idx_redirects_active ON public.redirects(source_path)
  WHERE enabled = true AND (expires_at IS NULL OR expires_at > now());

-- Materialize view for frequently accessed redirects (optional)
CREATE MATERIALIZED VIEW active_redirects AS
SELECT source_path, destination_path, redirect_type
FROM redirects
WHERE enabled = true 
  AND (expires_at IS NULL OR expires_at > now());

CREATE UNIQUE INDEX ON active_redirects(source_path);

-- Refresh periodically (via cron or trigger)
REFRESH MATERIALIZED VIEW CONCURRENTLY active_redirects;
```

---

## Admin Interface

### Simple Admin Panel

**File**: `packages/qwer-test/src/routes/admin/redirects/+page.svelte`

```svelte
<script lang="ts">
  import { gql } from 'graphql-request';
  import type { PageData } from './$types';
  
  export let data: PageData;
  
  async function createRedirect(event: Event) {
    event.preventDefault();
    const form = event.target as HTMLFormElement;
    const formData = new FormData(form);
    
    // Create redirect via GraphQL mutation
    // ... implementation
  }
</script>

<div class="admin-panel">
  <h1>Redirect Management</h1>
  
  <!-- Create new redirect form -->
  <form on:submit={createRedirect}>
    <input name="source_path" placeholder="/old-path" required />
    <input name="destination_path" placeholder="/new-path" required />
    <select name="redirect_type">
      <option value="301">301 Permanent</option>
      <option value="302">302 Temporary</option>
    </select>
    <button type="submit">Create Redirect</button>
  </form>
  
  <!-- List existing redirects -->
  <table>
    <thead>
      <tr>
        <th>Source</th>
        <th>Destination</th>
        <th>Type</th>
        <th>Hits</th>
        <th>Actions</th>
      </tr>
    </thead>
    <tbody>
      {#each data.redirects as redirect}
        <tr>
          <td>{redirect.source_path}</td>
          <td>{redirect.destination_path}</td>
          <td>{redirect.redirect_type}</td>
          <td>{redirect.hit_count}</td>
          <td>
            <button on:click={() => editRedirect(redirect.id)}>Edit</button>
            <button on:click={() => deleteRedirect(redirect.id)}>Delete</button>
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>
```

---

## Analytics Dashboard

### Query redirect performance

```sql
-- Top 10 most used redirects
SELECT 
  r.source_path,
  r.destination_path,
  COUNT(h.id) as hit_count,
  MAX(h.visited_at) as last_hit
FROM redirects r
LEFT JOIN redirect_hits h ON h.redirect_id = r.id
GROUP BY r.id, r.source_path, r.destination_path
ORDER BY hit_count DESC
LIMIT 10;

-- Redirects by day (for charts)
SELECT 
  DATE(h.visited_at) as date,
  COUNT(*) as hits
FROM redirect_hits h
WHERE h.visited_at > now() - interval '30 days'
GROUP BY DATE(h.visited_at)
ORDER BY date;

-- Device breakdown
SELECT 
  device_type,
  COUNT(*) as count
FROM redirect_hits
WHERE visited_at > now() - interval '7 days'
GROUP BY device_type;
```

---

## Comparison: Static vs Dynamic

| Aspect | Static (vercel.json) | Dynamic (Database) |
|--------|---------------------|-------------------|
| **Add Redirect** | Edit config → Rebuild → Deploy | Insert DB row → Instant |
| **Update Redirect** | Edit config → Rebuild → Deploy | Update DB row → Instant |
| **Temporary Redirects** | Manual removal | Auto-expire |
| **Analytics** | External service | Built-in tracking |
| **Management** | Code/Config files | Notion/Admin UI |
| **Performance** | Edge (fastest) | Server + Cache (fast) |
| **Complexity** | Low | Medium |

---

## Migration Strategy

### Phase 1: Coexist (Recommended Start)

```typescript
// Keep static redirects in vercel.json for critical paths
// Add dynamic redirects for new/temporary needs
// Gradually migrate static → dynamic

// In hooks.server.ts, check dynamic redirects first
// Then let Vercel handle static redirects (if no match)
```

### Phase 2: Hybrid

```typescript
// Move most redirects to database
// Keep only critical/global redirects in vercel.json
// (e.g., www → non-www, http → https)
```

### Phase 3: Full Dynamic

```typescript
// All redirects in database
// Empty vercel.json redirects array
// Complete CMS control
```

---

## Benefits Summary

✅ **Zero Rebuilds**: Add/edit redirects instantly  
✅ **Notion Control**: Manage redirects from Notion database  
✅ **Auto-Expire**: Temporary redirects expire automatically  
✅ **Analytics**: Track redirect usage natively  
✅ **Bulk Operations**: Easily migrate many URLs  
✅ **Flexible**: Complex logic (query params, wildcards) possible  
✅ **Audit Trail**: Track who created/modified redirects

---

## Implementation Priority

### Do Now (High Value)
- ✅ Database schema for redirects
- ✅ SvelteKit middleware for redirect checking
- ✅ Auto-create redirects on slug changes

### Do Soon (Nice to Have)
- ⏳ Notion database sync for redirects
- ⏳ Admin UI for redirect management
- ⏳ Analytics dashboard

### Do Later (Advanced)
- 🔮 Wildcard/pattern redirects
- 🔮 A/B testing redirects
- 🔮 Geo-based redirects
- 🔮 Import from sitemap tools

---

## Related Documentation

- **[Symbiont CMS Complete Guide](symbiont-cms.md)** 📦 - Full system documentation
- **[Zero-Rebuild CMS Vision](zero-rebuild-cms-vision.md)** 🎯 - The complete architecture overview
- **[Dynamic File Management](dynamic-file-management.md)** - File/asset handling strategy
- **[Image Optimization Strategy](image-optimization-strategy.md)** - Specific image handling
- **[Integration Guide](INTEGRATION_GUIDE.md)** - How QWER + Symbiont work together

---

**Status:** 📋 Strategy Documented (Not Yet Implemented)  
**Priority:** 🔵 Medium (Nice to have, not urgent)  
**Last Updated:** October 5, 2025
- See: `.docs/image-optimization-strategy.md` for image-specific logic
