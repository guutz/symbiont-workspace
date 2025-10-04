# Symbiont Workspace

Monorepo for Symbiont CMS and integrated blog applications.

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
