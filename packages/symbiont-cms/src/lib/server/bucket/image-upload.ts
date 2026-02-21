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

import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface UploadImageOptions {
	supabase: SupabaseClient;
	pageId: string;
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
	const hash = crypto.createHash('sha256')
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
