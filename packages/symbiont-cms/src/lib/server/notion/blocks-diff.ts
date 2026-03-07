/**
 * Block diffing utilities for Notion content sync.
 *
 * Lets us skip the expensive delete-all → re-append cycle inside
 * updatePageBlocks() when the content hasn't actually changed since the last
 * sync.
 *
 * The core challenge is that the Notion API adds metadata to every block it
 * returns (id, timestamps, plain_text, href, color: "default", …) that is
 * absent from the blocks we generate locally.  normalizeBlockForDiff() strips
 * all of that so the two can be compared on equal footing.
 */

// ── Rich-text normalization ────────────────────────────────────────────────

/**
 * Normalize a single rich_text span.
 * Removes fields that the Notion API adds on read (plain_text, href) but that
 * we never set when uploading blocks.
 */
function normalizeRichText(rt: any): any {
	return {
		type: rt?.type ?? 'text',
		text: {
			content: rt?.text?.content ?? '',
			link: rt?.text?.link ?? null,
		},
		annotations: {
			bold:          rt?.annotations?.bold          ?? false,
			italic:        rt?.annotations?.italic        ?? false,
			strikethrough: rt?.annotations?.strikethrough ?? false,
			underline:     rt?.annotations?.underline     ?? false,
			code:          rt?.annotations?.code          ?? false,
			color:         rt?.annotations?.color         ?? 'default',
		},
	};
}

function normalizeRichTextArray(rts: any[] | undefined): any[] {
	return (rts ?? []).map(normalizeRichText);
}

// ── Block normalization ────────────────────────────────────────────────────

const RICH_TEXT_BLOCK_TYPES = new Set([
	'paragraph',
	'heading_1',
	'heading_2',
	'heading_3',
	'bulleted_list_item',
	'numbered_list_item',
	'quote',
	'to_do',
	'toggle',
	'callout',
]);

/**
 * Normalize a Notion block to a canonical, metadata-free form for diffing.
 *
 * Returns `null` if `block.type` is missing.
 * Returns a sentinel `{ type, _file: true }` for Notion-hosted (file) images —
 *   their signed URLs change on every API call and cannot be compared.
 * Returns a sentinel `{ type, _unknown: true }` for block types we don't know
 *   how to normalize — callers should treat those as "not equal".
 *
 * NOTE: Children are intentionally NOT recursed into.  If an existing block has
 * `has_children: true`, blocksAreEquivalent() detects this and conservatively
 * returns false so a full re-upload is triggered.
 */
export function normalizeBlockForDiff(block: any): any | null {
	const type: string = block?.type;
	if (!type) return null;

	const content: any = block[type];

	// ── Image ───────────────────────────────────────────────────────────────
	if (type === 'image') {
		// Notion-hosted images have signed, ephemeral URLs → always re-upload.
		if (content?.type === 'file') {
			return { type, _file: true };
		}
		return {
			type,
			image: {
				type: 'external',
				external: { url: content?.external?.url ?? '' },
			},
		};
	}

	// ── Structural blocks with no content ───────────────────────────────────
	if (type === 'divider') return { type };

	// ── Equation ────────────────────────────────────────────────────────────
	if (type === 'equation') {
		return { type, equation: { expression: content?.expression ?? '' } };
	}

	// ── Bookmark ────────────────────────────────────────────────────────────
	if (type === 'bookmark') {
		return { type, bookmark: { url: content?.url ?? '' } };
	}

	// ── Code ────────────────────────────────────────────────────────────────
	if (type === 'code') {
		return {
			type,
			code: {
				rich_text: normalizeRichTextArray(content?.rich_text),
				language: content?.language ?? 'plain text',
			},
		};
	}

	// ── Rich-text block types ────────────────────────────────────────────────
	if (RICH_TEXT_BLOCK_TYPES.has(type)) {
		const normalized: any = {
			rich_text: normalizeRichTextArray(content?.rich_text),
		};

		if ('checked' in (content ?? {})) {
			normalized.checked = content.checked ?? false;
		}

		// Only include a non-default color so we don't mismatch on the
		// `color: "default"` that Notion always echoes back.
		if (content?.color && content.color !== 'default') {
			normalized.color = content.color;
		}

		return { type, [type]: normalized };
	}

	// ── Unknown block type ───────────────────────────────────────────────────
	// Return a sentinel so the caller falls back to a full re-upload rather
	// than silently treating an unknown block as equal.
	return { type, _unknown: true };
}

// ── Public comparison API ──────────────────────────────────────────────────

/**
 * Returns `true` if the existing Notion blocks and the newly-generated blocks
 * are semantically equivalent (same content, ignoring API metadata).
 *
 * **Conservative semantics** — returns `false` (i.e. "needs update") when:
 * - Block counts differ.
 * - Any existing block has `has_children: true`.  Comparing nested blocks
 *   would require additional API round-trips; it's cheaper to just re-upload.
 * - Any block is a Notion-hosted file image (ephemeral signed URL).
 * - Any block is of an unknown type.
 *
 * @param existingBlocks - Top-level blocks returned by the Notion API for the page.
 * @param newBlocks      - Blocks produced by convertMarkdownToNotionBlocks().
 */
export function blocksAreEquivalent(existingBlocks: any[], newBlocks: any[]): boolean {
	if (existingBlocks.length !== newBlocks.length) return false;

	// If any block has nested children we'd need recursive API calls to compare
	// them.  Conservatively treat the page as changed.
	if (existingBlocks.some((b) => b?.has_children === true)) return false;

	const normalizedExisting = existingBlocks.map(normalizeBlockForDiff);
	const normalizedNew      = newBlocks.map(normalizeBlockForDiff);

	// Bail out on any sentinel value.
	if (normalizedExisting.some((b) => b?._file || b?._unknown)) return false;
	if (normalizedNew.some((b) => b?._file || b?._unknown))      return false;

	return JSON.stringify(normalizedExisting) === JSON.stringify(normalizedNew);
}
