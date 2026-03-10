/**
 * Shared type definitions and Notion API limits.
 *
 * @see https://developers.notion.com/reference/request-limits#limits-for-property-values
 */

export const LIMITS = {
	PAYLOAD_BLOCKS: 1000,
	RICH_TEXT_ARRAYS: 100,
	RICH_TEXT: {
		TEXT_CONTENT: 2000,
		LINK_URL: 1000,
		EQUATION_EXPRESSION: 1000,
	},
} as const;

export interface RichTextAnnotations {
	bold?: boolean;
	italic?: boolean;
	strikethrough?: boolean;
	underline?: boolean;
	code?: boolean;
	color?: string;
}

export interface RichTextOptions {
	type?: 'text' | 'equation';
	annotations?: RichTextAnnotations;
	url?: string;
}

export interface BlocksOptions {
	/** Whether to render invalid image URLs as plain text (default: false) */
	strictImageUrls?: boolean;
	/** Auto-truncate when exceeding Notion limits (default: true) */
	truncate?: boolean;
	/** Callback when content exceeds Notion limits */
	onLimitExceeded?: (err: Error) => void;
}

/**
 * Custom block transformer function type.
 * Return a markdown string to override default behavior, or false to use default.
 */
export type BlockTransformerFn = (
	block: any,
	fetchChildren: (blockId: string) => Promise<any[]>
) => Promise<string | false> | string | false;

export interface NotionRichText {
	type: string;
	plain_text?: string;
	annotations?: {
		bold?: boolean;
		italic?: boolean;
		strikethrough?: boolean;
		underline?: boolean;
		code?: boolean;
		color?: string;
	};
	text?: {
		content: string;
		link?: { url: string } | null;
	};
	equation?: {
		expression: string;
	};
	mention?: {
		type: string;
		[key: string]: any;
	};
}
