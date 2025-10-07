import { readable, writable } from 'svelte/store';
import type { Tags } from '$lib/types/tags';
import { UserConfig } from '$config/QWER.config';
import type { Post } from '$lib/types/post';

// Try to load static tags if available (backward compatibility)
let initialTags: Tags.Category[] = [];
try {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  const tagsjson = await import('$generated/tags.json');
  initialTags = Object.entries(tagsjson.default)
    .map((e: [string, unknown]) => {
      return {
        name: e[0],
        tags: Object.entries(e[1] as object).map((c) => {
          return { name: c[0], category: e[0] };
        }),
      };
    })
    .sort((a, b) => {
      const aIsTags = a.name === 'tags';
      const bIsTags = b.name === 'tags';
      if (aIsTags && bIsTags) return 0;
      if (aIsTags) return -1;
      if (bIsTags) return 1;
      return String(a.name).localeCompare(String(b.name));
    });
} catch (e) {
  // No generated tags.json - will be initialized from server
  console.log('[tags store] No static tags.json found, waiting for server data');
}

export const tagsShowMobile = writable(false);
export const tagsShowDesktop = writable(UserConfig.DefaultDesktopShowTagFilter);

export const tagsAll = writable<Tags.Category[]>(initialTags);

// Initialize tags from posts (for dynamic CMS mode)
export function initializeTagsFromPosts(posts: Post.Post[]) {
  const tagMap = new Map<string, Set<string>>();
  
  // Extract all unique tags from posts
  posts.forEach(post => {
    if (post.tags && Array.isArray(post.tags)) {
      post.tags.forEach(tag => {
        if (typeof tag === 'string') {
          // Simple string tag - goes into 'tags' category
          if (!tagMap.has('tags')) tagMap.set('tags', new Set());
          tagMap.get('tags')!.add(tag);
        } else if (typeof tag === 'object') {
          // Categorized tags - process each category
          Object.entries(tag).forEach(([category, value]) => {
            if (!tagMap.has(category)) tagMap.set(category, new Set());
            if (Array.isArray(value)) {
              value.forEach(v => tagMap.get(category)!.add(String(v)));
            } else {
              tagMap.get(category)!.add(String(value));
            }
          });
        }
      });
    }
  });

  // Convert to Tags.Category[] format
  const tags: Tags.Category[] = Array.from(tagMap.entries())
    .map(([categoryName, tagSet]) => ({
      name: categoryName,
      tags: Array.from(tagSet).map(tagName => ({
        name: tagName,
        category: categoryName
      }))
    }))
    .sort((a, b) => {
      const aIsTags = a.name === 'tags';
      const bIsTags = b.name === 'tags';
      if (aIsTags && bIsTags) return 0;
      if (aIsTags) return -1;
      if (bIsTags) return 1;
      return String(a.name).localeCompare(String(b.name));
    });

  tagsAll.set(tags);
}

export const tagsCur = (() => {
  let _data = new Map<string, Set<string>>();
  const { subscribe, set } = writable<Map<string, Set<string>>>(_data);

  const _addByTag = (t: Tags.Tag) => {
    if (!_data.has(t.category)) _data.set(t.category, new Set<string>());
    _data.get(t.category)?.add(t.name);
    set(_data);
  };

  const _delByTag = (t: Tags.Tag) => {
    if (_data.has(t.category)) {
      _data.get(t.category)?.delete(t.name);
      if (_data.get(t.category)?.size === 0) {
        _data.delete(t.category);
      }
      set(_data);
    }
  };

  return {
    subscribe,
    init: () => {
      _data = new Map<string, Set<string>>();
      set(_data);
    },
    add: (category: string, name: string) => {
      if (!_data.has(category)) _data.set(category, new Set<string>());
      _data.get(category)?.add(name);
      set(_data);
    },
    addByTag: _addByTag,
    delByTag: _delByTag,
    has: (t: Tags.Tag) => {
      return _data.get(t.category)?.has(t.name);
    },
    toggle: (t: Tags.Tag) => {
      if (_data.has(t.category) && _data.get(t.category)?.has(t.name)) {
        _delByTag(t);
      } else {
        _addByTag(t);
      }
    },
    toString: () => {
      const _output: string[] = [];
      _data.forEach((v, k) => {
        _output.push(`${k === 'tags' ? k : `tags-${k}`}=${Array.from(v).toString()}`);
      });

      return _output.join('&');
    },
  };
})();
