export const prerender = true;
import type { RequestHandler } from '@sveltejs/kit';
import { siteConfig } from '$config/site';
import type { Post } from '$lib/types/post';
import LZString from 'lz-string';
import { createSymbiontGraphQLClient, getAllPosts } from 'symbiont-cms/client';

const getPosts = async () => {
  // Try to get posts from database
  const graphqlEndpoint = process.env.PUBLIC_NHOST_GRAPHQL_URL;
  
  if (graphqlEndpoint) {
    try {
      const client = createSymbiontGraphQLClient(graphqlEndpoint);
      const postsFromDb = await getAllPosts(client, { limit: 100 });
      
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
  }
  
  // Fallback to empty array if database not available
  return [];
};

const render = async () => {
  const items = await getPosts();
  
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

export const GET: RequestHandler = async () =>
  new Response(JSON.stringify(await render(), null, 2), {
    headers: {
      'Content-Type': 'application/feed+json; charset=utf-8',
    },
  });
