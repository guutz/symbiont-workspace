# Symbiont Workspace

Monorepo for Symbiont CMS and integrated blog applications.

> **📚 Complete Documentation**: See the [`.docs/`](.docs/) folder for comprehensive guides, architecture docs, and implementation strategies. Start with [`.docs/README.md`](.docs/README.md) for the reading order.

## 📦 Packages

### `symbiont-cms`
Database-backed CMS that syncs content from Notion to Nhost/Postgres via GraphQL.

**Key Features:**
- Notion → Database sync via webhooks
- GraphQL client/server utilities
- Markdown rendering components
- Type-safe post management

### `qwer-test`
Beautiful blog UI built with QWER theme, now powered by Symbiont's database backend.

**Integration:**
- Dynamic post loading from database
- Real-time updates without rebuilds
- Full QWER UI/UX maintained
- Server-side rendering with SvelteKit

### `guutz-blog`
Personal blog implementation using Symbiont CMS.

## 🚀 Quick Start

**What's Working:**
- ✅ Dynamic post loading from Notion → Nhost → SvelteKit
- ✅ Real-time updates without rebuilds
- ✅ GraphQL client/server utilities
- ✅ Markdown rendering with feature detection
- ✅ Feed generation (Atom, JSON, Sitemap)

**What's Designed (Not Yet Implemented):**
- 📋 File upload system (design in `.docs/dynamic-file-management.md`)
- 📋 Dynamic redirects (design in `.docs/dynamic-redirects-strategy.md`)
- 📋 Observability/logging infrastructure

---

### Setup Instructions

1. **Configure environment:**
   ```bash
   cd packages/qwer-test
   cp .env.example .env
   # Add your PUBLIC_NHOST_GRAPHQL_URL
   ```

2. **Build Symbiont:**
   ```bash
   pnpm -F symbiont-cms build
   ```

3. **Run development server:**
   ```bash
   pnpm -F qwer-test dev
   ```

## 📚 Documentation

Detailed documentation is available in the `.docs/` folder (gitignored):
- **INTEGRATION_GUIDE.md** - Full integration architecture
- **TYPE_COMPATIBILITY.md** - Type system details
- **QUICKSTART.md** - Setup instructions

These docs are AI-generated and can be regenerated as needed.

## 🔧 Recent Changes

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
Symbiont Webhook Sync
      ↓
Nhost/Postgres + GraphQL
      ↓
SvelteKit Load Functions
      ↓
QWER UI Components
```

---

**Workspace Type:** pnpm monorepo  
**Primary Stack:** SvelteKit, TypeScript, GraphQL, Nhost
