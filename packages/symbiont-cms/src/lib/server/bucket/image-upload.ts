/**
 * Image upload pipeline for Symbiont CMS.
 * Uploads images to Supabase Storage during Notion sync.
 *
 * Storage layout: flat bucket — media/{sha256_of_bytes[:12]}.{ext}
 *
 * Flat layout means:
 * - Same image used across multiple pages is stored exactly once.
 * - Content hash is the filename: same bytes → same name, always.
 * - Original source URL preserved in file metadata for reference.
 *
 * Exception: uploadFileToSupabase with an explicit storagePath (e.g.
 * issues/2024-10-21.pdf) bypasses this scheme and uses the caller-specified
 * path directly.
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UploadImageOptions {
	supabase: SupabaseClient;
}

export interface UploadFileOptions extends UploadImageOptions {
	/** Override content type instead of inferring from response headers (e.g. 'application/pdf') */
	contentType?: string;
	/**
	 * Override the full storage path (e.g. 'issues/2024-10-21.pdf').
	 * When set, pageId and hash-based filename generation are bypassed entirely.
	 */
	storagePath?: string;
}

export interface UploadBufferOptions {
	supabase: SupabaseClient;
	/** Filename including extension, e.g. 'thumb_abc123.png' */
	filename: string;
	contentType: string;
}

export interface UploadImageResult {
	originalUrl: string;
	newUrl: string;
	path: string;
	filename: string;
}

/**
 * Detect if a URL needs to be uploaded to Supabase Storage
 */
export function needsUploadToSupabase(url: string): boolean {
	// Already in Supabase Storage — never re-upload regardless of what else matches.
	if (url.includes('.supabase.co/storage')) return false;

	return url.includes('prod-files-secure') ||  // Notion CDN
		   url.includes('notion.so') ||          // Notion cache URLs
	       url.includes('googleusercontent') ||  // Google images
	       url.includes('ygsdnfrbruuhtxczekur'); // Old Nhost instance
}

/**
 * Get file extension from URL
 */
function getExtensionFromUrl(urlOrFilename: string): string {
	try {
		const urlObj = new URL(urlOrFilename);
		const pathname = urlObj.pathname;
		const match = pathname.match(/\.(\w{2,4})(?:$|\?)/);
		return match ? match[1] : 'jpg';
	} catch {
		// Not a URL, treat as filename
		const match = urlOrFilename.match(/\.(\w{2,4})$/);
		return match ? match[1] : 'jpg';
	}
}

/**
 * Upload an image to Supabase Storage.
 *
 * Filename is the SHA-256 hash of the image bytes — same content always
 * produces the same name, regardless of the source URL. This handles the
 * interrupted-sync edge case (upload completed but Supabase URL wasn't
 * written back to Notion) without any pre-download storage check.
 *
 * Already-synced images never reach this function: needsUploadToSupabase()
 * returns false for Supabase URLs, so they're filtered out upstream.
 */
export async function uploadImageToSupabase(
	url: string,
	options: UploadImageOptions
): Promise<UploadImageResult> {
	const { supabase } = options;

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download image: ${response.statusText}`);
	}
	const arrayBuffer = await response.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);
	const contentType = response.headers.get('content-type') || `image/${getExtensionFromUrl(url)}`;

	const hash = createHash('sha256').update(buffer).digest('hex').substring(0, 12);
	const ext = getExtensionFromUrl(url) || 'jpg';
	const filename = `${hash}.${ext}`;

	// File with this content already in storage — skip upload.
	const { data: existingFiles } = await supabase.storage
		.from('media')
		.list('', { search: filename, limit: 1 });

	if (existingFiles && existingFiles.length > 0) {
		const { data } = supabase.storage.from('media').getPublicUrl(filename);
		return { originalUrl: url, newUrl: data.publicUrl, path: filename, filename };
	}

	const { error } = await supabase.storage
		.from('media')
		.upload(filename, buffer, {
			contentType,
			cacheControl: '31536000', // 1 year
			upsert: false,
			metadata: { originalUrl: url }
		});

	if (error) {
		throw new Error(`Upload failed: ${error.message}`);
	}

	const { data } = supabase.storage.from('media').getPublicUrl(filename);
	return { originalUrl: url, newUrl: data.publicUrl, path: filename, filename };
}

/**
 * Upload any file to Supabase Storage from a URL.
 * Like uploadImageToSupabase but with an explicit contentType override so
 * non-image files (PDFs, etc.) get the correct extension and MIME type instead
 * of falling back to 'jpg'.
 */
export async function uploadFileToSupabase(
	url: string,
	options: UploadFileOptions
): Promise<UploadImageResult> {
	const { supabase, contentType: forcedContentType, storagePath } = options;

	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download file: ${response.statusText}`);
	}
	const arrayBuffer = await response.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);

	const contentType = forcedContentType || response.headers.get('content-type') || 'application/octet-stream';

	let path: string;
	let filename: string;

	if (storagePath) {
		path = storagePath;
		filename = storagePath.split('/').pop() ?? storagePath;
	} else {
		// Derive extension: try URL first, fall back to content-type subtype
		const extFromUrl = (() => {
			try {
				const pathname = new URL(url).pathname;
				const m = pathname.match(/\.(\w{2,5})(?:$|\?)/);
				return m ? m[1] : null;
			} catch { return null; }
		})();
		const extFromContentType = contentType.split('/')[1]?.split(';')[0]?.split('+')[0] ?? 'bin';
		const ext = extFromUrl ?? extFromContentType;
		const hash = createHash('sha256').update(buffer).digest('hex').substring(0, 12);
		filename = `${hash}.${ext}`;
		path = filename; // flat — no pageId prefix
	}

	// Existence check — directory prefix is the path up to the last slash (or
	// empty string for flat files at bucket root).
	const pathDir = path.includes('/') ? path.substring(0, path.lastIndexOf('/')) : '';
	const { data: existingFiles } = await supabase.storage
		.from('media')
		.list(pathDir, { search: filename, limit: 1 });

	if (existingFiles && existingFiles.length > 0) {
		const { data } = supabase.storage.from('media').getPublicUrl(path);
		return { originalUrl: url, newUrl: data.publicUrl, path, filename };
	}

	const { error } = await supabase.storage
		.from('media')
		.upload(path, buffer, {
			contentType,
			cacheControl: '31536000',
			upsert: false,
			metadata: { originalUrl: url }
		});

	if (error) {
		throw new Error(`Upload failed: ${error.message}`);
	}

	const { data } = supabase.storage.from('media').getPublicUrl(path);
	return { originalUrl: url, newUrl: data.publicUrl, path, filename };
}

/**
 * Upload a pre-loaded Buffer to Supabase Storage.
 * Use this when you already have the file bytes in memory (e.g. a generated
 * thumbnail) and don't have a source URL to fetch from.
 */
export async function uploadBufferToSupabase(
	buffer: Buffer,
	options: UploadBufferOptions
): Promise<UploadImageResult> {
	const { supabase, filename, contentType } = options;

	const { error } = await supabase.storage
		.from('media')
		.upload(filename, buffer, {
			contentType,
			cacheControl: '31536000',
			upsert: true
		});

	if (error) {
		throw new Error(`Upload failed: ${error.message}`);
	}

	const { data } = supabase.storage.from('media').getPublicUrl(filename);
	return { originalUrl: '', newUrl: data.publicUrl, path: filename, filename };
}

/**
 * Get image URL with optional transformations (Pro plan feature)
 * Falls back to original URL on free tier
 */
export function getImageUrl(
	supabase: any,
	path: string,
	transform?: {
		width?: number;
		height?: number;
		quality?: number;
		resize?: 'cover' | 'contain' | 'fill';
	}
): string {
	if (transform) {
		const { data } = supabase.storage
			.from('media')
			.getPublicUrl(path, { transform });
		
		return data.publicUrl;
	}
	
	const { data } = supabase.storage.from('media').getPublicUrl(path);
	return data.publicUrl;
}
