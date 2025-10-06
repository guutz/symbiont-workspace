# 🚀 Quick Start: Running QWER-Test with Symbiont Database

## Prerequisites
- Nhost project with GraphQL endpoint
- Posts synced to your database (via Symbiont)
- Node.js 18+ and pnpm installed

## Step 1: Configure Environment

Create `.env` file in `packages/qwer-test/`:

```bash
PUBLIC_NHOST_GRAPHQL_URL=https://your-project.nhost.run/v1/graphql
```

💡 **Tip:** Copy from `.env.example` and fill in your values

## Step 2: Build Symbiont Package

From workspace root:

```bash
pnpm -F symbiont-cms build
```

Or from symbiont-cms directory:

```bash
cd packages/symbiont-cms
npm run build
```

## Step 3: Run QWER-Test

From workspace root:

```bash
pnpm -F qwer-test dev
```

Or from qwer-test directory:

```bash
cd packages/qwer-test
npm run dev
```

## Step 4: Visit Your Site

Open browser to: **http://localhost:5173**

- Homepage: All posts from database
- Individual post: `http://localhost:5173/[slug]`

## 🎉 That's it!

Your blog is now:
- ✅ Pulling posts from Nhost database
- ✅ Displaying with QWER's beautiful UI
- ✅ Updating without rebuilds

💡 **This is the foundation of the Zero-Rebuild CMS!** See `zero-rebuild-cms-vision.md` for the complete architecture vision.

## Troubleshooting

### No posts showing?

1. Check browser console for errors
2. Verify `PUBLIC_NHOST_GRAPHQL_URL` is correct
3. Ensure posts exist in database with `publish_at` dates
4. Try visiting GraphQL endpoint directly in browser

### Module not found errors?

```bash
# Rebuild symbiont-cms
pnpm -F symbiont-cms build

# Reinstall dependencies
pnpm install
```

### TypeScript errors?

- Restart your editor/language server
- Run `pnpm -F qwer-test check` to see actual errors
- Some errors may resolve after first dev server start

## Next Steps

- [ ] Add your first post in Notion
- [ ] Trigger Symbiont webhook to sync
- [ ] Refresh your site to see new post
- [ ] Customize the `[slug]/+page.svelte` styling
- [ ] Set up pagination (see INTEGRATION_GUIDE.md)

## Learn More

- **Symbiont CMS Guide**: `.docs/symbiont-cms.md` 📦 - Complete guide
- **Architecture vision**: `.docs/zero-rebuild-cms-vision.md` 🎯
- Full integration guide: `.docs/INTEGRATION_GUIDE.md`
- Image strategy: `.docs/image-optimization-strategy.md`
- File management: `.docs/dynamic-file-management.md`
- Redirects: `.docs/dynamic-redirects-strategy.md`
- QWER documentation: `packages/qwer-test/README.md`

---

**Need help?** Check the full integration guide for detailed architecture and troubleshooting!
