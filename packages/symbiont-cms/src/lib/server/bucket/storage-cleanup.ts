/**
 * Media storage cleanup utilities.
 *
 * Scans the `media` bucket and deletes any file that is not referenced by
 * any row in the `pages` table (in either `content` markdown or `cover` URL).
 *
 * Should be run after a full sync — never during incremental/per-page syncs
 * because partial runs don't have a complete picture of what's in use.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { createLogger } from '../utils/logger.js';

export interface MediaCleanupResult {
	/** Number of files deleted (or that would be deleted in a dry run) */
	deleted: number;
	/** Paths deleted (or that would be deleted in a dry run) */
	deletedPaths: string[];
	referencedCount: number;
	totalInBucket: number;
	/** True when no files were actually removed (dry run) */
	dryRun: boolean;
}

/**
 * Regex to extract media paths from a Supabase storage URL.
 * Matches everything after `/media/` (up to whitespace/quote/paren),
 * covering both the flat layout (`hash.ext`) and the legacy
 * per-page layout (`{pageId}/hash.ext`).
 *
 * Example matches:
 *   .../media/abc123def456.jpg         → "abc123def456.jpg"
 *   .../media/page-uuid/abc123.jpg     → "page-uuid/abc123.jpg"
 */
const MEDIA_PATH_RE = /\/media\/([^?#\s"')]+)/g;

/**
 * Collect all media filenames referenced in a string (markdown content or bare URL).
 */
function extractReferencedPaths(text: string, out: Set<string>): void {
	MEDIA_PATH_RE.lastIndex = 0;
	let match: RegExpExecArray | null;
	while ((match = MEDIA_PATH_RE.exec(text)) !== null) {
		out.add(match[1]);
	}
}

/**
 * Recursively list all file paths under a prefix in the media bucket.
 * Needed because legacy images were stored as `{pageId}/{filename}` — the top-level
 * list returns the pageId "folder" entries, not the files inside them.
 */
async function listAllMediaPaths(supabase: SupabaseClient, prefix: string = '', logger?: ReturnType<typeof createLogger>): Promise<string[]> {
	const LIST_PAGE_SIZE = 1000;
	const paths: string[] = [];
	let offset = 0;

	logger?.debug({ event: 'listing_prefix', prefix: prefix || '(root)' });

	while (true) {
		const { data, error } = await supabase.storage
			.from('media')
			.list(prefix, { limit: LIST_PAGE_SIZE, offset, sortBy: { column: 'name', order: 'asc' } });

		if (error) throw new Error(`Failed to list media bucket (prefix "${prefix}"): ${error.message}`);
		if (!data || data.length === 0) break;

		logger?.debug({ event: 'list_page', prefix: prefix || '(root)', count: data.length, offset });

		for (const entry of data) {
			const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
			if (entry.id === null) {
				// Folder — recurse into it to find actual files
				logger?.debug({ event: 'found_folder', path: fullPath });
				const nested = await listAllMediaPaths(supabase, fullPath, logger);
				paths.push(...nested);
			} else {
				paths.push(fullPath);
			}
		}

		if (data.length < LIST_PAGE_SIZE) break;
		offset += LIST_PAGE_SIZE;
	}

	return paths;
}

/**
 * Delete all files in the `media` bucket that are not referenced by any page.
 *
 * Handles both the legacy `{pageId}/{filename}` layout and the current flat layout.
 *
 * Files under `issues/` are always excluded — those are explicitly-pathed uploads
 * (e.g. issue PDFs) that are not referenced via content or cover URLs.
 *
 * @param supabase - Service role Supabase client (needs storage delete + pages read)
 * @param options.dryRun - When true, compute the unreferenced set but skip deletion.
 *   The result still reports what would have been deleted.
 * @param options.excludePrefixes - Additional path prefixes to never delete beyond
 *   the built-in `issues/` exclusion.
 */
export async function cleanupUnusedMedia(
	supabase: SupabaseClient,
	options: { dryRun?: boolean; excludePrefixes?: string[] } = {}
): Promise<MediaCleanupResult> {
	const { dryRun = false, excludePrefixes = [] } = options;
	const allExcludePrefixes = ['issues/', ...excludePrefixes];
	const logger = createLogger({ operation: 'media_cleanup' });

	logger.info({ event: 'cleanup_started', dryRun });

	// ── 1. List all files in the bucket (recursive to handle legacy subdirs) ───
	logger.info({ event: 'listing_bucket' });
	const allFiles = await listAllMediaPaths(supabase, '', logger);

	logger.info({ event: 'bucket_listed', totalFiles: allFiles.length, files: allFiles });

	// Apply prefix exclusions before any further processing.
	const filteredFiles = allFiles.filter((p) => !allExcludePrefixes.some((prefix) => p.startsWith(prefix)));

	logger.info({
		event: 'prefix_exclusions_applied',
		excludePrefixes: allExcludePrefixes,
		before: allFiles.length,
		after: filteredFiles.length,
		excluded: allFiles.length - filteredFiles.length
	});

	if (filteredFiles.length === 0) {
		return { deleted: 0, deletedPaths: [], referencedCount: 0, totalInBucket: allFiles.length, dryRun };
	}

	// ── 2. Collect all referenced paths from every page ───────────────────────
	// Paginate in case there are more than 1000 pages (Supabase default row limit).
	const PAGE_SIZE = 1000;
	const referencedPaths = new Set<string>();
	let pageOffset = 0;
	let totalPages = 0;

	while (true) {
		const { data: pages, error: pagesError } = await supabase
			.from('pages')
			.select('content, cover')
			.range(pageOffset, pageOffset + PAGE_SIZE - 1);

		if (pagesError) {
			throw new Error(`Failed to query pages for media references: ${pagesError.message}`);
		}

		if (!pages || pages.length === 0) break;
		totalPages += pages.length;

		for (const page of pages) {
			if (page.content) extractReferencedPaths(page.content, referencedPaths);
			if (page.cover) extractReferencedPaths(page.cover, referencedPaths);
		}

		logger.debug({ event: 'pages_batch_scanned', offset: pageOffset, count: pages.length });

		if (pages.length < PAGE_SIZE) break;
		pageOffset += PAGE_SIZE;
	}

	logger.info({ event: 'pages_queried', pageCount: totalPages });

	logger.info({ event: 'references_collected', referencedCount: referencedPaths.size, referencedPaths: [...referencedPaths] });

	// ── 3. Compute unreferenced set ─────────────────────────────────────────────
	const toDelete = filteredFiles.filter((path) => !referencedPaths.has(path));

	logger.info({ event: 'diff_computed', totalInBucket: allFiles.length, filtered: filteredFiles.length, referenced: referencedPaths.size, toDelete: toDelete.length, paths: toDelete });

	if (toDelete.length === 0) {
		logger.info({ event: 'no_unused_media' });
		return {
			deleted: 0,
			deletedPaths: [],
			referencedCount: referencedPaths.size,
			totalInBucket: allFiles.length,
			dryRun
		};
	}

	if (dryRun) {
		logger.info({ event: 'dry_run_would_delete', count: toDelete.length, paths: toDelete });
		return {
			deleted: toDelete.length,
			deletedPaths: toDelete,
			referencedCount: referencedPaths.size,
			totalInBucket: allFiles.length,
			dryRun: true
		};
	}

	logger.info({ event: 'deleting_unused_media', count: toDelete.length, paths: toDelete });

	// ── 4. Delete in batches ────────────────────────────────────────────────────
	// Supabase Storage's remove() accepts an array of paths; keep batches reasonable.
	const BATCH_SIZE = 100;
	for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
		const batch = toDelete.slice(i, i + BATCH_SIZE);
		logger.info({ event: 'deleting_batch', batchIndex: Math.floor(i / BATCH_SIZE), batchSize: batch.length, paths: batch });
		const { error: deleteError } = await supabase.storage.from('media').remove(batch);
		if (deleteError) {
			throw new Error(`Failed to delete media batch: ${deleteError.message}`);
		}
		logger.info({ event: 'batch_deleted', batchIndex: Math.floor(i / BATCH_SIZE) });
	}

	logger.info({ event: 'cleanup_complete', deleted: toDelete.length });

	return {
		deleted: toDelete.length,
		deletedPaths: toDelete,
		referencedCount: referencedPaths.size,
		totalInBucket: allFiles.length,
		dryRun: false
	};
}
