/**
 * Shared Notion RichText utilities.
 *
 * Used by both conversion directions:
 * - blocks-to-markdown: richTextToMarkdown() serializes Notion RT → markdown inline
 * - markdown-to-blocks: richText() creates Notion RT objects from parsed AST
 */

import type { NotionRichText, RichTextAnnotations, RichTextOptions } from './types.js';
import { LIMITS } from './types.js';

// ── Notion → Markdown ────────────────────────────────────────────────────────

/**
 * Convert a Notion rich_text array to a markdown inline string.
 *
 * Equation delimiters: both block and inline equations are emitted as `$$expr$$`.
 * Distinction between block and inline is structural (a paragraph that contains
 * only a single equation becomes a block equation; otherwise inline).
 */
export function richTextToMarkdown(richTexts: NotionRichText[]): string {
	return richTexts.map(rt => serializeRichText(rt)).join('');
}

function serializeRichText(rt: NotionRichText): string {
	if (rt.type === 'equation') {
		return `$$${rt.equation?.expression ?? ''}$$`;
	}

	if (rt.type === 'mention') {
		const mention = rt.mention;
		if (!mention) return rt.plain_text ?? '';

		// Page and database mentions: emit a sentinel URL so a content:postprocess
		// hook can resolve them to public slugs (see resolveNotionPageLinks).
		if (mention.type === 'page' && mention.page?.id) {
			const cleanId = mention.page.id.replace(/-/g, '');
			const label = rt.plain_text ?? 'Page link';
			return `[${label}](notion://page/${cleanId})`;
		}
		if (mention.type === 'database' && mention.database?.id) {
			const cleanId = mention.database.id.replace(/-/g, '');
			const label = rt.plain_text ?? 'Database link';
			return `[${label}](notion://page/${cleanId})`;
		}
		if (mention.type === 'link_preview' && mention.link_preview?.url) {
			const url = mention.link_preview.url;
			return `[${rt.plain_text ?? url}](${url})`;
		}

		// All other mention types (user, date, link_preview, template_mention):
		// fall back to the plain_text the API always provides.
		return rt.plain_text ?? '';
	}

	if (rt.type !== 'text') {
		return rt.plain_text ?? '';
	}

	let text = rt.text?.content ?? '';
	if (!text) return '';

	const a = rt.annotations ?? {};

	// Apply annotations (order: code > strikethrough > bold > italic)
	// Code first because backticks suppress other formatting inside them
	if (a.code) return `\`${text}\``;

	if (a.strikethrough) text = `~~${text}~~`;
	if (a.bold) text = `**${text}**`;
	if (a.italic) text = `_${text}_`;
	// underline has no standard markdown equivalent — emit as plain

	// Apply link (outermost wrapper)
	if (rt.text?.link?.url) {
		text = `[${text}](${rt.text.link.url})`;
	}

	return text;
}

// ── Markdown → Notion ────────────────────────────────────────────────────────

function isValidURL(url: string | undefined): boolean {
	if (!url) return false;
	return /^https?:\/\/.+/i.test(url);
}

/**
 * Create a Notion rich_text text or equation object.
 */
export function richText(content: string, options: RichTextOptions = {}): any {
	const annotations = buildAnnotations(options.annotations);

	if (options.type === 'equation') {
		return {
			type: 'equation',
			annotations,
			equation: { expression: content },
		};
	}

	return {
		type: 'text',
		annotations,
		text: {
			content,
			link: isValidURL(options.url)
				? { type: 'url', url: options.url }
				: undefined,
		},
	};
}

function buildAnnotations(a?: RichTextAnnotations): any {
	return {
		bold: a?.bold ?? false,
		strikethrough: a?.strikethrough ?? false,
		underline: a?.underline ?? false,
		italic: a?.italic ?? false,
		code: a?.code ?? false,
		color: (a?.color ?? 'default') as any,
	};
}

/**
 * Split a text string into multiple richText objects if needed
 * (Notion limits each rich_text content to 2000 chars).
 */
export function ensureLength(text: string, options: RichTextOptions = {}): any[] {
	const chunks = text.match(new RegExp(`[^]{1,${LIMITS.RICH_TEXT.TEXT_CONTENT}}`, 'g')) ?? [];
	return chunks.map(chunk => richText(chunk, options));
}
