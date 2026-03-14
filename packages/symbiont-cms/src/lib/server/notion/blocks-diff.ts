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
	const annotations = {
		bold:          rt?.annotations?.bold          ?? false,
		italic:        rt?.annotations?.italic        ?? false,
		strikethrough: rt?.annotations?.strikethrough ?? false,
		underline:     rt?.annotations?.underline     ?? false,
		code:          rt?.annotations?.code          ?? false,
		color:         rt?.annotations?.color         ?? 'default',
	};

	if (rt?.type === 'equation') {
		return {
			type: 'equation',
			equation: {
				expression: rt?.equation?.expression ?? '',
			},
			annotations,
		};
	}

	if (rt?.type === 'mention') {
		return {
			type: 'mention',
			mention: normalizeMention(rt?.mention),
			annotations,
		};
	}

	return {
		type: rt?.type ?? 'text',
		text: {
			content: rt?.text?.content ?? '',
			link: rt?.text?.link ?? null,
		},
		annotations,
	};
}

function normalizeMention(mention: any): any {
	const type = mention?.type ?? 'unknown';

	switch (type) {
		case 'page':
			return { type, page: { id: mention?.page?.id ?? '' } };
		case 'database':
			return { type, database: { id: mention?.database?.id ?? '' } };
		case 'date':
			return {
				type,
				date: {
					start: mention?.date?.start ?? '',
					end: mention?.date?.end ?? null,
				},
			};
		case 'link_preview':
			return {
				type,
				link_preview: { url: mention?.link_preview?.url ?? '' },
			};
		case 'template_mention':
			return { type, template_mention: mention?.template_mention ?? null };
		case 'user':
			return { type, user: { id: mention?.user?.id ?? '' } };
		default:
			return { type };
	}
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

// ── Diff types ──────────────────────────────────────────────────────────────

/**
 * A lightweight fingerprint of a single block used for diffing.
 *
 * Existing blocks (from Notion API) have an `id`; desired blocks (generated
 * from markdown) do not.
 */
export type BlockFingerprint = {
	id?: string;
	type: string;
	normalized: any;
	hasChildren: boolean;
	raw: any;
};

/**
 * A single operation in the edit script produced by `diffBlocks()`.
 */
export type EditOperation =
	| { op: 'keep';    existingId: string }
	| { op: 'update';  existingId: string; existingType: string; newContent: any }
	| { op: 'insert';  afterId: string | null; block: any }
	| { op: 'delete';  existingId: string }
	| { op: 'replace'; existingId: string; newBlock: any };

/**
 * The full result of a `diffBlocks()` call.
 *
 * `forceFullReplace` is `true` when the diff is so large that a surgical
 * patch is no cheaper than the nuke-and-repave fallback.
 */
export type DiffResult = {
	operations: EditOperation[];
	stats: {
		kept:     number;
		updated:  number;
		inserted: number;
		deleted:  number;
		replaced: number;
	};
	forceFullReplace: boolean;
};

// ── Diff algorithm ──────────────────────────────────────────────────────────

/** How many positions ahead to look when resolving a type mismatch. */
const LOOKAHEAD = 3;

/**
 * Build a `BlockFingerprint` for `block`.
 *
 * For existing blocks (returned by the Notion API) pass the block as-is —
 * `block.id` will be present.  For desired blocks (generated from markdown)
 * `id` will be `undefined`.
 */
export function fingerprintBlock(block: any): BlockFingerprint {
	return {
		id:          block?.id,
		type:        block?.type ?? 'unknown',
		normalized:  normalizeBlockForDiff(block),
		hasChildren: block?.has_children === true,
		raw:         block,
	};
}

/**
 * Compute a minimal edit script that transforms `existing` into `desired`.
 *
 * Algorithm: single forward pass with a bounded lookahead window.
 * - Same-type blocks at the same position are kept or updated in-place.
 * - On a type mismatch a short lookahead decides whether to emit a delete
 *   (existing has an extra block) or an insert (desired has a new block).
 * - If neither lookahead matches, emit a replace (delete + insert) and
 *   advance both pointers.
 *
 * When the fraction of changed blocks exceeds `forceFullReplaceThreshold`
 * the result has `forceFullReplace: true` and the caller should fall back to
 * `updatePageBlocks()`.
 *
 * @param existing               - Blocks currently in Notion (must have `.id`).
 * @param desired                - Blocks generated from markdown (no `.id`).
 * @param forceFullReplaceThreshold - 0–1 fraction; default 0.6.
 */
export function diffBlocks(
	existing: any[],
	desired: any[],
	forceFullReplaceThreshold = 0.6,
): DiffResult {
	const ops: EditOperation[] = [];
	const stats = { kept: 0, updated: 0, inserted: 0, deleted: 0, replaced: 0 };

	const ef = existing.map(fingerprintBlock);
	const df = desired.map(fingerprintBlock);

	let i = 0; // pointer into ef (existing)
	let j = 0; // pointer into df (desired)

	// Track the last "anchored" existing block ID so inserts can reference it.
	let lastAnchorId: string | null = null;

	while (i < ef.length && j < df.length) {
		const e = ef[i];
		const d = df[j];

		if (e.type === d.type) {
			// Same type — keep or update in-place.

			// Check whether the desired block carries non-empty children.
			// The Notion blocks.update endpoint rejects a `children` field, so any
			// desired block with children must be written via a replace (delete + append)
			// rather than an update.  It also means the normalized-form comparison must
			// treat "existing has no children, desired has children" as non-identical.
			const desiredContent = (d.raw[d.type] as any);
			const desiredHasChildren =
				Array.isArray(desiredContent?.children) && desiredContent.children.length > 0;

			const identical =
				!e.hasChildren &&
				!desiredHasChildren &&
				e.normalized !== null &&
				d.normalized !== null &&
				!e.normalized._file &&
				!e.normalized._unknown &&
				!d.normalized._file &&
				!d.normalized._unknown &&
				JSON.stringify(e.normalized) === JSON.stringify(d.normalized);

			if (identical) {
				ops.push({ op: 'keep', existingId: e.id! });
				stats.kept++;
			} else {
				// Content changed — update the existing block in-place.
				// If the existing block has children, or the desired block has children,
				// or the normalized form has a sentinel, fall back to a replace so we
				// don't leave stale children behind and to avoid the update-endpoint
				// constraint on the `children` field.
				if (e.hasChildren || desiredHasChildren || e.normalized?._file || e.normalized?._unknown) {
					ops.push({ op: 'replace', existingId: e.id!, newBlock: d.raw });
					stats.replaced++;
				} else {
					const typeContent = d.raw[d.type];
					ops.push({
						op:          'update',
						existingId:  e.id!,
						existingType: e.type,
						newContent:  typeContent,
					});
					stats.updated++;
				}
			}
			lastAnchorId = e.id!;
			i++;
			j++;
			continue;
		}

		// Type mismatch — look ahead to decide what happened.
		// We compare by content (normalized form) to accurately identify whether
		// a future existing block is the same as the current desired block (→ insert),
		// or a future desired block is the same as the current existing block (→ delete).
		let matchInExisting = -1;
		let matchInDesired  = -1;

		for (let k = 1; k <= LOOKAHEAD; k++) {
			if (matchInExisting === -1 && i + k < ef.length) {
				const en = ef[i + k].normalized;
				const dn = d.normalized;
				const sameContent = en && dn &&
					!en._file && !en._unknown && !dn._file && !dn._unknown &&
					ef[i + k].type === d.type &&
					JSON.stringify(en) === JSON.stringify(dn);
				if (sameContent) matchInExisting = k;
			}
			if (matchInDesired === -1 && j + k < df.length) {
				const en = e.normalized;
				const dn = df[j + k].normalized;
				const sameContent = en && dn &&
					!en._file && !en._unknown && !dn._file && !dn._unknown &&
					e.type === df[j + k].type &&
					JSON.stringify(en) === JSON.stringify(dn);
				if (sameContent) matchInDesired = k;
			}
			if (matchInExisting !== -1 && matchInDesired !== -1) break;
		}

		if (matchInExisting !== -1 && (matchInDesired === -1 || matchInExisting <= matchInDesired)) {
			// Existing has extra blocks → delete them.
			for (let k = 0; k < matchInExisting; k++) {
				ops.push({ op: 'delete', existingId: ef[i + k].id! });
				stats.deleted++;
			}
			i += matchInExisting;
		} else if (matchInDesired !== -1) {
			// Desired has new blocks → insert them before the existing block.
			for (let k = 0; k < matchInDesired; k++) {
				ops.push({ op: 'insert', afterId: lastAnchorId, block: df[j + k].raw });
				stats.inserted++;
				// Subsequent inserts with no anchor will be appended to the end of the page.
			}
			j += matchInDesired;
		} else {
			// Neither lookahead found a content match — replace both.
			ops.push({ op: 'replace', existingId: e.id!, newBlock: d.raw });
			stats.replaced++;
			lastAnchorId = e.id!;
			i++;
			j++;
		}
	}

	// Drain leftover existing blocks (delete them).
	while (i < ef.length) {
		ops.push({ op: 'delete', existingId: ef[i].id! });
		stats.deleted++;
		i++;
	}

	// Drain leftover desired blocks (append them).
	while (j < df.length) {
		ops.push({ op: 'insert', afterId: lastAnchorId, block: df[j].raw });
		stats.inserted++;
		lastAnchorId = null; // subsequent drain inserts go to end (afterId=null)
		j++;
	}

	// Decide whether surgical patching is worthwhile.
	const total     = Math.max(existing.length, desired.length);
	const changed   = stats.updated + stats.inserted + stats.deleted + stats.replaced;
	const fraction  = total === 0 ? 0 : changed / total;
	const forceFullReplace = fraction > forceFullReplaceThreshold;

	return { operations: ops, stats, forceFullReplace };
}
