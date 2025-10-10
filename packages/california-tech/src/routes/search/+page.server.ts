import { postsAll } from '$stores/posts';
import type { Post } from '$lib/types/post';

// This load function runs on the server when a user visits /search
// or submits the form without JavaScript.
export async function load({ url }) {
  const query = url.searchParams.get('q')?.toLowerCase() || '';
  let allPosts: Post.Post[] = [];

  // We get the posts from the store. In a real app, this might be a database call.
  const unsubscribe = postsAll.subscribe(posts => {
    allPosts = Array.from(posts.values());
  });
  unsubscribe();

  const results = query
    ? allPosts.filter(post => {
        return (
          post.title.toLowerCase().includes(query) ||
          (post.content ?? '').toLowerCase().includes(query)
        );
      })
    : allPosts;

  return {
    query,
    results
  };
}

