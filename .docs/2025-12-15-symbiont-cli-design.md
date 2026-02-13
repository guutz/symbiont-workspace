# Symbiont CLI Design

> **📖 Design Document** - Proposed CLI tool for Symbiont CMS  
> **Status:** Concept Phase - Not Implemented  
> **Last Updated:** October 8, 2025

## Overview

A command-line interface for initializing, configuring, and managing Symbiont CMS projects. This would significantly improve the developer experience by providing guided setup and validation.

---

## Proposed Commands

### `symbiont init`

Interactive wizard to create a new `symbiont.config.ts`:

```bash
$ pnpm symbiont init

Welcome to Symbiont CMS! 🌱

Let's set up your configuration...

? What's your Nhost GraphQL endpoint? https://myapp.nhost.run/v1/graphql
? What's your Notion database ID? abc123def456...
? What should we call this database? (e.g., 'blog', 'docs') blog
? Which property determines if a post is published? Status
? What status value means "published"? Published
? Which property contains the publish date? (leave blank for last_edited_time) Publish Date
? Which property contains the slug? Slug
? Should we enable markdown syntax highlighting? Yes
? Should we enable math rendering (KaTeX)? Yes
? Enable ISR caching? Yes
? ISR revalidation time (seconds)? 60

✅ Created symbiont.config.ts
✅ Configuration is valid!

Next steps:
  1. Set environment variables:
     - NHOST_ADMIN_SECRET=your_secret
     - NOTION_TOKEN=your_token
  
  2. Create your sync endpoint:
     pnpm symbiont generate sync
  
  3. Create your post route:
     pnpm symbiont generate route [slug]
```

**Generated file:**
```typescript
// symbiont.config.ts
import type { SymbiontConfig } from 'symbiont-cms';

export default {
  graphqlEndpoint: 'https://myapp.nhost.run/v1/graphql',
  
  databases: [
    {
      short_db_ID: 'blog',
      notionDatabaseId: 'abc123def456',
      
      // Only publish pages with Status = "Published"
      isPublicRule: (page) => 
        page.properties.Status?.select?.name === 'Published',
      
      // Use custom publish date property
      publishDateRule: (page) => 
        page.properties['Publish Date']?.date?.start || page.last_edited_time,
      
      // Use Notion as source of truth
      sourceOfTruthRule: () => 'NOTION',
      
      // Read slug from Slug property
      slugRule: (page) => 
        page.properties.Slug?.rich_text?.[0]?.plain_text || null,
    }
  ],
  
  markdown: {
    syntaxHighlighting: {
      enabled: true,
      showLineNumbers: true,
    },
    math: {
      enabled: true,
    },
    toc: {
      enabled: true,
      minHeadingLevel: 2,
      maxHeadingLevel: 4,
    },
  },
  
  caching: {
    strategy: 'isr',
    isr: {
      enabled: true,
      revalidate: 60,
    },
  },
} satisfies SymbiontConfig;
```

---

### `symbiont config validate`

Validate existing configuration:

```bash
$ pnpm symbiont config validate

Validating symbiont.config.ts...

✅ Configuration syntax is valid
✅ GraphQL endpoint is reachable
✅ Notion database exists (1 database)
⚠️  Warning: No publishDateRule defined - will use last_edited_time
✅ All required functions are defined
✅ Markdown config is valid

Configuration is ready to use! 🎉
```

---

### `symbiont config edit`

Interactive editor for existing config:

```bash
$ pnpm symbiont config edit

Current configuration:
  1. Databases (1)
     - blog (abc123def456)
  2. Markdown settings
  3. Caching settings
  4. Rendering strategy (not configured)

? What would you like to edit? Databases

? Which database? blog (abc123def456)

Database: blog
  1. Change Notion database ID
  2. Edit publishing rules
  3. Edit slug configuration
  4. Add another database
  5. Back

? What would you like to do? Edit publishing rules

Current publishing rules:
  - isPublicRule: Status = "Published"
  - publishDateRule: Uses "Publish Date" property

? Keep current isPublicRule? Yes
? Keep current publishDateRule? No

? Which property contains the publish date? 
  > Last edited time (default)
    Custom property...

✅ Updated symbiont.config.ts
```

---

### `symbiont generate sync`

Generate sync endpoint:

```bash
$ pnpm symbiont generate sync

Generating sync endpoint...

? Where should we create the sync endpoint?
  > src/routes/api/sync/+server.ts (recommended)
    src/routes/api/sync/[database]/+server.ts (multi-database)
    Custom path...

? Enable webhook support? No (polling only)

? Add authentication? Yes
  > Secret token (recommended)
    Nhost authentication
    None (development only)

✅ Created src/routes/api/sync/+server.ts
✅ Created .env.example with CRON_SECRET

Next steps:
  1. Set CRON_SECRET in your .env file
  2. Configure Vercel Cron Job or external scheduler
  3. Test sync: curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:5173/api/sync
```

**Generated file:**
```typescript
// src/routes/api/sync/+server.ts
import { handlePollBlogRequest } from 'symbiont-cms/server';

/**
 * Sync endpoint for Notion → Database sync
 * 
 * Trigger via:
 * - Vercel Cron Job
 * - External scheduler (GitHub Actions, etc.)
 * - Manual: curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/sync
 * 
 * Authentication: Secret token via Authorization header
 */
export const GET = handlePollBlogRequest;
```

---

### `symbiont generate route [slug]`

Generate post route:

```bash
$ pnpm symbiont generate route [slug]

Generating post route...

? What kind of route do you want?
  > Single post route ([slug]/+page.server.ts) - recommended
    Post list route (blog/+page.server.ts)
    Both

? Use default post loader? Yes
  (Fetches post, renders markdown, returns HTML + TOC)

? Enable ISR caching? Yes (configured in symbiont.config.ts)

? Generate page component? 
  > Use Symbiont's PostPage component (recommended)
    Generate custom template
    I'll create my own

✅ Created src/routes/[slug]/+page.server.ts
✅ Created src/routes/[slug]/+page.svelte
✅ Added Prism and KaTeX styles

Next steps:
  1. Customize styling in +page.svelte (classMap prop)
  2. Test route: pnpm dev, visit /your-post-slug
  3. Deploy and sync content!
```

**Generated files:**
```typescript
// src/routes/[slug]/+page.server.ts
export { load } from 'symbiont-cms/server';
```

```svelte
<!-- src/routes/[slug]/+page.svelte -->
<script lang="ts">
  import { PostPage } from 'symbiont-cms';
  import type { PageData } from './$types';
  
  import 'prismjs/themes/prism-tomorrow.css';
  import 'katex/dist/katex.min.css';
  
  export let data: PageData;
</script>

<PostPage 
  post={data.post}
  classMap={{
    h1: 'text-4xl font-bold mb-4',
    div: 'prose prose-lg max-w-none'
  }}
/>
```

---

### `symbiont doctor`

Diagnose common issues:

```bash
$ pnpm symbiont doctor

Running Symbiont diagnostics...

✅ Configuration file found
✅ GraphQL endpoint is reachable
✅ Environment variables set:
   - NHOST_ADMIN_SECRET ✅
   - NOTION_TOKEN ✅
   - CRON_SECRET ✅

✅ Notion API connection successful
✅ Database permissions configured correctly
✅ Sync endpoint exists at /api/sync

⚠️  Issues found:
   - No posts in database yet (run a sync)
   - ISR configured but no route exports config

Recommendations:
  1. Run initial sync: curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:5173/api/sync
  2. Check post routes export ISR config
  3. Consider adding prerendering for popular posts

Overall health: Good 🟢
```

---

### `symbiont test-sync`

Test sync without saving to database:

```bash
$ pnpm symbiont test-sync

Testing Notion sync (dry run)...

📡 Connecting to Notion...
✅ Connected (1 database configured)

📊 Fetching pages from blog...
   Found 15 pages

Processing pages:
  ✅ "My First Post" (slug: my-first-post)
     Status: Published, Date: 2025-10-01
  ⏭️  "Draft Post" (slug: draft-post)
     Skipped: Status = "Draft" (not published)
  ✅ "Another Post" (slug: another-post)
     Status: Published, Date: 2025-10-05
  ...

Summary:
  - 12 posts would be synced
  - 3 posts would be skipped
  - 0 errors

Run actual sync: curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:5173/api/sync
```

---

### `symbiont status`

Show current Symbiont status:

```bash
$ pnpm symbiont status

Symbiont CMS Status

Configuration:
  - Databases: 1 (blog)
  - GraphQL: https://myapp.nhost.run/v1/graphql
  - Rendering: SSR (default)
  - Caching: ISR (60s revalidation)

Database Stats:
  - Posts synced: 42
  - Last sync: 5 minutes ago
  - Sync endpoint: /api/sync

Routes:
  - [slug]/+page.server.ts ✅
  - /api/sync/+server.ts ✅

Environment:
  - NHOST_ADMIN_SECRET: Set ✅
  - NOTION_TOKEN: Set ✅
  - CRON_SECRET: Set ✅

All systems operational 🟢
```

---

## Implementation Plan

### Phase 1: Core CLI (Week 1-2)
- [ ] Create `packages/symbiont-cli` package
- [ ] Implement `symbiont init` with interactive prompts
- [ ] Implement `symbiont config validate`
- [ ] Add to `symbiont-cms` package.json as bin script

### Phase 2: Code Generation (Week 3-4)
- [ ] Implement `symbiont generate sync`
- [ ] Implement `symbiont generate route`
- [ ] Add template system for generated files
- [ ] Support custom templates

### Phase 3: Diagnostics (Week 5)
- [ ] Implement `symbiont doctor`
- [ ] Implement `symbiont test-sync`
- [ ] Implement `symbiont status`
- [ ] Add connection testing utilities

### Phase 4: Advanced Features (Week 6+)
- [ ] Implement `symbiont config edit`
- [ ] Add migration commands
- [ ] Add database introspection
- [ ] Performance profiling tools

---

## Technical Stack

```typescript
// Proposed dependencies
{
  "dependencies": {
    "@clack/prompts": "^0.7.0",    // Beautiful CLI prompts
    "commander": "^11.0.0",         // CLI framework
    "chalk": "^5.3.0",              // Terminal colors
    "ora": "^7.0.0",                // Spinners
    "zod": "^3.22.0",               // Config validation
    "execa": "^8.0.0",              // Run shell commands
    "fs-extra": "^11.1.0",          // File operations
    "inquirer": "^9.2.0"            // Interactive prompts
  }
}
```

---

## User Experience Goals

1. **Zero to working in 5 minutes**
   - Run `symbiont init`
   - Answer prompts
   - Have working config + routes

2. **Helpful error messages**
   - Clear explanations
   - Suggested fixes
   - Links to docs

3. **Safe operations**
   - Validate before writing
   - Show preview of changes
   - Confirm destructive operations

4. **Progressive disclosure**
   - Simple defaults
   - Advanced options available
   - Expert mode for power users

---

## Example: Full Setup Flow

```bash
# 1. Install Symbiont
$ pnpm add symbiont-cms

# 2. Initialize config
$ pnpm symbiont init
✅ Created symbiont.config.ts

# 3. Generate routes
$ pnpm symbiont generate sync
✅ Created src/routes/api/sync/+server.ts

$ pnpm symbiont generate route [slug]
✅ Created src/routes/[slug]/+page.server.ts
✅ Created src/routes/[slug]/+page.svelte

# 4. Check everything
$ pnpm symbiont doctor
✅ All systems operational

# 5. Test sync
$ pnpm symbiont test-sync
✅ 12 posts would be synced

# 6. Run actual sync
$ curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:5173/api/sync

# 7. Check status
$ pnpm symbiont status
✅ 12 posts synced, all systems operational
```

---

## Open Questions

1. **Package structure**: Separate `symbiont-cli` or part of `symbiont-cms`?
2. **Config format**: Support both `.ts` and `.js`? YAML?
3. **Templates**: Allow user-defined templates for code generation?
4. **Migrations**: How to handle config schema changes between versions?
5. **Interactive vs. flags**: Support both `--interactive` and CLI flags?

---

## Priority Assessment

**High Priority** (Do Soon):
- `symbiont init` - Critical for onboarding
- `symbiont config validate` - Prevents common errors
- `symbiont doctor` - Debugging help

**Medium Priority** (Nice to Have):
- `symbiont generate` commands - Speed up setup
- `symbiont test-sync` - Safer testing
- `symbiont status` - Quick overview

**Low Priority** (Future):
- `symbiont config edit` - Advanced, config file editing works
- Migration tools - Only needed when schema changes
- Performance profiling - Edge case

---

## Alternatives Considered

### Option 1: Web-based configurator
- Pros: Visual, no CLI needed
- Cons: Extra complexity, requires hosting

### Option 2: VS Code extension
- Pros: Integrated into editor
- Cons: Only for VS Code users

### Option 3: Config generator website
- Pros: No installation needed
- Cons: Not integrated with project

**Decision: CLI is best** because:
- Works for all editors
- Integrated with project
- Can generate files directly
- Power users love CLIs

---

## Next Steps

1. **Get feedback** on proposed commands
2. **Prioritize features** - what matters most?
3. **Create prototype** of `symbiont init`
4. **Test with real users** during onboarding
5. **Iterate based on feedback**

---

**Related Documents:**
- `.docs/QUICKSTART.md` - Current manual setup process
- `.docs/symbiont-cms.md` - API reference
- `.docs/INTEGRATION_GUIDE.md` - QWER integration

**Questions? Suggestions?** Open an issue or discussion!
