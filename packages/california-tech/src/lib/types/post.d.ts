import type { TOC } from '$lib/types/toc';
import type { Tags } from '$lib/types/tags';
export namespace Post {
  export type Post = {
    slug: string;
    title: string;
    description: string;
    authors?: Array<string>;
    summary?: string;
    /** Pre-rendered HTML from summary markdown */
    summary_html?: string;
    content?: string;
    html?: string;
    published: string;
    updated: string;
    created: string;
    cover?: string;
    coverInPost?: boolean;
    coverCaption?: string;
    coverStyle: CoverStyle;
    previewLayout?: PreviewLayoutFormat;
    showPreviewSummary?: boolean;
    layoutWeight?: number;
    options?: Array<string>;
    series_tag?: string;
    series_title?: string;
    prev?: string;
    next?: string;
    toc?: TOC.Heading[];
    tags?: Array<Tags.Tag | string>;
  };

  export enum CoverStyle {
    TOP = 'TOP',
    RIGHT = 'RIGHT',
    BOT = 'BOT',
    LEFT = 'LEFT',
    IN = 'IN',
    NONE = 'NONE',
  }

  export type PreviewLayoutFormat = 'compact' | 'standard' | 'feature';
}
