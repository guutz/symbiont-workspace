# Bidirectional Metadata Sync & Collaborative Editor Plan

> **Status**: Planning Phase  
> **Target**: Phase 2 Implementation (after current Phase 1 stabilization)  
> **Last Updated**: November 7, 2025

## Table of Contents

- [Vision](#vision)
- [Use Case](#use-case)
- [Architecture Overview](#architecture-overview)
- [Implementation Phases](#implementation-phases)
- [Technical Design](#technical-design)
- [Database Schema Changes](#database-schema-changes)
- [API Design](#api-design)
- [Tiptap Editor Features](#tiptap-editor-features)
- [Security & Permissions](#security--permissions)
- [Migration Strategy](#migration-strategy)

---

## Vision

Enable **hybrid content workflow** where posts can be managed in either Notion or a web-based Tiptap editor, with **bidirectional metadata sync** to keep both systems in sync. Content itself flows one-way (Notion → DB), but metadata (title, tags, dates, status) syncs both ways.

### Core Principles

1. **Flexible Source of Truth**: Posts can switch between Notion-managed and DB-managed on demand
2. **Metadata Bidirectionality**: Title, tags, publish date, status sync both ways
3. **Content Unidirectionality**: Content only flows Notion → DB (too complex otherwise)
4. **Collaborative Editing**: Real-time collaboration in Tiptap editor (not in Notion)
5. **Low Barrier to Entry**: No Notion account required for contributors

---

## Use Case

**Blog/Publication Workflow:**

### Scenario A: External Contributor Submission

1. **Contributor** (no Notion account) writes article in Tiptap editor
2. **Contributor** uploads images directly to Nhost Storage
3. **Editor** reviews in Tiptap, adds comments and suggestions
4. **Back-and-forth collaboration** happens in real-time via Tiptap
5. **Editor** approves → sets status to "Published"
6. **Metadata syncs to Notion** for record-keeping and editorial dashboard

### Scenario B: Internal Team Notion Workflow

1. **Team member** creates article in Notion (familiar interface)
2. **Content syncs to DB** automatically via existing sync
3. **Article appears on website** when status = "Published"
4. **Metadata changes in Notion** sync back to DB

### Scenario C: Hybrid Workflow (Switch Source of Truth)

1. Article starts in **Notion** (Notion is source of truth)
2. External contributor needs to edit → **switch to DB source of truth**
3. Contributor edits in **Tiptap editor**
4. Metadata changes sync back to **Notion** (for record-keeping)
5. Content changes in Notion are now **ignored** (DB is source)
6. After publication, optionally **switch back to Notion** for archival

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         Content Sources                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Notion Database                    Tiptap Web Editor          │
│  (Editorial Dashboard)              (Collaborative Editing)    │
│         │                                    │                 │
│         │ Content (one-way)                  │                 │
│         │ Metadata (bidirectional)           │                 │
│         ↓                                    ↓                 │
│    ┌─────────────────────────────────────────────┐             │
│    │        PostgreSQL Database (Nhost)          │             │
│    │  - posts table (content + metadata)         │             │
│    │  - content_source column (notion/database)  │             │
│    │  - comments table (Tiptap annotations)      │             │
│    │  - editorial_notes table (discussion)       │             │
│    └─────────────────────────────────────────────┘             │
│                          ↓                                      │
│                  SvelteKit Frontend                             │
│                  (Public + Editor UI)                           │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

**Notion → DB (existing):**
- Content: Markdown via `notion-to-md`
- Metadata: Title, tags, authors, publish date, custom fields

**DB → Notion (new):**
- Metadata only: Title, tags, publish date, status
- Triggered when: `content_source = 'database'` and metadata changes

**Tiptap → DB (new):**
- Content: Markdown via Tiptap serializer
- Metadata: Direct GraphQL mutations
- Images: Upload to Nhost Storage, insert markdown URLs
- Comments: Stored in separate table with text ranges
- Editorial notes: Stored in separate discussion table

---

## Implementation Phases

### Phase 1: Foundation (Current - 80% Complete)

✅ Notion → DB sync  
✅ GraphQL client/server utilities  
✅ Markdown rendering  
✅ Type-safe configuration  
⚠️ Testing infrastructure (missing)  
⚠️ Observability (missing)  

### Phase 2: Bidirectional Metadata Sync

**Goal**: Enable DB → Notion metadata sync

#### 2.1: Database Schema
- Add `content_source` column to `pages` table
- Add `last_synced_to_notion` timestamp
- Add `managed_by` field (optional, for UI display)

#### 2.2: Configuration
- Add `contentSourceRule` to `DatabaseBlueprint`
- Add `metadataSyncBackFields` configuration
- Support per-page source determination

#### 2.3: Sync Logic
- Implement `NotionMetadataSyncer` class
- Extend `NotionAdapter` with property update methods
- Integrate into `PostBuilder` workflow

#### 2.4: Testing
- Unit tests for metadata sync
- Integration tests for bidirectional flow
- Conflict detection tests

### Phase 3: Tiptap Editor Core

**Goal**: Basic content editing in web UI

#### 3.1: Editor UI
- SvelteKit route: `/admin/editor/[slug]`
- Tiptap editor instance with markdown support
- Markdown preview pane (side-by-side)
- Save to DB via GraphQL mutation

#### 3.2: Metadata Editing
- Title, tags, authors (editable)
- Publish date picker
- Status dropdown (Draft/Review/Published)
- "Managed By" toggle (Notion/Tiptap)

#### 3.3: Authentication & Permissions
- Hasura role-based access control
- Editor role: can edit draft posts
- Admin role: can publish posts
- Contributor role: can create drafts only

### Phase 4: Image Upload & Management

**Goal**: Direct image uploads to Nhost Storage

#### 4.1: Nhost Storage Configuration
- Create `post-images` bucket
- Set upload size limits and file type restrictions
- Configure public read access for published images

#### 4.2: Tiptap Image Upload
- Drag-and-drop image upload
- Paste image from clipboard
- Upload to Nhost Storage via SDK
- Insert markdown image URL: `![alt](https://nhost-storage-url)`
- Preserve full quality (no auto-compression)

#### 4.3: Image Management
- List all images for a post
- Delete unused images
- Update alt text
- Optionally: Image cropping/resizing UI

### Phase 5: Collaborative Features

**Goal**: Real-time collaboration and editorial workflow

#### 5.1: Comments on Text
- Tiptap commenting extension
- Store comments in `post_comments` table:
  ```sql
  CREATE TABLE post_comments (
    id UUID PRIMARY KEY,
    post_id UUID REFERENCES pages(page_id),
    user_id UUID REFERENCES auth.users(id),
    text_range JSONB, -- {from: 123, to: 456}
    comment_text TEXT,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ
  );
  ```
- Real-time updates via GraphQL subscriptions
- Resolve/unresolve comments
- Thread replies to comments

#### 5.2: Editorial Notes (Chat)
- Discussion thread for overall post feedback
- Store in `post_editorial_notes` table:
  ```sql
  CREATE TABLE post_editorial_notes (
    id UUID PRIMARY KEY,
    post_id UUID REFERENCES pages(page_id),
    user_id UUID REFERENCES auth.users(id),
    note_text TEXT,
    created_at TIMESTAMPTZ
  );
  ```
- Real-time chat via GraphQL subscriptions
- Mentions (@username)
- Markdown support in notes

#### 5.3: Real-Time Collaboration
- Tiptap Collaboration extension (Y.js + WebRTC or WebSocket)
- Show active editors with cursor positions
- Conflict-free collaborative editing
- Auto-save every 2 seconds

### Phase 6: Advanced Features

**Goal**: Experimental document conversion and workflow automation

#### 6.1: Document Import
- Upload `.docx`, `.pdf`, `.txt` files
- Auto-convert to markdown:
  - Use `mammoth.js` for .docx → markdown
  - Use `pdf-parse` for .pdf → text → markdown
  - Plain text → markdown (preserve line breaks)
- Extract images from documents and upload to Nhost
- Preview conversion result before import

#### 6.2: Version History
- Store content snapshots on each save
- Diff view between versions
- Restore previous version
- "Undo publish" feature

#### 6.3: Editorial Workflow States
- Workflow: Draft → In Review → Approved → Published
- Assign reviewers
- Notification system (email or in-app)
- Approval required before publishing

#### 6.4: Content Templates
- Markdown templates for common post types
- Variable substitution (e.g., `{{author_name}}`)
- Template library in UI

---

## Technical Design

### Configuration API

```typescript
// symbiont.config.ts

export default defineConfig({
  databases: [
    {
      alias: 'blog',
      dataSourceId: process.env.NOTION_BLOG_DATABASE_ID!,
      notionToken: process.env.NOTION_TOKEN!,
      
      // NEW: Determine content source per-page
      contentSourceRule: (page) => {
        // Option 1: Check Notion property
        const managedBy = page.properties['Managed By']?.select?.name;
        if (managedBy === 'Tiptap') return 'database';
        if (managedBy === 'Notion') return 'notion';
        
        // Option 2: Check database first (if post exists)
        // (handled in PostBuilder logic)
        
        // Default: Notion
        return 'notion';
      },
      
      // NEW: Metadata sync-back configuration
      metadataSyncBackFields: {
        titleProperty: 'Name',
        tagsProperty: 'Tags',
        publishDateProperty: 'Publish Date',
        statusProperty: 'Status',
        // Custom fields via metadata extractor?
      },
      
      // Existing configuration
      isPublicRule: (page) => {
        const status = page.properties.Status?.select?.name;
        return status === 'Published';
      },
      
      slugSyncProperty: 'Website Slug',
      tagsProperty: 'Tags',
      authorsProperty: 'Authors',
      
      publishDateRule: (page) => {
        const publishDate = page.properties['Publish Date']?.date?.start;
        return publishDate || page.last_edited_time;
      }
    }
  ]
});
```

### Type Definitions

```typescript
// packages/symbiont-cms/src/lib/types.ts

export interface DatabaseBlueprint {
  // ... existing fields ...
  
  /**
   * Determines sync direction for content
   * 
   * - 'notion': Notion is source of truth (read-only DB)
   *   - Notion → DB (content + metadata)
   *   - DB → Notion (slug sync-back only)
   *   - Content edits in DB are OVERWRITTEN by Notion
   * 
   * - 'database': Database is source of truth (Tiptap-edited)
   *   - Notion → DB (metadata only, content preserved)
   *   - DB → Notion (metadata sync-back)
   *   - Content changes in Notion are IGNORED
   * 
   * Can be a function for per-page logic (e.g., Notion property)
   * 
   * @default 'notion'
   */
  contentSourceRule?: 'notion' | 'database' | ((page: PageObjectResponse) => 'notion' | 'database');
  
  /**
   * Which metadata fields to sync back to Notion when DB is source of truth
   * Only applies when contentSourceRule returns 'database'
   */
  metadataSyncBackFields?: {
    /** Notion property name for title (e.g., "Name") */
    titleProperty?: string;
    
    /** Notion property name for tags (e.g., "Tags") - multi_select */
    tagsProperty?: string;
    
    /** Notion property name for publish date (e.g., "Publish Date") - date */
    publishDateProperty?: string;
    
    /** Notion property name for status (e.g., "Status") - select */
    statusProperty?: string;
    
    /** Notion property name for authors (e.g., "Authors") - people or multi_select */
    authorsProperty?: string;
  };
}

export interface Post {
  // ... existing fields ...
  
  /** NEW: Content source tracking */
  content_source?: 'notion' | 'database';
  
  /** NEW: Last time metadata was synced to Notion */
  last_synced_to_notion?: string | null;
  
  /** NEW: User-friendly label for UI (optional) */
  managed_by?: 'Notion' | 'Tiptap' | null;
}
```

---

## Database Schema Changes

```sql
-- Migration: Add bidirectional sync support

-- 1. Add content source tracking
ALTER TABLE public.pages 
  ADD COLUMN content_source TEXT DEFAULT 'notion' 
  CHECK (content_source IN ('notion', 'database'));

CREATE INDEX idx_pages_content_source ON public.pages(content_source);

-- 2. Add sync timestamp
ALTER TABLE public.pages 
  ADD COLUMN last_synced_to_notion TIMESTAMPTZ NULL;

-- 3. Add user-friendly label (optional)
ALTER TABLE public.pages 
  ADD COLUMN managed_by TEXT NULL;

-- 4. Comments table (Phase 5)
CREATE TABLE public.post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.pages(page_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment_text TEXT NOT NULL,
  text_range JSONB NOT NULL, -- {from: number, to: number}
  resolved BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_post_comments_post_id ON public.post_comments(post_id);
CREATE INDEX idx_post_comments_user_id ON public.post_comments(user_id);
CREATE INDEX idx_post_comments_resolved ON public.post_comments(resolved) WHERE NOT resolved;

-- 5. Editorial notes table (Phase 5)
CREATE TABLE public.post_editorial_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.pages(page_id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_post_editorial_notes_post_id ON public.post_editorial_notes(post_id);

-- 6. Version history table (Phase 6)
CREATE TABLE public.post_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.pages(page_id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  title TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, version_number)
);

CREATE INDEX idx_post_versions_post_id ON public.post_versions(post_id);
```

---

## API Design

### GraphQL Mutations (Phase 3)

```graphql
# Update post content (Tiptap save)
mutation UpdatePostContent($postId: uuid!, $content: String!, $title: String!) {
  update_pages_by_pk(
    pk_columns: { page_id: $postId }
    _set: {
      content: $content
      title: $title
      updated_at: "now()"
      content_source: "database"
    }
  ) {
    page_id
    content
    title
    updated_at
  }
}

# Update post metadata (triggers Notion sync-back)
mutation UpdatePostMetadata(
  $postId: uuid!
  $title: String
  $tags: jsonb
  $publishAt: timestamptz
  $authors: jsonb
) {
  update_pages_by_pk(
    pk_columns: { page_id: $postId }
    _set: {
      title: $title
      tags: $tags
      publish_at: $publishAt
      authors: $authors
      updated_at: "now()"
    }
  ) {
    page_id
    title
    tags
    publish_at
    authors
    last_synced_to_notion
  }
}

# Switch content source
mutation SwitchContentSource($postId: uuid!, $source: String!) {
  update_pages_by_pk(
    pk_columns: { page_id: $postId }
    _set: { content_source: $source }
  ) {
    page_id
    content_source
  }
}
```

### REST Endpoints (Alternative to GraphQL)

```typescript
// POST /api/editor/posts/:postId/content
// Save content from Tiptap editor
{
  "content": "# Markdown content...",
  "title": "Post Title",
  "autosave": false // trigger Notion sync if false
}

// POST /api/editor/posts/:postId/metadata
// Update metadata (triggers Notion sync)
{
  "title": "New Title",
  "tags": ["tag1", "tag2"],
  "publish_at": "2025-11-15T12:00:00Z"
}

// POST /api/editor/posts/:postId/switch-source
// Change content source
{
  "source": "database" // or "notion"
}

// POST /api/editor/images/upload
// Upload image to Nhost Storage
FormData with file

// POST /api/editor/documents/convert
// Convert .docx/.pdf to markdown
FormData with file
```

---

## Tiptap Editor Features

### Core Editor (Phase 3)

- **Extensions**:
  - Document, Paragraph, Text, Heading, Bold, Italic, Strike, Code, CodeBlock
  - BulletList, OrderedList, ListItem
  - Blockquote, HorizontalRule, HardBreak
  - Link, Image
  - Table, TableRow, TableCell, TableHeader
  - History (undo/redo)
  - Placeholder
  - CharacterCount
  
- **Markdown Support**:
  - Import: Parse markdown on load
  - Export: Serialize to markdown on save (via `tiptap-markdown` extension)
  - Live preview: Side-by-side markdown/rendered view

- **UI Components**:
  - Floating menu (text selection)
  - Bubble menu (link editing)
  - Slash commands (/)
  - Toolbar (formatting options)

### Image Upload (Phase 4)

- **Upload Flow**:
  1. User drags image or pastes from clipboard
  2. Tiptap triggers `addImage` handler
  3. Upload to Nhost Storage via SDK
  4. Get public URL back
  5. Insert markdown: `![Alt text](https://storage.nhost.io/...)`

- **Features**:
  - Progress indicator during upload
  - Alt text editor
  - Image resizing (via markdown-it plugin)
  - Image alignment (left/center/right)
  - Click to enlarge (medium-zoom integration)

### Collaboration (Phase 5)

- **Real-Time Editing**:
  - Y.js CRDT for conflict-free merging
  - WebSocket connection to collaboration server
  - Show active users with cursor colors
  - See who's editing what in real-time

- **Comments**:
  - Select text → Add comment
  - Comments displayed as highlights in editor
  - Comment thread in sidebar
  - Resolve/unresolve
  - @mentions for notifications

- **Editorial Notes**:
  - Chat panel in sidebar
  - Real-time updates via GraphQL subscriptions
  - Markdown support in messages
  - File attachments (optional)

---

## Security & Permissions

### Hasura Roles

```yaml
# nhost/metadata/databases/default/tables/public_pages.yaml

- table:
    schema: public
    name: pages
  
  # Admin: Full access
  select_permissions:
    - role: admin
      permission:
        columns: '*'
        filter: {}
  
  update_permissions:
    - role: admin
      permission:
        columns: '*'
        filter: {}
  
  # Editor: Can edit drafts and own posts
  select_permissions:
    - role: editor
      permission:
        columns: '*'
        filter:
          _or:
            - publish_at: {_is_null: true}
            - authors: {_contains: {user_id: X-Hasura-User-Id}}
  
  update_permissions:
    - role: editor
      permission:
        columns: [title, content, tags, authors, updated_at]
        filter:
          _or:
            - publish_at: {_is_null: true}
            - authors: {_contains: {user_id: X-Hasura-User-Id}}
  
  # Contributor: Can create drafts only
  insert_permissions:
    - role: contributor
      permission:
        columns: [title, content, tags, authors, datasource_id, page_id]
        check:
          publish_at: {_is_null: true}
```

### Authentication Flow

1. User logs in via Nhost Auth
2. JWT includes user ID and role
3. Hasura validates JWT and applies row-level security
4. Tiptap editor enforces client-side role checks (UI only)
5. All mutations go through Hasura (server-side enforcement)

---

## Migration Strategy

### Phase 2: Metadata Sync

**Step 1**: Add database columns (content_source, last_synced_to_notion)  
**Step 2**: Default all existing posts to `content_source = 'notion'`  
**Step 3**: Deploy NotionMetadataSyncer (disabled by default)  
**Step 4**: Test on staging with one post switched to `database` source  
**Step 5**: Enable metadata sync-back in production  

### Phase 3: Tiptap Editor

**Step 1**: Deploy editor UI behind feature flag  
**Step 2**: Test with admin users only  
**Step 3**: Create test posts in Tiptap editor  
**Step 4**: Verify metadata syncs to Notion correctly  
**Step 5**: Open to editor role users  

### Phase 5: Collaboration

**Step 1**: Deploy Y.js collaboration server  
**Step 2**: Test with 2-3 users simultaneously  
**Step 3**: Add comments and editorial notes  
**Step 4**: Load test with 10+ concurrent editors  
**Step 5**: Enable for all users  

---

## Open Questions

1. **Content Source Switching**:
   - Should we allow switching source mid-editing?
   - What happens to content when switching from DB → Notion?
   - Should we snapshot content before switching?

2. **Conflict Resolution**:
   - What if user edits in Notion while `content_source = 'database'`?
   - Show warning in Notion? Block Notion edits? Overwrite DB?

3. **Collaboration Backend**:
   - Self-hosted Y.js server or managed service (e.g., Liveblocks)?
   - WebSocket scaling strategy (Redis pub/sub?)

4. **Document Conversion**:
   - Which formats to support? (.docx, .pdf, .txt, .md, .html?)
   - How to handle conversion errors?
   - Preview before import or auto-import?

5. **Version History**:
   - How many versions to keep? (30 days? 100 versions?)
   - Should we diff against previous version or full snapshot?

6. **Image Management**:
   - Delete unused images automatically?
   - Image CDN/optimization (Cloudflare Images?)
   - Alt text required or optional?

---

## Next Steps

### Immediate (Phase 2.1)

1. ✅ Document this plan
2. Add `content_source` and `last_synced_to_notion` columns to `pages` table
3. Update `Post` type in `types.ts`
4. Add `contentSourceRule` and `metadataSyncBackFields` to `DatabaseBlueprint`

### Short-term (Phase 2.2-2.4)

1. Implement `NotionMetadataSyncer` class
2. Extend `NotionAdapter` with property update methods
3. Integrate into `PostBuilder`
4. Write comprehensive tests

### Medium-term (Phase 3)

1. Design Tiptap editor UI mockups
2. Implement editor route in SvelteKit
3. Add Hasura permissions for editor roles
4. Test end-to-end workflow

### Long-term (Phase 4-6)

1. Implement image upload to Nhost Storage
2. Add collaboration features (Y.js + comments)
3. Build document conversion pipeline
4. Add version history and workflow states

---

## Related Documentation

- [Notion Sync Architecture](./Symbiont_Refactor_Memo_Oct31.md)
- [Image Optimization Strategy](./image-optimization-strategy.md) - Phase 4 foundation
- [Markdown Compatibility](./markdown-compatibility.md) - Tiptap output requirements
- [Implementation Status](./IMPLEMENTATION_STATUS.md) - Current progress tracker

---

**End of Document**
