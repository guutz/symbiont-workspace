/**
 * blocks-to-markdown.ts
 *
 * Converts Notion block objects to a markdown string.
 * Replaces notion-to-md in the Notion → DB sync direction.
 *
 * Equation convention: both inline and block equations use `$$expr$$`.
 * Inline vs block is structural: a paragraph whose entire content is a single
 * equation becomes a standalone `$$\nexpr\n$$` block; otherwise the equation
 * is rendered inline as `$$expr$$` within the paragraph text.
 */

import { richTextToMarkdown } from './rich-text.js';
import type { BlockTransformerFn } from './types.js';

// ── Custom transformer registry ──────────────────────────────────────────────

const customTransformers = new Map<string, BlockTransformerFn>();

/**
 * Register a custom transformer for a Notion block type.
 * The transformer receives the raw block object and a `fetchChildren` callback.
 * Return a markdown string to override default behavior, or `false` to use default.
 *
 * @example
 * setBlockTransformer('image', async (block) => {
 *   const url = block.image?.external?.url ?? block.image?.file?.url ?? '';
 *   const caption = block.image?.caption?.map((c: any) => c.plain_text).join('').trim();
 *   return `![${caption ?? ''}](${url})`;
 * });
 */
export function setBlockTransformer(type: string, fn: BlockTransformerFn): void {
	customTransformers.set(type, fn);
}

export function clearBlockTransformers(): void {
	customTransformers.clear();
}

// ── Core converter ───────────────────────────────────────────────────────────

/**
 * Callback that fetches the direct children of a Notion block by its ID.
 *
 * `blocksToMarkdown` calls this whenever it encounters a block that may have
 * children (lists, quotes, callouts, toggles, tables, column layouts, synced
 * blocks). The caller is responsible for pagination — the callback must return
 * **all** children for the given blockId in a single call.
 *
 * `NotionClient.getBlocks(blockId)` already handles pagination and is the
 * intended implementation for production use.
 *
 * `blocksToMarkdown` is intentionally recursive: child blocks are processed
 * with `depth + 1` and their markdown is indented/prefixed accordingly. The
 * recursion depth is bounded by the Notion block nesting limit (~3 levels for
 * most block types).
 */
type FetchChildrenFn = (blockId: string) => Promise<any[]>;

/**
 * Convert an array of Notion blocks to a markdown string.
 *
 * Recursively fetches and converts child blocks via `fetchChildren`.
 *
 * @param blocks - Notion block objects (top-level or already-fetched children)
 * @param fetchChildren - Async callback to fetch child blocks for a block ID.
 *   Called for any block where `has_children: true`. Must return all children
 *   (handle pagination internally). Pass `async () => []` in tests.
 * @param depth - Current nesting depth (internal, default 0; drives indentation)
 */
export async function blocksToMarkdown(
	blocks: any[],
	fetchChildren: FetchChildrenFn,
	depth = 0,
): Promise<string> {
	const parts: string[] = [];

	let i = 0;
	while (i < blocks.length) {
		const block = blocks[i];
		const type: string = block?.type;
		if (!type) { i++; continue; }

		// ── Custom transformer ──────────────────────────────────────────────
		const customTransformer = customTransformers.get(type);
		if (customTransformer) {
			const result = await customTransformer(block, fetchChildren);
			if (result !== false) {
				if (result) parts.push(result);
				i++;
				continue;
			}
		}

		// ── Numbered list: collect consecutive items for correct numbering ──
		if (type === 'numbered_list_item') {
			let counter = 1;
			while (i < blocks.length && blocks[i]?.type === 'numbered_list_item') {
				const item = blocks[i];
				const rt = richTextToMarkdown(item.numbered_list_item?.rich_text ?? []);
				const prefix = `${counter}. `;
				const childMd = item.has_children
					? await blocksToMarkdown(await fetchChildren(item.id), fetchChildren, depth + 1)
					: '';
				const itemMd = childMd
					? `${prefix}${rt}\n${indentBlock(childMd, '   ')}`
					: `${prefix}${rt}`;
				parts.push(itemMd);
				counter++;
				i++;
			}
			continue;
		}

		const md = await blockToMarkdown(block, fetchChildren, depth);
		if (md !== null) parts.push(md);
		i++;
	}

	return joinBlocks(parts);
}

/**
 * Convert a single Notion block to a markdown string.
 * Returns null if the block type is unsupported and has no rich_text.
 */
async function blockToMarkdown(
	block: any,
	fetchChildren: FetchChildrenFn,
	depth = 0,
): Promise<string | null> {
	const type: string = block?.type;
	const content: any = block?.[type];

	switch (type) {
		// ── Paragraphs ──────────────────────────────────────────────────────
		case 'paragraph': {
			const richTexts: any[] = content?.rich_text ?? [];
			// Check if the paragraph contains exactly one equation spanning the whole text
			if (richTexts.length === 1 && richTexts[0].type === 'equation') {
				const expr = richTexts[0].equation?.expression ?? '';
				return `$$\n${expr}\n$$`;
			}
			const text = richTextToMarkdown(richTexts);
			if (!text.trim()) return '';
			return text;
		}

		// ── Headings ────────────────────────────────────────────────────────
		case 'heading_1': {
			const text = richTextToMarkdown(content?.rich_text ?? []);
			return `# ${text}`;
		}
		case 'heading_2': {
			const text = richTextToMarkdown(content?.rich_text ?? []);
			return `## ${text}`;
		}
		case 'heading_3': {
			const text = richTextToMarkdown(content?.rich_text ?? []);
			return `### ${text}`;
		}

		// ── Lists ────────────────────────────────────────────────────────────
		case 'bulleted_list_item': {
			const rt = richTextToMarkdown(content?.rich_text ?? []);
			const childMd = block.has_children
				? await blocksToMarkdown(await fetchChildren(block.id), fetchChildren, depth + 1)
				: '';
			return childMd ? `- ${rt}\n${indentBlock(childMd, '  ')}` : `- ${rt}`;
		}

		// numbered_list_item is handled above in the counter loop

		// ── To-do ────────────────────────────────────────────────────────────
		case 'to_do': {
			const checked = content?.checked ? 'x' : ' ';
			const rt = richTextToMarkdown(content?.rich_text ?? []);
			const childMd = block.has_children
				? await blocksToMarkdown(await fetchChildren(block.id), fetchChildren, depth + 1)
				: '';
			return childMd ? `- [${checked}] ${rt}\n${indentBlock(childMd, '  ')}` : `- [${checked}] ${rt}`;
		}

		// ── Code ─────────────────────────────────────────────────────────────
		case 'code': {
			const lang = content?.language ?? '';
			const text = (content?.rich_text ?? [])
				.map((rt: any) => rt.plain_text ?? rt.text?.content ?? '')
				.join('');
			return `\`\`\`${lang}\n${text}\n\`\`\``;
		}

		// ── Quote ────────────────────────────────────────────────────────────
		case 'quote': {
			const rt = richTextToMarkdown(content?.rich_text ?? []);
			const childMd = block.has_children
				? await blocksToMarkdown(await fetchChildren(block.id), fetchChildren, depth + 1)
				: '';
			const full = childMd ? `${rt}\n\n${childMd}` : rt;
			return prefixLines(full, '> ');
		}

		// ── Callout → GFM alert ──────────────────────────────────────────────
		case 'callout': {
			const rt = richTextToMarkdown(content?.rich_text ?? []);
			const emoji = content?.icon?.emoji ?? '';
			const childMd = block.has_children
				? await blocksToMarkdown(await fetchChildren(block.id), fetchChildren, depth + 1)
				: '';
			// Emit as a GFM alert (> [!NOTE]) when the emoji maps to a known alert type,
			// otherwise fall back to a plain blockquote with an emoji prefix.
			const alertType = EMOJI_TO_GFM_ALERT[emoji];
			if (alertType) {
				const body = childMd ? `${rt}\n\n${childMd}` : rt;
				return `> [!${alertType}]\n${prefixLines(body, '> ')}`;
			}
			const prefix = emoji ? `${emoji} ` : '';
			const body = childMd ? `${prefix}${rt}\n\n${childMd}` : `${prefix}${rt}`;
			return prefixLines(body, '> ');
		}

		// ── Divider ──────────────────────────────────────────────────────────
		case 'divider':
			return '---';

		// ── Image ────────────────────────────────────────────────────────────
		case 'image': {
			const imgType: string = content?.type ?? '';
			const url =
				imgType === 'external'
					? (content?.external?.url ?? '')
					: imgType === 'file'
					? (content?.file?.url ?? '')
					: '';
			if (!url) return null;
			const caption = (content?.caption ?? [])
				.map((rt: any) => rt.plain_text ?? rt.text?.content ?? '')
				.join('')
				.trim();
			return `![${caption}](${url})`;
		}

		// ── Equation block ───────────────────────────────────────────────────
		case 'equation': {
			const expr = content?.expression ?? '';
			return `$$\n${expr}\n$$`;
		}

		// ── Table ────────────────────────────────────────────────────────────
		case 'table': {
			if (block.has_children) {
				const rows = await fetchChildren(block.id);
				return renderTable(rows);
			}
			return null;
		}

		// ── Toggle (rendered as details/summary or just its children) ────────
		case 'toggle': {
			const rt = richTextToMarkdown(content?.rich_text ?? []);
			const childMd = block.has_children
				? await blocksToMarkdown(await fetchChildren(block.id), fetchChildren, depth + 1)
				: '';
			// Render as a markdown blockquote with bold summary line
			if (childMd) {
				return `**${rt}**\n\n${childMd}`;
			}
			return `**${rt}**`;
		}

		// ── Column layout: flatten to sequential blocks ───────────────────────
		case 'column_list': {
			if (block.has_children) {
				const columns = await fetchChildren(block.id);
				const columnMds = await Promise.all(
					columns.map(async (col: any) => {
						if (col.has_children) {
							return blocksToMarkdown(await fetchChildren(col.id), fetchChildren, depth);
						}
						return '';
					}),
				);
				return columnMds.filter(Boolean).join('\n\n');
			}
			return null;
		}

		// ── Synced blocks: fetch children ─────────────────────────────────────
		case 'synced_block': {
			if (block.has_children) {
				const children = await fetchChildren(block.id);
				return blocksToMarkdown(children, fetchChildren, depth);
			}
			return null;
		}

		// ── Link to page: emit sentinel URL ──────────────────────────────────
		// `notion://page/{id}` is a deferred-resolution sentinel — NOT a real URL.
		// It is written here and can be rewritten to a public slug (or stripped to
		// plain text) by the `resolveNotionPageLinks` content transform, which runs
		// as a `content:postprocess` hook with access to the Supabase pages table.
		// Inline page/database mention rich_text items also emit this same sentinel
		// via richTextToMarkdown() → rich-text.ts.
		// If no resolution hook is registered, the sentinel is stored as-is and
		// renders as a broken link — fine for drafts, but configure the hook for
		// any production site that uses cross-page links.
		case 'link_to_page': {
			const linkType = content?.type;
			const pageId =
				linkType === 'page_id'
					? content?.page_id
					: linkType === 'database_id'
					? content?.database_id
					: null;
			if (pageId) {
				const cleanId = pageId.replace(/-/g, '');
				return `[Page link](notion://page/${cleanId})`;
			}
			return null;
		}

		// ── Bookmark ──────────────────────────────────────────────────────────
		case 'bookmark': {
			const url = content?.url ?? '';
			const caption = (content?.caption ?? [])
				.map((rt: any) => rt.plain_text ?? rt.text?.content ?? '')
				.join('')
				.trim();
			if (!url) return null;
			return caption ? `[${caption}](${url})` : url;
		}

		// ── Unsupported: fall back to rich_text if present ───────────────────
		default: {
			if (content?.rich_text) {
				const text = richTextToMarkdown(content.rich_text);
				return text || null;
			}
			return null;
		}
	}
}

// ── Table rendering ──────────────────────────────────────────────────────────

function renderTable(rows: any[]): string {
	if (rows.length === 0) return '';

	const tableRows = rows.map(row => {
		const cells: any[][] = row?.table_row?.cells ?? [];
		return cells.map(cell =>
			richTextToMarkdown(cell)
				.replace(/\\/g, '\\\\')  // escape backslashes first
				.replace(/\|/g, '\\|')   // then escape pipe characters
				.replace(/\n/g, ' ')     // collapse newlines to spaces
		);
	});

	if (tableRows.length === 0) return '';

	const colCount = tableRows[0].length;
	const header = `| ${tableRows[0].join(' | ')} |`;
	const separator = `| ${Array(colCount).fill('---').join(' | ')} |`;
	const body = tableRows.slice(1).map(row => `| ${row.join(' | ')} |`).join('\n');

	return body ? `${header}\n${separator}\n${body}` : `${header}\n${separator}`;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function prefixLines(text: string, prefix: string): string {
	return text
		.split('\n')
		.map(line => `${prefix}${line}`)
		.join('\n');
}

function indentBlock(text: string, indent: string): string {
	return text
		.split('\n')
		.map(line => (line ? `${indent}${line}` : line))
		.join('\n');
}

function joinBlocks(parts: string[]): string {
	// Filter empty strings, then join with blank lines between blocks
	const nonEmpty = parts.filter(p => p !== '' && p !== null && p !== undefined);
	return nonEmpty.join('\n\n');
}

// ── GFM alert emoji map ───────────────────────────────────────────────────────

const EMOJI_TO_GFM_ALERT: Record<string, string> = {
	'📘': 'NOTE',
	'💡': 'TIP',
	'☝️': 'IMPORTANT',
	'⚠️': 'WARNING',
	'❗': 'CAUTION',
};
