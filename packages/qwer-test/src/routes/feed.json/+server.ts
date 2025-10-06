import type { RequestHandler } from '@sveltejs/kit';
import { siteConfig } from '$config/site';
import { getPosts, type Post as SymbiontPost } from 'symbiont-cms';

const fetchPosts = async (fetch: typeof globalThis.fetch): Promise<any[]> => {
  try {
    const postsFromDb = await getPosts({ fetch, limit: 100 });
      
    return postsFromDb
      .filter((post) => {
        // Filter out unlisted posts (if that field exists)
        return true; // Adjust based on your needs
      })
      .map((post) => ({
        id: post.slug,
        url: `${new URL(post.slug, siteConfig.url).href}`,
        title: post.title ?? 'Untitled',
        summary: post.content?.substring(0, 200) ?? '',
        image: undefined,
        date_published: post.publish_at ?? new Date().toISOString(),
        date_modified: post.updated_at ?? post.publish_at ?? new Date().toISOString(),
        content_text: post.content,
        content_html: post.content, // Can be rendered as HTML if needed
        tags: Array.isArray(post.tags) ? post.tags : []
      }));
  } catch (error) {
    console.error('[feed.json] Error fetching posts from database:', error);
  }
  
  // Fallback to empty array if database not available
  return [];
};

const render = async (fetch: typeof globalThis.fetch) => {
  const items = await fetchPosts(fetch);
  
  return {
    version: 'https://jsonfeed.org/version/1.1',
    title: siteConfig.title,
    home_page_url: siteConfig.url,
    feed_url: `${new URL(`feed.json`, siteConfig.url).href}`,
    description: siteConfig.description,
    icon: siteConfig.author.avatar,
    favicon: `${new URL(`favicon.png`, siteConfig.url).href}`,
    authors: [
      {
        name: siteConfig.author.name,
        url: siteConfig.author.github,
        avatar: siteConfig.author.avatar,
      },
    ],
    language: siteConfig.lang ?? 'en',
    items
  };
};

export const GET: RequestHandler = async ({ fetch }) =>
  new Response(JSON.stringify(await render(fetch), null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
    },
  });
