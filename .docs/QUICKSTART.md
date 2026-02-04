# 🚀 Quick Start: Symbiont CMS with Supabase

Spin up the demo stack (Symbiont CMS with Supabase backend) in minutes.

---

## Prerequisites

- Node.js 18+ and `pnpm`
- A Supabase project (grab the URL, anon key, and service role key)
- At least one published post in your Notion database

---

## 1. Wire up environment variables

Create `packages/california-tech/.env` (or `packages/guutz-blog/.env`):

```bash
# From Supabase Dashboard → Project Settings → API
VITE_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# From https://www.notion.so/my-integrations
NOTION_TOKEN=secret_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# From Supabase Dashboard → Project Settings → API (service_role key)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# For authenticating sync jobs
CRON_SECRET=your-random-secret-here
```

---

## 2. Build the Symbiont package (once per code change)

```bash
pnpm -F symbiont-cms build
```

The apps consume the built output from `packages/symbiont-cms/dist`. Re-run this command whenever you edit the package.

---

## 3. Start the development server

```bash
pnpm dev:tech   # for california-tech
# or
pnpm dev:guutz  # for guutz-blog
```

Visit `http://localhost:5173`:

- `/` – shows the latest posts pulled from Supabase
- `/[slug]` – server-rendered post page
- `/feed.json`, `/sitemap.xml`, `/atom.xml` – all backed by live data

---

## 4. Sync new content

Trigger a manual sync while the dev server runs:

```bash
curl "http://localhost:5173/api/sync?secret=$CRON_SECRET"
```

Within a second or two the homepage should reflect your latest Notion changes. Set up a webhook or cron job for automatic syncing in production.

---

## Troubleshooting cheat sheet

| Symptom | Try this |
|---------|----------|
| Empty homepage | Verify Supabase credentials, ensure posts are published, and rebuild `symbiont-cms`. |
| `Cannot find module 'symbiont-cms/…'` | Run `pnpm -F symbiont-cms build` again – the apps read the compiled output. |
| Type errors in the editor | Restart the TS server or run `pnpm check` after the first successful dev build. |
| Sync endpoint 500s | Confirm `SUPABASE_SERVICE_ROLE_KEY` and `NOTION_TOKEN` exist in `.env`. |

---

## Where to go next

- Walk through the full wiring in `INTEGRATION_GUIDE.md`
- Review `TYPE_COMPATIBILITY.md` before mapping Symbiont posts into custom UIs
- Check `2026-02-01-supabase-image-strategy.md` for image handling implementation

**Need deeper context?** The architectural rationale lives in `symbiont-cms.md` and `zero-rebuild-cms-vision.md`.
