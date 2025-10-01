export namespace Site {
  export type IndexLayout = 'default' | 'posts-only' | 'profile-only' | 'custom';

  export interface Config {
    /** site url  without tailing slash. for example: `https://example.com` */
    url: string;
    /** site title. */
    title: string;
    /** site description. `<meta name="description" content={site.description}>` */
    description: string;
    /** site subtitle. */
    subtitle?: string;
    /** site lang. `<html lang={site.lang}>` */
  lang: string;

    timeZone: string;

    /** site published since year. */
    since?: number;

    /** layout type for the index page. Options: 'default' (profile + posts), 'posts-only', 'profile-only', 'custom' */
    indexLayout?: IndexLayout;

    /** path to a custom layout component file (relative to src/lib/components/) */
    customLayoutComponent?: string;

    author: Author;

    cover: string;
  }

  export interface Head {
    me?: string[];
    custom?: (params: { dev: boolean }) => string[];
  }

  export interface Author {
    name: string;
    status?: string;
    statusTip?: string;
    avatar?: string;
    avatar_128: string[];
    avatar_48_png: string;
    avatar_96_png: string;
    avatar_192_png: string;
    avatar_512_png: string;
    github?: string;
    website?: string;
    email?: string;
    twitter?: string;
    bio?: string;
  }

  export type DateConfig = {
    toPublishedString: { locales: string; options: Intl.DateTimeFormatOptions };
    toUpdatedString: { locales: string; options: Intl.DateTimeFormatOptions };
  };

  declare module '*&imagetools' {
    /**
     * Workaround found here
     * - issue https://github.com/JonasKruckenberg/imagetools/issues/160#issuecomment-1009292026
     * actual types
     * - code https://github.com/JonasKruckenberg/imagetools/blob/main/packages/core/src/output-formats.ts
     * - docs https://github.com/JonasKruckenberg/imagetools/blob/main/docs/guide/getting-started.md#metadata
     */
    const out;
    export default out;
  }
}
