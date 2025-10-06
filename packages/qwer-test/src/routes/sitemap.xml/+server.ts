export const prerender = true;
import type { RequestHandler } from '@sveltejs/kit';
import { siteConfig } from '$config/site';
import type { Post } from '$lib/types/post';
import { getPostsFromPrimarySource, type Post as SymbiontPost } from 'symbiont-cms';

const getPosts = async (): Promise<SymbiontPost[]> => {
  const graphqlEndpoint = process.env.PUBLIC_NHOST_GRAPHQL_URL;
  
  if (graphqlEndpoint) {
    try {
      return await getPostsFromPrimarySource(graphqlEndpoint, { 
        limit: 100
      });
    } catch (error) {
      console.error('[sitemap.xml] Error fetching posts:', error);
    }
  }
  
  return [];
};

const render = async (): Promise<string> => {
  const posts = await getPosts();
  
  return `<?xml version='1.0' encoding='utf-8'?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
      <loc>${siteConfig.url}</loc>
      <changefreq>weekly</changefreq>
      <priority>0.7</priority>
    </url>
    ${posts
      .map((post) => {
        return `
        <url>
        <loc>${new URL(post.slug, siteConfig.url).href}</loc>
        <lastmod>${new Date(post.updated_at ?? post.publish_at ?? new Date()).toISOString()}</lastmod>
        <changefreq>weekly</changefreq>
        <priority>0.5</priority>
        </url>
      `;
      })
      .join('')}
</urlset>`;
};

export const GET: RequestHandler = async () => {
  return new Response(await render(), {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
};
