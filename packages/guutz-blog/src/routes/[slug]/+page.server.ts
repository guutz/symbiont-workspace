// src/routes/[slug]/+page.server.ts
import fs from 'fs';
import path from 'path';
import type { EntryGenerator } from './$types';

// This function runs at build time and provides the list of all blog slugs.
// This is what solves the prerender error.
export const entries: EntryGenerator = () => {
  const postsDir = path.join(process.cwd(), 'content/blogs');
  const filenames = fs.readdirSync(postsDir);

  return filenames.map((filename) => ({
    slug: filename.replace(/\.md$/, ''),
  }));
};
