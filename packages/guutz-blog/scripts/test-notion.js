// scripts/test-notion-content.js
import { Client } from '@notionhq/client';
import { NotionToMarkdown } from 'notion-to-md';
import 'dotenv/config';

// This script tests fetching both the pages from a database AND their content.

async function testNotionContent() {
  console.log('--- Notion Content Test Script ---');

  const notionKey = process.env.NOTION_API_KEY;
  const databaseId = process.env.NOTION_BLOG_DATABASE_ID;

  if (!notionKey || !databaseId) {
    console.error('❌ Error: Missing NOTION_API_KEY or NOTION_BLOG_DATABASE_ID in your .env file.');
    return;
  }

  const notion = new Client({ auth: notionKey });
  // Initialize notion-to-md
  const n2m = new NotionToMarkdown({ notionClient: notion });

  console.log(`🔍 Querying Notion Database ID: ${databaseId}`);

  try {
    // Helper to support different versions of @notionhq/client and environments
    async function queryDatabase(notionClient, token, databaseId) {
      if (notionClient && typeof notionClient.databases?.query === 'function') {
        return notionClient.databases.query({ database_id: databaseId });
      }

      // If the SDK doesn't expose the high-level API, use a direct fetch to the Notion REST API.
      const res = await fetch(`https://api.notion.com/v1/databases/${databaseId}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json'
        }
      });

      if (!res.ok) throw new Error(`Notion API error: ${res.status} ${res.statusText}`);
      return res.json();
    }

    const response = await queryDatabase(notion, notionKey, databaseId);

    if (response.results.length === 0) {
      console.warn('⚠️ The query was successful, but the database returned 0 pages.');
      return;
    }

    console.log(`\n✅ Found ${response.results.length} page(s). Now fetching content for each...`);
    console.log('====================================================\n');

    // Loop through each page found in the database
    for (const page of response.results) {
      // In Notion, the main title property is often called 'Name' or 'Title'.
      // You might need to adjust 'Name' to match your database's property name.
      const titleProperty = Object.values(page.properties).find(prop => prop.type === 'title');
      const title = titleProperty ? titleProperty.title[0]?.plain_text : 'Untitled Page';

      console.log(`--- Processing Page: "${title}" (ID: ${page.id}) ---`);

  // 1. Fetch the blocks (content) for the current page
  const mdblocks = await n2m.pageToMarkdown(page.id);

  // 2. Convert the blocks to a markdown string (defensive extraction)
  const mdResult = n2m.toMarkdownString(mdblocks);
  let mdString = '';
  if (typeof mdResult === 'string') mdString = mdResult;
  else if (mdResult && typeof mdResult.parent === 'string') mdString = mdResult.parent;
  else mdString = '';

  // 3. Log the result (show placeholder when empty)
  console.log('\n--- Markdown Content ---');
  console.log(mdString || '(empty)');
  console.log('--- End of Content ---\n');
      console.log('====================================================\n');
    }

  } catch (error) {
    console.error('\n❌ An error occurred while fetching content:');
    console.error('----------------------------------------------------');
    console.error(error);
  }
}

testNotionContent();
