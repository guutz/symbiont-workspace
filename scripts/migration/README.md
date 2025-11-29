# Migration Scripts

Standalone scripts for content migration and testing reverse sync.

## Setup

```bash
cd scripts/migration
cp .env.example .env
# Edit .env with your credentials
pnpm install
```

## Scripts

### Migrate Hugo Content to Notion

```bash
pnpm migrate --dry-run  # Test run
pnpm migrate            # Actual migration
```

Migrates Hugo markdown files with:
- Local image upload to Nhost Storage
- Markdown to Notion blocks conversion
- URL rewriting in source files

### Test Reverse Sync (DB → Notion)

```bash
pnpm test-reverse <notion-page-id> --dry-run
pnpm test-reverse <notion-page-id>
```

Tests publishing content from Nhost database back to Notion.

## Alternative: Run from workspace root

```bash
# From workspace root (no install needed)
pnpm tsx scripts/migration/migrate-to-notion.ts --dry-run
pnpm tsx scripts/migration/test-reverse-sync.ts <notion-page-id> --dry-run
```
