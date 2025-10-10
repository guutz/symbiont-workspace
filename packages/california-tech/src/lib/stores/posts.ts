import { writable, get } from 'svelte/store';
import type { Post } from '$lib/types/post';
import { tagsCur } from '$stores/tags';
import { result } from '$lib/search/stores';

// Store for all posts - will be initialized from server data
export const postsAll = writable<Map<string, Post.Post>>(new Map());

// Initialize posts from server-loaded data
export function initializePostsFromServer(posts: Post.Post[]) {
  const postMap = new Map(posts.map((post) => [post.slug, post]));
  postsAll.set(postMap);
}

export const postsShow = (() => {
  const { subscribe, set } = writable<Post.Post[]>([]);

  const _getDefaultPosts = () => {
    const allPostsMap = get(postsAll);
    return Array.from(allPostsMap.values())
      .filter((post) => {
        return !(post.options && post.options.includes('unlisted'));
      });
  };

  const _init = () => {
    set(_getDefaultPosts());
  };

  const _filterBySlugs = (data: Post.Post[]) => {
    let _data = data;
    const slugs: Array<string> | undefined = get(result);
    if (slugs) {
      _data = _data.filter((e) => {
        return (slugs as Array<string>).includes(e.slug);
      });
    }
    return _data;
  };

  const _filterByTags = (data: Post.Post[]) => {
    let _data = data;
    get(tagsCur).forEach((v, category) => {
      if (category === 'tags') {
        v.forEach((searchTag) => {
          _data = _data.filter((e) => {
            if (!e.tags) return false;
            return e.tags.find(
              (tagItem: string | string[] | { [key: string]: string } | { [key: string]: string[] }) => {
                if (typeof tagItem === 'string') {
                  return tagItem === searchTag;
                }
                if (Array.isArray(tagItem)) {
                  return tagItem.includes(searchTag);
                }
                return false;
              },
            );
          });
        });
      } else {
        v.forEach((searchTag) => {
          _data = _data.filter((e) => {
            if (!e.tags) return false;
            return e.tags.find((tagItem: { [key: string]: string } | { [key: string]: string[] }) => {
              if (typeof tagItem === 'object' && tagItem[category] !== undefined) {
                if (Array.isArray(tagItem[category])) {
                  return tagItem[category].includes(searchTag);
                }
                return tagItem[category] === searchTag;
              }
            });
          });
        });
      }
    });
    return _data;
  };

  const _filter = () => {
    let _data = _getDefaultPosts();
    _data = _filterByTags(_data);
    _data = _filterBySlugs(_data);
    set(_data);
  };

  return {
    subscribe,
    init: _init,
    filter: _filter,
  };
})();
