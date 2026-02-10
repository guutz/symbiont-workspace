# Symbiont Workspace

Monorepo for Symbiont CMS and integrated blog applications.

> **📚 Complete Documentation**: See the [`.docs/`](.docs/) folder for comprehensive guides, architecture docs, and implementation strategies. Start with [`.docs/README.md`](.docs/README.md) for the reading order.

## 📦 Packages

### `symbiont-cms`
Database-backed CMS that syncs content from Notion to Supabase/Postgres.

**Key Features:**
- Notion → Database sync via webhooks and polling
- Supabase client/server utilities
- Markdown rendering components
- Type-safe post management
- Image upload to Supabase Storage

### `california-tech`
California Tech newspaper site built with SvelteKit, powered by Symbiont's database backend.

**Integration:**
- Dynamic post loading from database
- Real-time updates without rebuilds
- Server-side rendering with SvelteKit
- Image optimization with Supabase Storage

### `guutz-blog`
Personal blog implementation using Symbiont CMS.

## 🚀 Quick Start

**What's Working:**
- ✅ Dynamic post loading from Notion → Supabase → SvelteKit
- ✅ Real-time updates without rebuilds
- ✅ Supabase client/server utilities
- ✅ Markdown rendering with feature detection
- ✅ Feed generation (Atom, JSON, Sitemap)
- ✅ Image upload to Supabase Storage with content-hash filenames

**What's In Progress:**
- 🚧 Bidirectional sync (database → Notion)
- 🚧 Markdown-to-Notion block conversion (Martian fork integrated)

**What's Designed (Not Yet Implemented):**
- 📋 Dynamic redirects (design in `.docs/dynamic-redirects-strategy.md`)
- 📋 Observability/logging infrastructure

---

### Setup Instructions

1. **Configure environment:**
   ```bash
   cd packages/california-tech  # or packages/guutz-blog
   cp .env.example .env
   # Add your Supabase credentials and Notion token
   ```

2. **Build Symbiont:**
   ```bash
   pnpm -F symbiont-cms build
   ```

3. **Run development server:**
   ```bash
   pnpm dev:tech    # for california-tech
   pnpm dev:guutz   # for guutz-blog
   ```

## 📚 Documentation

Detailed documentation is available in the `.docs/` folder (gitignored):
- **INTEGRATION_GUIDE.md** - Full integration architecture
- **TYPE_COMPATIBILITY.md** - Type system details
- **QUICKSTART.md** - Setup instructions

These docs are AI-generated and can be regenerated as needed.

## 🔧 Recent Changes

**Feb 4, 2026:**
- ✅ Completed Supabase migration from Nhost
- ✅ Integrated forked Martian package for markdown-to-Notion conversion
- ✅ Implemented content-hash based filename management for images
- ✅ Added original URL metadata to uploaded images
- ✅ Updated guutz-blog to use new symbiont.ts client configuration

**Oct 8, 2025:**
- 📝 Documentation accuracy update: clarified implementation status
- ✅ Phase 1 (Posts) is production-ready and fully implemented
- 📋 Phases 2-3 (Media/Redirects) have complete designs but await implementation

**Oct 4, 2025:**
- ✅ Integrated QWER with Symbiont database backend
- ✅ Added dynamic post loading from GraphQL
- ✅ Improved type compatibility between systems
- ✅ Added declaration maps for better IDE navigation
- ✅ Created individual post routes with `[slug]` pattern

## 🛠️ Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm -r build

# Run specific package
pnpm -F <package-name> dev
```

## 📖 Architecture

```
Notion Database
      ↓
Symbiont Webhook/Poll Sync
      ↓
Supabase (Postgres + Storage)
      ↓
SvelteKit Load Functions
      ↓
UI Components
```

---

**Workspace Type:** pnpm monorepo  
**Primary Stack:** SvelteKit, TypeScript, Supabase, Notion API
