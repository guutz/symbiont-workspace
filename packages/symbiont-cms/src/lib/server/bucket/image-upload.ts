/**
 * Image upload pipeline for Symbiont CMS.
 * Uploads images to Supabase Storage during Notion sync.
 * 
 * Strategy:
 * - Upload Notion CDN images (expire after ~1 hour)
 * - Migrate old Nhost-hosted images
 * - Organize by page ID: media/{page_id}/{hash}.{ext}
 * - Use content hash for filenames to prevent collisions
 * - Store original URL in file metadata for reference
 */

import { createHash } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UploadImageOptions {
	supabase: SupabaseClient;
	pageId: string;
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
	pageId: string;
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
	return url.includes('prod-files-secure') ||  // Notion CDN
		   url.includes('notion.so') ||         // Notion cache URLs
	       url.includes('googleusercontent') ||   // Google images
	       url.includes('ygsdnfrbruuhtxczekur');  // Old Nhost instance
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
 * Resolve filename for an image
 * 
 * Strategy:
 * - Always use content hash as the primary filename to avoid collisions
 * - Original filename/URL preserved in file metadata
 */
function resolveFilename(url: string, buffer: Buffer): string {
	const hash = createHash('sha256')
		.update(buffer)
		.digest('hex')
		.substring(0, 12);
	
	const ext = getExtensionFromUrl(url) || 'jpg';
	return `${hash}.${ext}`;
}

/**
 * Upload an image to Supabase Storage
 */
export async function uploadImageToSupabase(
	url: string,
	options: UploadImageOptions
): Promise<UploadImageResult> {
	const { supabase, pageId } = options;
	
	// Download image
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download image: ${response.statusText}`);
	}
	const arrayBuffer = await response.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);
	
	// Resolve filename using content hash
	const filename = resolveFilename(url, buffer);
	const path = `${pageId}/${filename}`;
	
	// Get content type
	const contentType = response.headers.get('content-type') || `image/${getExtensionFromUrl(filename)}`;
	
	// Upload (upsert to handle re-syncs)
	// Store original URL in custom metadata for reference/debugging
	const { error } = await supabase.storage
		.from('media')
		.upload(path, buffer, {
			contentType,
			cacheControl: '31536000', // 1 year
			upsert: true,
			metadata: {
				originalUrl: url
			}
		});
	
	if (error) {
		throw new Error(`Upload failed: ${error.message}`);
	}
	
	// Get public URL
	const { data } = supabase.storage.from('media').getPublicUrl(path);
	
	return {
		originalUrl: url,
		newUrl: data.publicUrl,
		path,
		filename
	};
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
	const { supabase, pageId, contentType: forcedContentType, storagePath } = options;

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
		path = `${pageId}/${filename}`;
	}

	const { error } = await supabase.storage
		.from('media')
		.upload(path, buffer, {
			contentType,
			cacheControl: '31536000',
			upsert: true,
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
	const { supabase, pageId, filename, contentType } = options;
	const path = `${pageId}/${filename}`;

	const { error } = await supabase.storage
		.from('media')
		.upload(path, buffer, {
			contentType,
			cacheControl: '31536000',
			upsert: true
		});

	if (error) {
		throw new Error(`Upload failed: ${error.message}`);
	}

	const { data } = supabase.storage.from('media').getPublicUrl(path);
	return { originalUrl: '', newUrl: data.publicUrl, path, filename };
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
