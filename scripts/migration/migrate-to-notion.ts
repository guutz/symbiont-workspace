#!/usr/bin/env tsx
/**
 * Markdown to Notion Migration Script
 * 
 * Migrates Hugo markdown files with images to Notion + Nhost Storage.
 * 
 * Usage:
 *   cd scripts/migration
 *   pnpm tsx migrate-to-notion.ts --dry-run
 *   pnpm tsx migrate-to-notion.ts
 * 
 * Required environment variables (.env):
 *   CONTENT_DIR - Path to markdown files
 *   STATIC_DIR - Path to static files  
 *   NOTION_API_KEY - Notion integration token
 *   NOTION_DATABASE_ID - Notion database ID
 *   NHOST_SUBDOMAIN - Nhost subdomain
 *   NHOST_REGION - Nhost region
 */

import 'dotenv/config';
import { readFile, writeFile, readdir } from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { Client } from '@notionhq/client';
import NhostDefault from '@nhost/nhost-js';
import type { NhostClient } from '@nhost/nhost-js';
import { markdownToBlocks } from '@tryfabric/martian';
import type { BlockObjectRequest } from '@notionhq/client/build/src/api-endpoints.js';

const { createClient } = NhostDefault as any;

const isDryRun = process.argv.includes('--dry-run');

interface ImageReference {
  url: string;
  alt: string;
  isLocal: boolean;
}

interface MarkdownFile {
  path: string;
  frontmatter: Record<string, any>;
  content: string;
  images: ImageReference[];
}

interface MigrationResult {
  file: string;
  notionId: number;
  success: boolean;
  imagesUploaded: number;
  notionUpdated: boolean;
  error?: string;
}

// Extract images from markdown
function extractImages(markdown: string): ImageReference[] {
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const images: ImageReference[] = [];
  let match;

  while ((match = imageRegex.exec(markdown)) !== null) {
    const alt = match[1];
    const url = match[2];
    const isLocal = !url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('data:');
    
    images.push({ url, alt, isLocal });
  }

  return images;
}

// Read markdown file with frontmatter
async function readMarkdownFile(filePath: string): Promise<MarkdownFile> {
  const content = await readFile(filePath, 'utf-8');
  const { data: frontmatter, content: markdownContent } = matter(content);
  
  return {
    path: filePath,
    frontmatter,
    content: markdownContent,
    images: extractImages(markdownContent),
  };
}

// Find all markdown files with a specific frontmatter field
async function findMarkdownFilesWithField(dir: string, fieldName: string): Promise<MarkdownFile[]> {
  const results: MarkdownFile[] = [];
  
  async function traverse(currentDir: string) {
    const entries = await readdir(currentDir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      
      if (entry.isDirectory()) {
        await traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const file = await readMarkdownFile(fullPath);
        
        if (file.frontmatter[fieldName] !== undefined) {
          results.push(file);
        }
      }
    }
  }
  
  await traverse(dir);
  return results;
}

// Write updated markdown file
async function writeMarkdownFile(file: MarkdownFile, updatedContent: string): Promise<void> {
  const output = matter.stringify(updatedContent, file.frontmatter);
  await writeFile(file.path, output, 'utf-8');
}

// Upload image to Nhost Storage
async function uploadImageToNhost(
  nhostClient: NhostClient,
  dataUrl: string,
  filename: string,
  bucketId: string,
  pathPrefix: string
): Promise<string> {
  // Convert data URL to Blob
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const file = new File([blob], filename, { type: blob.type });

  // Upload to Nhost Storage using the correct API
  try {
    const uploadResp = await nhostClient.storage.uploadFiles({
      'bucket-id': bucketId,
      'file[]': [file],
      'metadata[]': [{
        name: `${pathPrefix}${filename}`,
        metadata: {
          uploadedFrom: 'hugo-migration'
        }
      }]
    });

    if (!uploadResp.body?.processedFiles?.[0]) {
      throw new Error(`No file metadata returned for ${filename}`);
    }

    const fileMetadata = uploadResp.body.processedFiles[0];

    // Construct public URL from Nhost subdomain and file ID
    const nhostSubdomain = process.env.NHOST_SUBDOMAIN;
    const nhostRegion = process.env.NHOST_REGION || 'us-west-2';
    const publicUrl = `https://${nhostSubdomain}.storage.${nhostRegion}.nhost.run/v1/files/${fileMetadata.id}`;

    return publicUrl;
  } catch (error) {
    throw new Error(`Failed to upload ${filename}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function main() {
  console.log('\n🚀 Markdown → Notion + Nhost Migration\n');

  // Load configuration from environment
  const contentDir = process.env.CONTENT_DIR;
  const staticDir = process.env.STATIC_DIR;
  const notionApiKey = process.env.NOTION_API_KEY;
  const notionDatabaseId = process.env.NOTION_DATABASE_ID;
  const nhostSubdomain = process.env.NHOST_SUBDOMAIN;
  const nhostRegion = process.env.NHOST_REGION;

  if (!contentDir || !staticDir || !notionApiKey || !notionDatabaseId || !nhostSubdomain || !nhostRegion) {
    console.error('❌ Missing required environment variables!');
    console.error('Required: CONTENT_DIR, STATIC_DIR, NOTION_API_KEY, NOTION_DATABASE_ID, NHOST_SUBDOMAIN, NHOST_REGION');
    process.exit(1);
  }

  const nhostClient = createClient({
    subdomain: nhostSubdomain!,
    region: nhostRegion!,
  });

  const notionClient = new Client({ auth: notionApiKey });

  if (isDryRun) {
    console.log('🏃 DRY RUN MODE - No changes will be made\n');
  }

  console.log(`Content: ${contentDir}`);
  console.log(`Static: ${staticDir}`);
  console.log(`Nhost: ${nhostSubdomain}.${nhostRegion}\n`);

  // Find all markdown files with notionId
  console.log('📂 Scanning for markdown files with notionId...');
  const files = await findMarkdownFilesWithField(contentDir, 'notionId');
  console.log(`✅ Found ${files.length} files\n`);

  if (files.length === 0) {
    console.log('No files to process.');
    return;
  }

  const results: MigrationResult[] = [];

  // Check for --limit flag to process only first N files
  const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1]) : files.length;
  const filesToProcess = files.slice(0, limit);

  if (limit < files.length) {
    console.log(`⚠️  Processing only first ${limit} file(s)\n`);
  }

  for (let i = 0; i < filesToProcess.length; i++) {
    const file = filesToProcess[i];
    const notionId = file.frontmatter.notionId as number;
    const relativePath = path.relative(contentDir, file.path);

    console.log(`\n[${i + 1}/${filesToProcess.length}] ${relativePath}`);
    console.log(`  Notion ID: ${notionId}`);
    console.log(`  Images: ${file.images.length}`);

    const result: MigrationResult = {
      file: relativePath,
      notionId,
      success: false,
      imagesUploaded: 0,
      notionUpdated: false,
    };

    try {
      let updatedMarkdown = file.content;
      let uploadedCount = 0;

      // Process images: convert local paths to data URLs, upload, rewrite markdown
      if (file.images.length > 0) {
        console.log(`\n  📸 ${isDryRun ? 'Images found' : 'Processing images'}:`);

        const localImages = file.images.filter(img => img.isLocal);
        const imageErrors: string[] = [];

        for (const img of file.images) {
          if (img.isLocal) {
            try {
              // Read local file to get size
              const localPath = path.join(staticDir, img.url);
              const buffer = await readFile(localPath);
              const filename = path.basename(img.url);
              const sizeKB = (buffer.length / 1024).toFixed(1);
              
              if (isDryRun) {
                console.log(`    • ${filename} (${sizeKB} KB)`);
              } else {
                const ext = path.extname(localPath).toLowerCase();
                
                const mimeTypes: Record<string, string> = {
                  '.jpg': 'image/jpeg',
                  '.jpeg': 'image/jpeg',
                  '.png': 'image/png',
                  '.gif': 'image/gif',
                  '.webp': 'image/webp',
                  '.svg': 'image/svg+xml',
                };
                
                const mimeType = mimeTypes[ext] || 'image/jpeg';
                const base64 = buffer.toString('base64');
                const dataUrl = `data:${mimeType};base64,${base64}`;

                // Upload to Nhost
                const publicUrl = await uploadImageToNhost(
                  nhostClient,
                  dataUrl,
                  filename,
                  'blog-images',
                  `${notionId}/`
                );

                // Replace in markdown
                updatedMarkdown = updatedMarkdown.replace(
                  new RegExp(`!\\[([^\\]]*)\\]\\(${img.url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g'),
                  `![$1](${publicUrl})`
                );

                uploadedCount++;
                console.log(`    ✓ ${filename} (${sizeKB} KB)`);
              }
            } catch (error: any) {
              const errorMsg = `${img.url}: ${error.message}`;
              imageErrors.push(errorMsg);
              console.error(`    ✗ ${errorMsg}`);
            }
          }
        }

        // Stop processing if any images failed to upload
        if (!isDryRun && imageErrors.length > 0) {
          throw new Error(`Failed to upload ${imageErrors.length} image(s). Skipping Notion sync to avoid broken links.`);
        }

        result.imagesUploaded = isDryRun ? localImages.length : uploadedCount;

        if (!isDryRun) {
          // Update markdown file with new URLs
          await writeMarkdownFile(file, updatedMarkdown);
          console.log(`  ✅ Updated markdown file`);
        }
      }

      // Sync to Notion
      console.log(`\n  📤 Syncing to Notion...`);
      
      // Find page by notionId (unique_id property with TECH- prefix)
      const response = await notionClient.dataSources.query({
        data_source_id: notionDatabaseId,
        filter: {
          property: 'ID',  // The name of your unique_id property in Notion
          unique_id: {
            equals: notionId
          }
        }
      });
      
      if (response.results.length === 0) {
        throw new Error(`No Notion page found with unique_id ID=TECH-${notionId}`);
      }
      
      const page = response.results[0] as any;
      const pageId = page.id;
      
      // Extract title from the page
      const titleProp = Object.values(page.properties || {}).find(
        (prop: any) => prop.type === 'title'
      ) as any;
      const notionTitle = titleProp?.title?.[0]?.plain_text || 'Untitled';
      
      console.log(`  ✓ Found: "${notionTitle}" (TECH-${notionId})`);
      
      if (!isDryRun) {
        const blocks = markdownToBlocks(updatedMarkdown, {
          strictImageUrls: false,
          notionLimits: { truncate: true }
        }) as unknown as BlockObjectRequest[];
        
        // Delete existing blocks
        const existingBlocks = await notionClient.blocks.children.list({ block_id: pageId });
        for (const block of existingBlocks.results) {
          if ('type' in block) {
            await notionClient.blocks.delete({ block_id: block.id });
          }
        }
        
        // Add new blocks (100 blocks per request max - Notion API limit)
        const chunkSize = 100;
        for (let j = 0; j < blocks.length; j += chunkSize) {
          const chunk = blocks.slice(j, j + chunkSize);
          await notionClient.blocks.children.append({
            block_id: pageId,
            children: chunk,
          });
        }
      } else {
        console.log(`  [DRY RUN] Would sync ${updatedMarkdown.split('\n').length} lines of markdown`);
      }
      
      result.notionUpdated = true;
      result.success = true;

      console.log(`  ✅ Success!`);
    } catch (error: any) {
      result.error = error.message;
      console.error(`  ❌ Error: ${error.message}`);
    }

    results.push(result);
  }

  // Summary
  console.log('\n\n📊 Summary\n');
  const successful = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;
  const totalImages = results.reduce((sum, r) => sum + r.imagesUploaded, 0);

  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📸 Images: ${totalImages}`);

  if (failed > 0) {
    console.log('\n❌ Failed:');
    results.filter((r) => !r.success).forEach((r) => {
      console.log(`  • ${r.file}: ${r.error}`);
    });
  }

  if (isDryRun) {
    console.log('\n💡 Dry run complete. Run without --dry-run to apply changes.');
  }

  console.log('\n');
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
