// packages/california-tech/src/routes/+page.server.ts
import { getAllPosts } from 'symbiont-cms/server';
import { symbiontToQwerPost } from '$lib/utils/post-converter';
import type { Post } from '$lib/types/post';
import type { Tags } from '$lib/types/tags';

export const prerender = false;

export async function load({ fetch, url, cookies }) {
  try {
    const postsFromDb = await getAllPosts({ fetch, limit: 1000 });
    const allPosts = postsFromDb.map((post) => symbiontToQwerPost(post));

    const tagMap = new Map<string, Set<string>>();
    for (const post of allPosts) {
      if (post.tags && Array.isArray(post.tags)) {
        for (const tag of post.tags) {
          if (typeof tag === 'string') {
            if (!tagMap.has('tags')) tagMap.set('tags', new Set());
            tagMap.get('tags')!.add(tag);
          } else if (typeof tag === 'object' && tag !== null) {
            Object.entries(tag).forEach(([category, value]) => {
              if (!tagMap.has(category)) tagMap.set(category, new Set());
              if (Array.isArray(value)) {
                value.forEach(v => tagMap.get(category)!.add(String(v)));
              } else {
                tagMap.get(category)!.add(String(value));
              }
            });
          }
        }
      }
    }
    const allTags: Tags.Category[] = Array.from(tagMap.entries()).map(([categoryName, tagSet]) => ({
      name: categoryName,
      tags: Array.from(tagSet).map(tagName => ({ name: tagName, category: categoryName })),
    })).sort((a, b) => {
      if (a.name === 'tags') return -1;
      if (b.name === 'tags') return 1;
      return a.name.localeCompare(b.name);
    });

    const query = url.searchParams.get('q')?.toLowerCase() || '';
    const tag = url.searchParams.get('tag') || ''; // Preserve case!

    let posts: Post.Post[] = allPosts;

    if (tag) {
      posts = posts.filter(post => (post.tags ?? []).some(postTag => {
        if (typeof postTag === 'string') return postTag === tag; // Case-sensitive
        if (typeof postTag === 'object' && postTag !== null) return Object.values(postTag).flat().some(t => String(t) === tag);
        return false;
      }));
    }

    if (query) {
      posts = posts.filter(post =>
        post.title.toLowerCase().includes(query) ||
        (post.content ?? '').toLowerCase().includes(query)
      );
    }

    return {
      allPosts, // <-- The full, unfiltered list for client-side enhancement
      posts,    // <-- The initially filtered list for SSR
      allTags,
      query,
      tag,
      theme: cookies.get('theme') || 'light',
    };
  } catch (error) {
    console.error('[+page.server] Error loading page data:', error);
    return { allPosts: [], posts: [], allTags: [], query: '', tag: '', theme: 'light' };
  }
}
