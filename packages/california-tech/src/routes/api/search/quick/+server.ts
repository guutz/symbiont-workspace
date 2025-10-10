import { postsAll } from '$stores/posts';
import type { Post } from '$lib/types/post';
import { json } from '@sveltejs/kit';

export async function GET({ url }) {
  const query = url.searchParams.get('q')?.toLowerCase() || '';
  if (!query) {
    return json([]); // Return empty array if no query
  }

  let allPosts: Post.Post[] = [];

  const unsubscribe = postsAll.subscribe(posts => {
    allPosts = Array.from(posts.values());
  });
  unsubscribe();

  const results = allPosts.filter(post => {
    return (
      post.title.toLowerCase().includes(query) ||
      (post.content ?? '').toLowerCase().includes(query)
    );
  });

  // Return only the top 5 results for the quick search
  return json(results.slice(0, 5));
}

