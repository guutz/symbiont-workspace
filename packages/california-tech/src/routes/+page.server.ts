// packages/california-tech/src/routes/+page.server.ts
import { symbiont } from '$lib/symbiont';
import { symbiontToTechArticle } from '$lib/utils/post-converter';
import { sortByPublishDayThenLayoutWeightDesc } from '$lib/utils/post-sorting';
import { getIssueBoundedEndIndex, parsePositiveInt } from '$lib/utils/post-pagination';
import type { Tags } from '$lib/types/tags';

// ISR config - enable SvelteKit's ISR caching
export const config = {
	maxage: 60,
	revalidate: 60
};

export const prerender = false;

const PAGE_BATCH_SIZE = 30;
const MAX_FETCH_LIMIT = 1000;

function postHasTag(post: { tags?: unknown[] }, tag: string): boolean {
	return (post.tags ?? []).some((postTag) => {
		if (typeof postTag === 'string') return postTag === tag;
		if (typeof postTag === 'object' && postTag !== null) {
			return Object.values(postTag).flat().some((tagValue) => String(tagValue) === tag);
		}
		return false;
	});
}

export async function load({ fetch, url, cookies }) {
  try {
    const query = url.searchParams.get('q')?.toLowerCase() || '';
    const tag = url.searchParams.get('tag') || '';
    const requestedCount = parsePositiveInt(url.searchParams.get('count'), PAGE_BATCH_SIZE);

    const postsFromDb = await symbiont.getAllPages({ fetch, limit: MAX_FETCH_LIMIT });
    const allPosts = postsFromDb
      .map((post) => symbiontToTechArticle(post))
      .sort(sortByPublishDayThenLayoutWeightDesc);

    // Build tags from all posts for consistent tag cloud
    const tagMap = new Map<string, Set<string>>();
    for (const post of allPosts) {
      if (post.tags && Array.isArray(post.tags)) {
        for (const postTag of post.tags) {
          if (typeof postTag === 'string') {
            if (!tagMap.has('tags')) tagMap.set('tags', new Set());
            tagMap.get('tags')!.add(postTag);
          } else if (typeof postTag === 'object' && postTag !== null) {
            Object.entries(postTag).forEach(([category, value]) => {
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

    // Server-side filtering
    let filteredPosts = allPosts;

    if (tag) {
      filteredPosts = filteredPosts.filter((post) => postHasTag(post, tag));
    }

    if (query) {
      filteredPosts = filteredPosts.filter(post =>
        post.title.toLowerCase().includes(query) ||
        (post.summary ?? '').toLowerCase().includes(query)
      );
    }

    const boundedCount = getIssueBoundedEndIndex(filteredPosts, requestedCount);
    const nextCount = getIssueBoundedEndIndex(filteredPosts, boundedCount + PAGE_BATCH_SIZE);

    // Strip content/html from filtered results (keep summary for display)
    const posts = filteredPosts.slice(0, boundedCount).map(({ content, html, ...post }) => post);

    return {
      posts,         // Initial posts for fast FCP/LCP
      allTags,       // Tag cloud data
      query,
      tag,
      hasMore: boundedCount < filteredPosts.length,
      shownCount: boundedCount,
      nextCount,
      batchSize: PAGE_BATCH_SIZE,
      totalCount: filteredPosts.length,   // Total matching posts
      theme: cookies.get('theme') || 'light',
    };
  } catch (error) {
    console.error('[+page.server.ts] Error loading page data:', error);
    return {
		posts: [],
		allTags: [],
		query: '',
		tag: '',
		hasMore: false,
		shownCount: 0,
		nextCount: PAGE_BATCH_SIZE,
		batchSize: PAGE_BATCH_SIZE,
		totalCount: 0,
		theme: 'light'
	};
  }
}
