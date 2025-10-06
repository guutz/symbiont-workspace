# Symbiont CMS

> **📖 Full Documentation**: See [.docs/symbiont-cms.md](../../.docs/symbiont-cms.md) in the workspace root

A powerful, flexible CMS package for SvelteKit applications that syncs content from Notion to your database.

## Quick Links

- **[Complete Documentation](../../.docs/symbiont-cms.md)** - Full guide: philosophy, architecture, API, and examples
- **[Quick Start Guide](../../.docs/QUICKSTART.md)** - Get up and running in 5 minutes

## Installation

```bash
npm install symbiont-cms
# or
pnpm add symbiont-cms
```

## Quick Example

```svelte
<!-- src/routes/blog/[slug]/+page.svelte -->
<script lang="ts">
  import { BlogPostPage } from 'symbiont-cms';
  export let data;
</script>

<BlogPostPage post={data.post} />
```

```typescript
// src/routes/blog/[slug]/+page.server.ts
export { blogLoad as load } from 'symbiont-cms/server';
```

---

**For complete documentation, installation guide, API reference, and examples, see [.docs/symbiont-cms-package.md](../../.docs/symbiont-cms-package.md)**
