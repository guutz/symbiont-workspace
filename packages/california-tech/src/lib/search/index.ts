import type { Post } from '$lib/types/post';
import LZString from 'lz-string';

type SearchRecord = {
  slug: string;
  haystack: string;
};

const normalise = (value: string | undefined | null) => value?.toLowerCase().trim() ?? '';

const buildHaystack = (post: Post.Post) => {
  const title = normalise(post.title);
  const summary = normalise(post.summary);
  const content = normalise(LZString.decompressFromBase64(post.content ?? '') ?? '');
  const tags = (post.tags ?? [])
    .flatMap((tag: any): string[] => {
      if (typeof tag === 'string') return [tag];
      if (Array.isArray(tag)) return tag.map((value) => String(value));
      if (tag && typeof tag === 'object') {
        return Object.values(tag).flatMap((value) => {
          if (Array.isArray(value)) return value.map((entry) => String(entry));
          if (value === undefined || value === null) return [];
          return [String(value)];
        });
      }
      return [];
    })
  .map((tag: string) => normalise(tag));

  return [title, summary, content, ...tags].filter(Boolean).join(' ');
};

export const search = (() => {
  let records: SearchRecord[] = [];
  let _inited = false;

  const _init = (posts: Post.Post[]) => {
    if (_inited) return;

    records = posts.map((post) => ({
      slug: post.slug,
      haystack: buildHaystack(post),
    }));

    _inited = true;
  };

  const _search = (query: string): string[] => {
    if (!_inited) return [];

    const trimmed = normalise(query);
    if (!trimmed) return [];

    const tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];

    return records
      .filter(({ haystack }) => tokens.every((token) => haystack.includes(token)))
      .map(({ slug }) => slug);
  };

  const _reset = () => {
    records = [];
    _inited = false;
  };

  return {
    get inited() {
      return _inited;
    },
    init: _init,
    search: _search,
    reset: _reset,
  };
})();
