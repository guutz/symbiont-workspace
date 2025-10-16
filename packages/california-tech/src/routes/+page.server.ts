// packages/california-tech/src/routes/+page.server.ts
import { getAllPosts } from 'symbiont-cms/server';
import { symbiontToQwerPost } from '$lib/utils/post-converter';
import type { Post } from '$lib/types/post';
import type { Tags } from '$lib/types/tags';

export const actions = {
  toggleTheme: async ({ cookies }) => {
    const theme = cookies.get('theme') || 'light';
    const newTheme = theme === 'light' ? 'dark' : 'light';

    cookies.set('theme', newTheme, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1 year
    });
  },
};

export async function load({ fetch, url, cookies }) {
  try {
    // 1. Fetch all posts from the database via symbiont
    const postsFromDb = await getAllPosts({ fetch, limit: 1000 });

    // 2. Transform them into the format your components expect
    const allPosts = postsFromDb.map((post) => symbiontToQwerPost(post));

    // 3. Generate the list of all unique tags from the posts, matching the old store logic
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

    const allTags: Tags.Category[] = Array.from(tagMap.entries())
      .map(([categoryName, tagSet]) => ({
        name: categoryName,
        tags: Array.from(tagSet).map(tagName => ({
          name: tagName,
          category: categoryName,
        })),
      }))
      .sort((a, b) => {
        const aIsTags = a.name === 'tags';
        const bIsTags = b.name === 'tags';
        if (aIsTags && !bIsTags) return -1;
        if (!aIsTags && bIsTags) return 1;
        return a.name.localeCompare(b.name);
      });


    // 4. Filter posts based on URL search parameters
    const query = url.searchParams.get('q')?.toLowerCase() || '';
    const tag = url.searchParams.get('tag')?.toLowerCase() || '';

    let filteredPosts: Post.Post[] = allPosts;

    if (tag) {
      // This filter logic needs to handle the complex tag structure now
      filteredPosts = filteredPosts.filter(post => {
        return post.tags?.some((postTag: string | Record<string, string | string[]>) => {
          if (typeof postTag === 'string') {
            return postTag.toLowerCase() === tag;
          }
          if (typeof postTag === 'object' && postTag !== null) {
            return Object.values(postTag).flat().some(t => String(t).toLowerCase() === tag);
          }
          return false;
        }) ?? false;
      });
    }

    if (query) {
      filteredPosts = filteredPosts.filter(post => {
        const titleMatch = post.title.toLowerCase().includes(query);
        const contentMatch = (post.content ?? '').toLowerCase().includes(query);
        return titleMatch || contentMatch;
      });
    }

    return {
      posts: filteredPosts,
      allTags,
      query,
      tag,
      theme: cookies.get('theme') || 'light',
    };

  } catch (error) {
    console.error('[+page.server] Error loading page data:', error);
    // Return a safe, empty state if the fetch fails
    return {
      posts: [],
      allTags: [],
      query: '',
      tag: '',
      theme: 'light',
    };
  }
}

