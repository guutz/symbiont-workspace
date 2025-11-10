# 🚀 Quick Start: QWER-Test + Symbiont CMS

Spin up the demo stack (Symbiont CMS feeding the QWER theme) in minutes.

---

## Prerequisites

- Node.js 18+ and `pnpm`
- An Nhost project (grab the GraphQL endpoint + admin secret)
- At least one published post in your Notion database synced to Nhost

---

## 1. Wire up environment variables

Create `packages/qwer-test/.env` (copy `/.env.example` if present):

```bash
PUBLIC_NHOST_GRAPHQL_URL=https://YOUR-PROJECT.nhost.run/v1/graphql
PUBLIC_SITE_URL=http://localhost:5173            # optional but handy for feeds
```

Keep secrets (`NHOST_ADMIN_SECRET`, `NOTION_TOKEN`) in the workspace root `.env` so server routes can access them.

---

## 2. Build the Symbiont package (once per code change)

```bash
pnpm -F symbiont-cms build
```

The QWER example consumes the built output from `packages/symbiont-cms/dist`. Re-run this command whenever you edit the package.

---

## 3. Start the QWER test app

```bash
pnpm -F qwer-test dev
```

Visit `http://localhost:5173`:

- `/` – shows the latest posts pulled from Nhost via `getPosts`
- `/[slug]` – server-rendered post page using `postLoad` + `PostPage`
- `/feed.json`, `/sitemap.xml`, `/atom.xml` – all backed by live data

---

## 4. Sync new content

Trigger a manual sync while the dev server runs:

```bash
curl http://localhost:5173/api/sync/poll-blog
```

Within a second or two the homepage should reflect your latest Notion changes. Use the webhook endpoint for real-time updates in production.

---

## Troubleshooting cheat sheet

| Symptom | Try this |
|---------|----------|
| Empty homepage | Verify `PUBLIC_NHOST_GRAPHQL_URL`, ensure posts have `publish_at`, and rebuild `symbiont-cms`. |
| `Cannot find module 'symbiont-cms/…'` | Run `pnpm -F symbiont-cms build` again – the QWER app reads the compiled output. |
| Type errors in the editor | Restart the TS server or run `pnpm -F qwer-test check` after the first successful dev build. |
| Sync endpoint 500s | Confirm `NHOST_ADMIN_SECRET` and `NOTION_TOKEN` exist in the root `.env`. |

---

## Where to go next

- Walk through the full wiring in `INTEGRATION_GUIDE.md`
- Review `TYPE_COMPATIBILITY.md` before mapping Symbiont posts into custom UIs
- Start planning Phase 2 (dynamic assets) with `image-optimization-strategy.md`

**Need deeper context?** The architectural rationale lives in `symbiont-cms.md` and `zero-rebuild-cms-vision.md`.
