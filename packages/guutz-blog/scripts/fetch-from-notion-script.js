#!/usr/bin/env node
import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function run(options = {}) {
  const {
    outputDir = 'content/blogs',
    notionSecret = process.env.NOTION_SECRET,
    databaseId = process.env.NOTION_PAGE_ID
  } = options;

  console.log('🚀 Starting Notion sync...');

  if (!notionSecret || !databaseId) {
    console.warn('❌ Missing NOTION_SECRET or NOTION_PAGE_ID. Skipping Notion sync.');
    return;
  }

  const notion = new Client({ auth: notionSecret });
  const n2m = new NotionToMarkdown({ notionClient: notion });
  const absoluteOutputDir = path.join(process.cwd(), outputDir);

  try {
    if (!fs.existsSync(absoluteOutputDir)) {
      fs.mkdirSync(absoluteOutputDir, { recursive: true });
    }

    // Support multiple @notionhq/client versions and environments:
    // 1) If the SDK exposes `databases.query`, use it.
    // 2) If the client has a low-level `request` method, use that.
    // 3) Fallback to a direct fetch to the Notion REST API.
    async function queryDatabase(notionClient, token, databaseId, filter) {
      const body = filter ? { filter } : {};

      if (notionClient && typeof notionClient.databases?.query === 'function') {
        return notionClient.databases.query({ database_id: databaseId, ...body });
      }

      // If the SDK doesn't expose the high-level API, use a direct fetch to the Notion REST API.
      // (Some SDK builds expose a low-level `request` with unexpected path handling; skip it.)
      // Node 18+ and modern environments provide global fetch. Use fetch as a fallback.
      const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Notion REST API error: ${res.status} ${res.statusText} - ${text}`);
      }

      return res.json();
    }

    const response = await queryDatabase(notion, notionSecret, databaseId, {
      property: 'Tags',
      multi_select: { contains: 'LIVE' }
    });

    for (const page of response.results) {
      const titleProperty = Object.values(page.properties).find(prop => prop.type === 'title');
      if (!titleProperty || !titleProperty.title[0]) continue;

      const pageTitle = titleProperty.title[0].plain_text;
      const slug = pageTitle.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const mdblocks = await n2m.pageToMarkdown(page.id);
  const mdResult = n2m.toMarkdownString(mdblocks);
  let mdString = '';
  if (typeof mdResult === 'string') mdString = mdResult;
  else if (mdResult && typeof mdResult.parent === 'string') mdString = mdResult.parent;
  else mdString = '';

  const frontmatter = `---\ntitle: "${pageTitle}"\ndate: "${page.last_edited_time}"\n---\n\n`;

  const finalContent = frontmatter + mdString;
      const filePath = path.join(absoluteOutputDir, `${slug}.md`);
      fs.writeFileSync(filePath, finalContent);
      console.log(`✓ Synced: ${pageTitle} -> ${filePath}`);
    }

    console.log(`✅ Notion sync complete!`);
  } catch (error) {
    console.error('❌ Error during Notion sync:', error);
    process.exit(1);
  }
}

run().catch(err => {
  console.error('❌ Unhandled error in Notion sync script:', err);
  process.exit(1);
});
