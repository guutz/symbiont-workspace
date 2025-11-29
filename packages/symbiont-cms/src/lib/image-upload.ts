/**
 * Image upload pipeline for Symbiont CMS.
 * Downloads external images and uploads them to Nhost Storage.
 */

import type { NhostClient } from '@nhost/nhost-js';

export interface ImageUploadOptions {
	/** Nhost client instance */
	nhost: NhostClient;
	/** Target bucket name (default: 'uploads') */
	bucketId?: string;
	/** Optional path prefix within bucket (e.g., 'blog-images/') */
	pathPrefix?: string;
	/** Optional custom fetch implementation */
	fetchImpl?: typeof fetch;
}

export interface ImageUploadResult {
	/** Original URL that was processed */
	originalUrl: string;
	/** New public URL from Nhost Storage */
	newUrl: string;
	/** Nhost Storage file ID */
	fileId: string;
	/** MIME type of the uploaded file */
	mimeType: string;
	/** File size in bytes */
	size: number;
}

export interface ImageUploadError {
	originalUrl: string;
	error: string;
}

/**
 * Download an image from a URL and return as a Blob.
 */
async function downloadImage(
	url: string,
	fetchImpl: typeof fetch = fetch
): Promise<Blob> {
	const response = await fetchImpl(url);
	if (!response.ok) {
		throw new Error(`Failed to download image: ${response.status} ${response.statusText}`);
	}

	return await response.blob();
}

/**
 * Extract filename from URL.
 */
function getFilenameFromUrl(url: string): string {
	try {
		const urlObj = new URL(url);
		const pathname = urlObj.pathname;
		const segments = pathname.split('/').filter(Boolean);
		let filename = segments[segments.length - 1] || 'image.jpg';
		
		// Remove query params
		filename = filename.split('?')[0];
		
		// Ensure it has an extension
		if (!filename.includes('.')) {
			filename = `${filename}.jpg`;
		}
		
		return filename;
	} catch (e) {
		return 'image.jpg';
	}
}

/**
 * Upload a single image from a URL to Nhost Storage.
 */
export async function uploadImage(
	url: string,
	options: ImageUploadOptions
): Promise<ImageUploadResult> {
	const {
		nhost,
		bucketId = 'uploads',
		pathPrefix = '',
		fetchImpl = fetch
	} = options;

	// Download the image
	const blob = await downloadImage(url, fetchImpl);

	// Extract filename from URL
	const filename = getFilenameFromUrl(url);
	const fullPath = pathPrefix ? `${pathPrefix.replace(/\/$/, '')}/${filename}` : filename;

	// Convert Blob to File (Nhost will auto-detect MIME type)
	const file = new File([blob], fullPath);

	// Upload to Nhost Storage using the uploadFiles API
	const uploadResp = await nhost.storage.uploadFiles({
		'bucket-id': bucketId,
		'file[]': [file]
	});

	// Check for errors (FetchResponse throws on >= 300 status codes)
	if (!uploadResp.body?.processedFiles?.[0]) {
		throw new Error('Upload succeeded but no file metadata returned');
	}

	const fileMetadata = uploadResp.body.processedFiles[0];

	// Construct public URL (Nhost serves files at /v1/storage/files/{fileId})
	// We need to get the storage URL from the Nhost configuration
	// For now, construct it from the GraphQL URL (they share the same base)
	const graphqlUrl = (nhost as any).graphql?.httpUrl || '';
	const baseUrl = graphqlUrl.replace('/v1/graphql', '');
	const publicUrl = `${baseUrl}/v1/storage/files/${fileMetadata.id}`;

	return {
		originalUrl: url,
		newUrl: publicUrl,
		fileId: fileMetadata.id,
		mimeType: fileMetadata.mimeType,
		size: fileMetadata.size
	};
}

/**
 * Upload multiple images in parallel with error handling.
 */
export async function uploadImages(
	urls: string[],
	options: ImageUploadOptions
): Promise<{
	successful: ImageUploadResult[];
	failed: ImageUploadError[];
}> {
	const results = await Promise.allSettled(urls.map((url) => uploadImage(url, options)));

	const successful: ImageUploadResult[] = [];
	const failed: ImageUploadError[] = [];

	results.forEach((result, index) => {
		if (result.status === 'fulfilled') {
			successful.push(result.value);
		} else {
			failed.push({
				originalUrl: urls[index],
				error: result.reason?.message || String(result.reason)
			});
		}
	});

	return { successful, failed };
}

/**
 * Rewrite image URLs in markdown content.
 * Replaces original URLs with new Nhost Storage URLs based on upload results.
 */
export function rewriteImageUrls(
	markdown: string,
	uploadResults: ImageUploadResult[]
): string {
	let updated = markdown;

	// Build a map for O(1) lookups
	const urlMap = new Map(uploadResults.map((r) => [r.originalUrl, r.newUrl]));

	// Replace each original URL with its new URL
	for (const [originalUrl, newUrl] of urlMap) {
		// Escape special regex characters in the URL
		const escapedUrl = originalUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
		const regex = new RegExp(escapedUrl, 'g');
		updated = updated.replace(regex, newUrl);
	}

	return updated;
}

export default {
	uploadImage,
	uploadImages,
	rewriteImageUrls
};
