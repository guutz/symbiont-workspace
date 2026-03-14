/**
 * markdown-to-blocks.ts
 *
 * Converts a markdown string to Notion block objects.
 * Replaces the @tryfabric/martian fork in the DB → Notion sync direction.
 *
 * Key difference from martian: uses a custom `$$...$$` tokenizer instead of
 * remark-math, so single `$` is never treated as math. Block vs inline
 * equation is determined structurally:
 *   - A paragraph whose only content is `$$...$$` → Notion equation block
 *   - `$$...$$` inline with other text → Notion rich_text equation item
 */

import unified from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import {
	richText,
	ensureLength,
} from './rich-text.js';
import { parseCodeLanguage, isSupportedCodeLang } from './languages.js';
import { LIMITS } from './types.js';
import type { BlocksOptions } from './types.js';

// ── Math sentinel ────────────────────────────────────────────────────────────
// We pre-process `$$...$$` spans out of the markdown before handing it to
// remark, replacing them with unique sentinels so remark never sees the `$$`.
// The sentinels are later expanded back into equation objects during AST traversal.
// 
// We use a format unlikely to appear in normal prose: SYMBIONT_MATH_0_END
// Specifically chosen to be alphanumeric (remark won't mangle it) and unique.

const MATH_SENTINEL_PREFIX = 'SYMBIONT_MATH_';
const MATH_SENTINEL_SUFFIX = 'ENDMATH';
const MATH_SENTINEL_RE = /SYMBIONT_MATH_(\d+)ENDMATH/g;

interface MathExtraction {
	processed: string;
	expressions: string[];
}

function extractDoubleDollarMath(markdown: string): MathExtraction {
	const expressions: string[] = [];
	const processed = markdown.replace(/\$\$([\s\S]*?)\$\$/g, (_, expr: string) => {
		const idx = expressions.length;
		expressions.push(expr.trim());
		return `${MATH_SENTINEL_PREFIX}${idx}${MATH_SENTINEL_SUFFIX}`;
	});
	return { processed, expressions };
}

function isSoleMathSentinel(text: string): boolean {
	return /^SYMBIONT_MATH_\d+ENDMATH$/.test(text);
}

function getSentinelIndex(text: string): number | null {
	const m = text.match(/^SYMBIONT_MATH_(\d+)ENDMATH$/);
	return m ? parseInt(m[1], 10) : null;
}

/**
 * Split a text value into an array of { type: 'text' | 'math', value } parts.
 */
function splitBySentinel(
	text: string,
	expressions: string[],
): Array<{ type: 'text' | 'math'; value: string }> {
	const parts: Array<{ type: 'text' | 'math'; value: string }> = [];
	let lastIndex = 0;
	let match: RegExpExecArray | null;
	MATH_SENTINEL_RE.lastIndex = 0;

	while ((match = MATH_SENTINEL_RE.exec(text)) !== null) {
		const before = text.slice(lastIndex, match.index);
		if (before) parts.push({ type: 'text', value: before });
		const idx = parseInt(match[1], 10);
		parts.push({ type: 'math', value: expressions[idx] ?? '' });
		lastIndex = match.index + match[0].length;
	}

	const after = text.slice(lastIndex);
	if (after) parts.push({ type: 'text', value: after });

	return parts;
}

// ── Notion page sentinel helpers ─────────────────────────────────────────────
// `notion://page/{cleanId}` sentinels are written by blocks-to-markdown (link_to_page
// blocks) and rich-text.ts (inline page/database mention items). On write-back they must
// be converted back to the appropriate native Notion type — not left as broken URLs.
//
// A standalone `[label](notion://page/{id})` paragraph → link_to_page block.
// An inline `[label](notion://page/{id})` surrounded by other text → mention rich_text.

const NOTION_SENTINEL_RE = /^notion:\/\/page\/([0-9a-f]{32})$/i;

/**
 * Extracts and formats the page UUID from a `notion://page/{cleanId}` sentinel URL.
 * Returns the ID in standard UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx),
 * or null if the URL is not a sentinel.
 */
function extractNotionPageId(url: string): string | null {
	const m = url.match(NOTION_SENTINEL_RE);
	if (!m) return null;
	const c = m[1].toLowerCase();
	return `${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`;
}

function linkToPageBlock(pageId: string): any {
	return {
		object: 'block',
		type: 'link_to_page',
		link_to_page: { type: 'page_id', page_id: pageId },
	};
}

function mentionPageRichText(pageId: string): any {
	return {
		type: 'mention',
		mention: { type: 'page', page: { id: pageId } },
	};
}

function mentionLinkPreviewRichText(url: string): any {
	return {
		type: 'mention',
		mention: { type: 'link_preview', link_preview: { url } },
	};
}

// ── Block / RichText helpers ─────────────────────────────────────────────────

function divider(): any {
	return { object: 'block', type: 'divider', divider: {} };
}

function paragraph(text: any[]): any {
	return { object: 'block', type: 'paragraph', paragraph: { rich_text: text } };
}

function code(text: any[], lang: string = 'plain text'): any {
	return { object: 'block', type: 'code', code: { rich_text: text, language: lang } };
}

function blockquote(text: any[] = [], children: any[] = []): any {
	return {
		object: 'block',
		type: 'quote',
		quote: {
			rich_text: text.length ? text : [richText('')],
			children,
		},
	};
}

function imageBlock(url: string, caption?: any[]): any {
	return {
		object: 'block',
		type: 'image',
		image: {
			type: 'external',
			external: { url },
			...(caption && caption.length > 0 ? { caption } : {}),
		},
	};
}

function headingOne(text: any[]): any {
	return { object: 'block', type: 'heading_1', heading_1: { rich_text: text } };
}

function headingTwo(text: any[]): any {
	return { object: 'block', type: 'heading_2', heading_2: { rich_text: text } };
}

function headingThree(text: any[]): any {
	return { object: 'block', type: 'heading_3', heading_3: { rich_text: text } };
}

function bulletedListItem(text: any[], children: any[] = []): any {
	return {
		object: 'block',
		type: 'bulleted_list_item',
		bulleted_list_item: {
			rich_text: text,
			children: children.length ? children : undefined,
		},
	};
}

function numberedListItem(text: any[], children: any[] = []): any {
	return {
		object: 'block',
		type: 'numbered_list_item',
		numbered_list_item: {
			rich_text: text,
			children: children.length ? children : undefined,
		},
	};
}

function toDo(checked: boolean, text: any[], children: any[] = []): any {
	return {
		object: 'block',
		type: 'to_do',
		to_do: {
			rich_text: text,
			checked,
			children: children.length ? children : undefined,
		},
	};
}

function tableBlock(rows: any[], tableWidth: number): any {
	return {
		object: 'block',
		type: 'table',
		table: {
			table_width: tableWidth,
			has_column_header: true,
			children: rows,
		},
	};
}

function tableRow(cells: any[][]): any {
	return { object: 'block', type: 'table_row', table_row: { cells } };
}

function equationBlock(expression: string): any {
	return { type: 'equation', equation: { expression } };
}

function callout(
	text: any[],
	emoji: string = '👍',
	color: string = 'default',
	children: any[] = [],
): any {
	return {
		object: 'block',
		type: 'callout',
		callout: {
			rich_text: text.length ? text : [richText('')],
			icon: { type: 'emoji', emoji },
			children,
			color,
		},
	};
}

// ── GFM alert config ─────────────────────────────────────────────────────────

const GFM_ALERT_MAP: Record<string, { emoji: string; color: string }> = {
	NOTE:      { emoji: '📘', color: 'blue_background' },
	TIP:       { emoji: '💡', color: 'green_background' },
	IMPORTANT: { emoji: '☝️', color: 'purple_background' },
	WARNING:   { emoji: '⚠️', color: 'yellow_background' },
	CAUTION:   { emoji: '❗', color: 'red_background' },
};

const SUPPORTED_GFM_ALERT_TYPES = Object.keys(GFM_ALERT_MAP);

// ── Inline parser ────────────────────────────────────────────────────────────

interface InlineOptions {
	annotations?: {
		bold?: boolean;
		italic?: boolean;
		strikethrough?: boolean;
		code?: boolean;
		underline?: boolean;
	};
	url?: string;
}

function getInlinePlainText(node: any): string {
	switch (node?.type) {
		case 'text':
		case 'inlineCode':
		case 'html':
			return String(node.value ?? '');
		case 'delete':
		case 'emphasis':
		case 'strong':
		case 'link':
			return (node.children as any[] ?? []).map(getInlinePlainText).join('');
		default:
			return '';
	}
}

function parseInlineText(text: string, options: InlineOptions, expressions: string[]): any[] {
	const parts = splitBySentinel(text, expressions);
	return parts.flatMap(part => {
		if (part.type === 'math') {
			return [richText(part.value, { type: 'equation', annotations: options.annotations as any })];
		}
		if (!part.value) return [];
		return ensureLength(part.value, { annotations: options.annotations as any, url: options.url });
	});
}

function parseInline(node: any, options: InlineOptions, expressions: string[]): any[] {
	const copy: InlineOptions = {
		annotations: { ...(options.annotations ?? {}) },
		url: options.url,
	};

	switch (node.type) {
		case 'text':
			return parseInlineText(node.value as string, copy, expressions);

		case 'delete':
			return (node.children as any[]).flatMap(child =>
				parseInline(child, { ...copy, annotations: { ...copy.annotations, strikethrough: true } }, expressions),
			);

		case 'emphasis':
			return (node.children as any[]).flatMap(child =>
				parseInline(child, { ...copy, annotations: { ...copy.annotations, italic: true } }, expressions),
			);

		case 'strong':
			return (node.children as any[]).flatMap(child =>
				parseInline(child, { ...copy, annotations: { ...copy.annotations, bold: true } }, expressions),
			);

		case 'link': {
			const notionPageId = extractNotionPageId(node.url as string ?? '');
			if (notionPageId) {
				return [mentionPageRichText(notionPageId)];
			}
			const url = node.url as string ?? '';
			const label = getInlinePlainText(node);
			if (isValidHttpUrl(url) && label === url) {
				return [mentionLinkPreviewRichText(url)];
			}
			return (node.children as any[]).flatMap(child =>
				parseInline(child, { ...copy, url: node.url as string }, expressions),
			);
		}

		case 'inlineCode':
			return [richText(node.value as string, { ...copy, annotations: { ...copy.annotations, code: true } })];

		case 'html':
			// Inline HTML — pass through as plain text
			return ensureLength(node.value as string, copy);

		default:
			return [];
	}
}

function isValidHttpUrl(url: string): boolean {
	return /^https?:\/\/.+/i.test(url);
}

// ── Image helper ─────────────────────────────────────────────────────────────

function parseImage(node: any, strictImageUrls: boolean): any {
	const url: string = node.url ?? '';
	if (!url) return paragraph([richText(node.alt ?? '')]);

	const caption = node.alt ? [richText(node.alt)] : undefined;

	if (strictImageUrls) {
		try {
			const parsed = new URL(url);
			const ext = parsed.pathname.split('.').pop()?.toLowerCase() ?? '';
			const allowedExts = ['png', 'jpg', 'jpeg', 'gif', 'tif', 'tiff', 'bmp', 'svg', 'heic', 'webp'];
			if (!allowedExts.includes(ext)) return paragraph([richText(url)]);
		} catch {
			return paragraph([richText(url)]);
		}
	}

	return imageBlock(url, caption);
}

// ── Paragraph parser ─────────────────────────────────────────────────────────

function parseParagraph(node: any, options: BlocksOptions, expressions: string[]): any[] {
	const children: any[] = node.children ?? [];

	// Sole child is a math sentinel → Notion equation block
	if (children.length === 1 && children[0].type === 'text' && isSoleMathSentinel(children[0].value)) {
		const idx = getSentinelIndex(children[0].value);
		if (idx !== null) {
			return [equationBlock(expressions[idx] ?? '')];
		}
	}

	// Sole child is a notion:// page sentinel link → link_to_page block
	if (children.length === 1 && children[0].type === 'link') {
		const pageId = extractNotionPageId(children[0].url as string ?? '');
		if (pageId) return [linkToPageBlock(pageId)];
	}

	// Extract inline images into separate blocks
	const images: any[] = [];
	const paragraphs: any[][] = [];
	let currentParagraph: any[] = [];

	const flushParagraph = () => {
		if (currentParagraph.length > 0) {
			paragraphs.push(currentParagraph);
			currentParagraph = [];
		}
	};

	for (const item of children) {
		if (item.type === 'image') {
			flushParagraph();
			images.push(parseImage(item, options.strictImageUrls ?? false));
			continue;
		}
		if (item.type === 'break') {
			flushParagraph();
			continue;
		}
		currentParagraph.push(...parseInline(item, {}, expressions));
	}

	flushParagraph();

	return [...paragraphs.map(rt => paragraph(rt)), ...images];
}

// ── Blockquote parser ────────────────────────────────────────────────────────

function parseBlockquote(node: any, options: BlocksOptions, expressions: string[]): any {
	const firstChild = node.children?.[0];
	const firstText = firstChild?.type === 'paragraph' ? firstChild.children?.[0] : null;

	if (firstText?.type === 'text') {
		const parseSubsequent = () =>
			node.children.length > 1
				? node.children.slice(1).flatMap((child: any) => parseNode(child, options, expressions))
				: [];

		// GFM alert syntax: > [!NOTE], > [!WARNING], etc.
		const firstLine: string = firstText.value.split('\n')[0];
		const gfmMatch = firstLine.match(/^(?:\\\[|\[)!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]$/);

		if (gfmMatch && SUPPORTED_GFM_ALERT_TYPES.includes(gfmMatch[1])) {
			const alertType = gfmMatch[1];
			const alertConfig = GFM_ALERT_MAP[alertType];
			const displayType = alertType.charAt(0).toUpperCase() + alertType.slice(1).toLowerCase();

			const alertChildren: any[] = [];
			const contentLines = firstText.value.split('\n').slice(1);
			if (contentLines.length > 0) {
				alertChildren.push(paragraph(parseInline({ type: 'text', value: contentLines.join('\n') }, {}, expressions)));
			}
			alertChildren.push(...parseSubsequent());

			return callout(
				[richText(displayType)],
				alertConfig.emoji,
				alertConfig.color,
				alertChildren,
			);
		}
	}

	const blockChildren = node.children.flatMap((child: any) => parseNode(child, options, expressions));
	return blockquote([], blockChildren);
}

// ── Other block parsers ──────────────────────────────────────────────────────

function parseHeading(node: any, expressions: string[]): any {
	const text = (node.children ?? []).flatMap((child: any) => parseInline(child, {}, expressions));
	switch (node.depth) {
		case 1: return headingOne(text);
		case 2: return headingTwo(text);
		default: return headingThree(text);
	}
}

function parseCode(node: any): any {
	const text = ensureLength(node.value ?? '');
	const lang = parseCodeLanguage(node.lang) ?? (isSupportedCodeLang(node.lang) ? node.lang : 'plain text');
	return code(text, lang);
}

function parseList(node: any, options: BlocksOptions, expressions: string[]): any[] {
	return (node.children ?? []).flatMap((item: any) => {
		const children = [...(item.children ?? [])];
		const paragraphNode = children.shift();
		if (!paragraphNode || paragraphNode.type !== 'paragraph') return [];

		const text = (paragraphNode.children ?? []).flatMap((child: any) => parseInline(child, {}, expressions));
		const parsedChildren = children.flatMap((child: any) => parseNode(child, options, expressions));

		if (node.start !== null && node.start !== undefined) {
			return [numberedListItem(text, parsedChildren)];
		} else if (item.checked !== null && item.checked !== undefined) {
			return [toDo(!!item.checked, text, parsedChildren)];
		} else {
			return [bulletedListItem(text, parsedChildren)];
		}
	});
}

function parseTable(node: any, expressions: string[]): any[] {
	const rows: any[] = (node.children ?? []).map((rowNode: any) => {
		const cells = (rowNode.children ?? []).map((cellNode: any) =>
			(cellNode.children ?? []).flatMap((child: any) => parseInline(child, {}, expressions)),
		);
		return tableRow(cells);
	});
	const tableWidth = node.children?.[0]?.children?.length ?? 0;
	return [tableBlock(rows, tableWidth)];
}

function parseNode(node: any, options: BlocksOptions, expressions: string[]): any[] {
	switch (node.type) {
		case 'heading':
			return [parseHeading(node, expressions)];
		case 'paragraph':
			return parseParagraph(node, options, expressions);
		case 'code':
			return [parseCode(node)];
		case 'blockquote':
			return [parseBlockquote(node, options, expressions)];
		case 'list':
			return parseList(node, options, expressions);
		case 'table':
			return parseTable(node, expressions);
		case 'thematicBreak':
			return [divider()];
		case 'html':
			// Block-level HTML — pass through as a code block
			return [code(ensureLength(node.value ?? ''), 'html')];
		default:
			return [];
	}
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Convert a markdown string to Notion block objects.
 *
 * Uses `$$...$$` for both inline and block equations (single `$` is never math).
 * GFM alerts (`> [!NOTE]` etc.) are converted to Notion callout blocks.
 *
 * @param markdown - Markdown string to convert
 * @param options - Conversion options
 */
export function convertMarkdownToNotionBlocks(
	markdown: string,
	options?: BlocksOptions,
): any[] {
	if (!markdown?.trim()) return [];

	// Step 1: Extract $$...$$ spans and replace with sentinels
	const { processed, expressions } = extractDoubleDollarMath(markdown);

	// Step 2: Parse with remark + GFM (no remark-math)
	const root = (unified().use(remarkParse).use(remarkGfm) as any).parse(processed) as any;

	// Step 3: Convert AST to Notion blocks
	const parsed = (root.children ?? []).flatMap((node: any) =>
		parseNode(node, options ?? {}, expressions),
	);

	// Step 4: Enforce Notion limits
	const truncate = options?.truncate ?? true;
	const onLimitExceeded = options?.onLimitExceeded ?? (() => {});

	if (parsed.length > LIMITS.PAYLOAD_BLOCKS) {
		onLimitExceeded(new Error(`Resulting blocks array exceeds Notion limit (${LIMITS.PAYLOAD_BLOCKS})`));
	}

	return truncate ? parsed.slice(0, LIMITS.PAYLOAD_BLOCKS) : parsed;
}
