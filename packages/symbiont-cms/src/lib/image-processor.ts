/**
 * High-level image processor that orchestrates the complete pipeline:
 * 1. Extract image URLs from content
 * 2. Upload images to Nhost Storage
 * 3. Rewrite URLs in content
 */

import type { NhostClient } from '@nhost/nhost-js';
import { extractImageUrlsFromMarkdown, extractImageUrlsFromNotionPage } from './image-utils.js';
import { uploadImages, rewriteImageUrls } from './image-upload.js';
import type { ImageUploadResult } from './image-upload.js';

export interface ImageProcessorOptions {
	/** Nhost client instance */
	nhost: NhostClient;
	/** Target bucket name (default: 'uploads') */
	bucketId?: string;
	/** Optional path prefix within bucket (e.g., 'blog-images/') */
	pathPrefix?: string;
	/** Filter function to skip certain URLs (e.g., already hosted on your domain) */
	shouldUpload?: (url: string) => boolean;
}

export interface ProcessMarkdownResult {
	/** Updated markdown with rewritten image URLs */
	markdown: string;
	/** Successfully uploaded images */
	uploaded: ImageUploadResult[];
	/** Failed uploads */
	failed: Array<{ originalUrl: string; error: string }>;
}

/**
 * Process markdown content: extract images, upload them, rewrite URLs.
 */
export async function processMarkdownImages(
	markdown: string,
	options: ImageProcessorOptions
): Promise<ProcessMarkdownResult> {
	const { shouldUpload, ...uploadOptions } = options;

	// Extract image URLs
	let urls = extractImageUrlsFromMarkdown(markdown);

	// Filter URLs if needed
	if (shouldUpload) {
		urls = urls.filter(shouldUpload);
	}

	// If no images to upload, return as-is
	if (urls.length === 0) {
		return { markdown, uploaded: [], failed: [] };
	}

	// Upload images
	const { successful, failed } = await uploadImages(urls, uploadOptions);

	// Rewrite URLs in markdown
	const updatedMarkdown = rewriteImageUrls(markdown, successful);

	return {
		markdown: updatedMarkdown,
		uploaded: successful,
		failed
	};
}

/**
 * Process a Notion page object: extract images from properties/cover, upload them.
 * Returns a map of original URLs to new URLs (useful for updating database records).
 */
export async function processNotionPageImages(
	page: any,
	options: ImageProcessorOptions
): Promise<{
	urlMap: Map<string, string>;
	uploaded: ImageUploadResult[];
	failed: Array<{ originalUrl: string; error: string }>;
}> {
	const { shouldUpload, ...uploadOptions } = options;

	// Extract image URLs from Notion page
	let urls = extractImageUrlsFromNotionPage(page);

	// Filter URLs if needed
	if (shouldUpload) {
		urls = urls.filter(shouldUpload);
	}

	// If no images to upload, return empty results
	if (urls.length === 0) {
		return { urlMap: new Map(), uploaded: [], failed: [] };
	}

	// Upload images
	const { successful, failed } = await uploadImages(urls, uploadOptions);

	// Build URL mapping
	const urlMap = new Map(successful.map((r) => [r.originalUrl, r.newUrl]));

	return { urlMap, uploaded: successful, failed };
}

/**
 * Helper: Check if a URL is external (needs uploading).
 * Returns true if URL should be uploaded, false if it's already local.
 */
export function isExternalUrl(url: string, localDomains: string[] = []): boolean {
	try {
		const urlObj = new URL(url);

		// Check if it's a local domain
		for (const domain of localDomains) {
			if (urlObj.hostname === domain || urlObj.hostname.endsWith(`.${domain}`)) {
				return false;
			}
		}

		// It's external
		return true;
	} catch (e) {
		// Invalid URL - treat as external (will likely fail upload, but let it try)
		return true;
	}
}

export default {
	processMarkdownImages,
	processNotionPageImages,
	isExternalUrl
};
