/**
 * Image upload pipeline for Symbiont CMS.
 * Uploads images to Supabase Storage during Notion sync.
 * 
 * Strategy:
 * - Upload Notion CDN images (expire after ~1 hour)
 * - Migrate old Nhost-hosted images
 * - Organize by page ID: media/{page_id}/{filename}.{ext}
 * - Preserve original filenames when available
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

export interface UploadImageOptions {
	supabaseUrl: string;
	serviceRoleKey: string;
	pageId: string;
	altText?: string; // Optional alt text from markdown for filename
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
 * Priority: Notion CDN filename > alt text > content hash
 */
function resolveFilename(url: string, buffer: Buffer, altText?: string): string {
	// 1. Try to extract filename from Notion CDN URLs
	if (url.includes('prod-files-secure') || url.includes('s3.us-west-2.amazonaws.com')) {
		try {
			const urlObj = new URL(url);
			const pathname = urlObj.pathname;
			const segments = pathname.split('/');
			const lastSegment = segments[segments.length - 1];
			
			// Check if it looks like a real filename (has extension)
			if (lastSegment && /\.\w{2,4}$/.test(lastSegment)) {
				const sanitized = lastSegment
					.replace(/[^a-zA-Z0-9._-]/g, '_')
					.substring(0, 100); // Limit length
				return sanitized;
			}
		} catch {
			// URL parsing failed, continue to fallback
		}
	}
	
	// 2. Try to use alt text from markdown (if provided and looks reasonable)
	if (altText && altText.length > 0 && altText.length < 100) {
		const sanitized = altText
			.toLowerCase()
			.replace(/\s+/g, '-')
			.replace(/[^a-z0-9._-]/g, '')
			.substring(0, 80);
		
		if (sanitized.length > 3) { // Only use if we got something meaningful
			const ext = getExtensionFromUrl(url) || 'jpg';
			return `${sanitized}.${ext}`;
		}
	}
	
	// 3. Fall back to content hash
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
	const { supabaseUrl, serviceRoleKey, pageId, altText } = options;
	
	const supabase = createClient(supabaseUrl, serviceRoleKey);
	
	// Download image
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to download image: ${response.statusText}`);
	}
	const arrayBuffer = await response.arrayBuffer();
	const buffer = Buffer.from(arrayBuffer);
	
	// Resolve filename (with optional alt text)
	const filename = resolveFilename(url, buffer, altText);
	const path = `${pageId}/${filename}`;
	
	// Get content type
	const contentType = response.headers.get('content-type') || `image/${getExtensionFromUrl(filename)}`;
	
	// Upload (upsert to handle re-syncs)
	const { error } = await supabase.storage
		.from('media')
		.upload(path, buffer, {
			contentType,
			cacheControl: '31536000', // 1 year
			upsert: true
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
