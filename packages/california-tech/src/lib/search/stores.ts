import { writable, get } from 'svelte/store';
import type { Post } from '$lib/types/post';
import { postsShow, postsAll } from '$stores/posts';
import { search } from '$lib/search';

export const inited = writable(false);
export const searching = writable(false);
export const result = writable<string[] | undefined>(undefined);

export const query = (() => {
  const { subscribe, set } = writable<string>('');

  const _init = () => {
    if (get(inited)) return;
    const posts = Array.from(get(postsAll).values()).filter((post: Post.Post) => {
      return !(post.options && post.options.includes('unlisted'));
    });
    search.init(posts);
    inited.set(true);
  };
  const _set = (q: string) => {
    set(q);
    if (q && q.trim().length > 0) {
      const slugs = search.search(q);
      result.set(slugs);
      postsShow.filter();
    } else {
      _reset();
    }
  };

  const _reset = () => {
    set('');
    result.set(undefined);
    postsShow.filter();
  };

  return {
    subscribe,
    init: _init,
    set: _set,
    reset: _reset,
  };
})();
