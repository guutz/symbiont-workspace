/**
 * Shared type definitions and Notion API limits.
 *
 * @see https://developers.notion.com/reference/request-limits#limits-for-property-values
 * @see https://developers.notion.com/reference/rich-text
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

/**
 * Notion rich_text item as returned by the API.
 *
 * The Notion API returns three `type` variants for rich_text items:
 * - `"text"` — plain text with optional link and annotations
 * - `"equation"` — inline LaTeX expression
 * - `"mention"` — reference to a page, database, user, date, link preview, or template mention
 *
 * Mention subtypes (`mention.type`):
 * - `"page"` — inline link to another Notion page (`mention.page.id`)
 * - `"database"` — inline link to a database (`mention.database.id`)
 * - `"user"` — @-mention of a user (`mention.user.id`)
 * - `"date"` — date/datetime range (`mention.date.start`, `.end`)
 * - `"link_preview"` — external URL link preview (`mention.link_preview.url`)
 * - `"template_mention"` — template placeholder (today/now)
 *
 * `plain_text` is always present on API responses and is used as the fallback
 * for mention types that have no meaningful markdown representation.
 */
export interface NotionRichText {
	type: 'text' | 'equation' | 'mention';
	/** Always populated by the Notion API on read; may be absent on constructed objects. */
	plain_text?: string;
	annotations?: {
		bold?: boolean;
		italic?: boolean;
		strikethrough?: boolean;
		underline?: boolean;
		code?: boolean;
		color?: string;
	};
	/** Populated when type === 'text' */
	text?: {
		content: string;
		link?: { url: string } | null;
	};
	/** Populated when type === 'equation' */
	equation?: {
		expression: string;
	};
	/**
	 * Populated when type === 'mention'.
	 * The `mention.type` discriminates the subtype.
	 * Page and database mentions are serialized as `notion://page/{id}` links so
	 * that a `content:postprocess` hook can resolve them to public slugs.
	 */
	mention?: {
		type: 'page' | 'database' | 'user' | 'date' | 'link_preview' | 'template_mention' | string;
		page?: { id: string };
		database?: { id: string };
		user?: { id: string; object?: 'user'; name?: string };
		date?: { start: string; end?: string | null };
		link_preview?: { url: string };
		template_mention?: { type: string; [key: string]: any };
	};
}
