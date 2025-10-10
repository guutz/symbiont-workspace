export const strings = {
  Tags: () => 'Tags',
  FilterTags: () => 'Filter Tags...',
  TableOfContent: () => 'Table of Content',
  LoadingPosts: () => 'Loading Posts...',
  LoadingPost: () => 'Loading Post...',
  NoPostFound: () => 'No Post Found.',
  LoadingGiscus: () => 'Loading Giscus...',
  QWER: () => '🚀 QWER [α] - Built with SvelteKit and ❤',
  FirstPublishedAt: () => 'First published at',
  LastUpdatedAt: () => 'Last updated at',
  Updated: () => 'Updated: ',
  JustNow: () => 'just now',
  MinuteAgo: (value: number | string) => `${value} minute${Number(value) === 1 ? '' : 's'} ago`,
  HourAgo: (value: number | string) => `${value} hour${Number(value) === 1 ? '' : 's'} ago`,
  DayAgo: (value: number | string) => `${value} day${Number(value) === 1 ? '' : 's'} ago`,
  MonthAgo: (value: number | string) => `${value} month${Number(value) === 1 ? '' : 's'} ago`,
  YearAgo: (value: number | string) => `${value} year${Number(value) === 1 ? '' : 's'} ago`,
  Page404NotFound: () => 'Page Not Found',
  Page404BackHome: () => 'Go Back Home !',
  IndexSearchBox: () => 'Search',
  IndexCloseSearchBox: () => 'Close',
};

type Strings = typeof strings;
export type StringKeys = keyof Strings;

export type StringFunctions = {
  [K in keyof Strings]: ReturnType<Strings[K]> extends string
    ? (...args: Parameters<Strings[K]>) => string
    : never;
};
