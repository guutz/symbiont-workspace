/**
 * Utility to convert Symbiont CMS posts to QWER post format
 */
import type { WebsitePage } from 'symbiont-cms';
import type { Post } from '$lib/types/post';
import { renderSummaryToHtml } from 'symbiont-cms/server';

const VALID_COVER_STYLES = new Set(['TOP', 'RIGHT', 'BOT', 'LEFT', 'IN', 'NONE']);

function getMetadata(post: WebsitePage): Record<string, unknown> {
	const metadata = post.meta;
	return metadata && typeof metadata === 'object' ? metadata as Record<string, unknown> : {};
}

function getWebLayoutFormat(metadata: Record<string, unknown>): Post.PreviewLayoutFormat | null {
	const value = metadata.webLayoutFormat;
	if (typeof value !== 'string') {
		return null;
	}

	const normalized = value.trim().toLowerCase();
	if (normalized === 'compact' || normalized === 'standard' || normalized === 'feature') {
		return normalized as Post.PreviewLayoutFormat;
	}

	return null;
}

function getCoverStyle(metadata: Record<string, unknown>): Post.CoverStyle {
	const coverStyle = typeof metadata.coverStyle === 'string' ? metadata.coverStyle.toUpperCase() : null;
	if (coverStyle && VALID_COVER_STYLES.has(coverStyle)) {
		return coverStyle as Post.CoverStyle;
	}

	const webLayoutFormat = getWebLayoutFormat(metadata);
	if (webLayoutFormat === 'compact' || webLayoutFormat === 'standard') {
		return 'NONE' as Post.CoverStyle;
	}

	return 'TOP' as Post.CoverStyle;
}

function getShowPreviewSummary(metadata: Record<string, unknown>, webLayoutFormat: Post.PreviewLayoutFormat | null): boolean {
	if (typeof metadata.showPreviewSummary === 'boolean') {
		return metadata.showPreviewSummary;
	}

	if (webLayoutFormat === 'compact') {
		return false;
	}

	return true;
}

function toTechPublicSlug(post: WebsitePage): string {
	const rawSlug = String(post.slug ?? '').trim();
	const normalizedSlug = rawSlug.startsWith('/') ? rawSlug : `/${rawSlug}`;

	if (post.datasource_alias !== 'tech-archives') {
		return normalizedSlug;
	}

	if (normalizedSlug === '/issues' || normalizedSlug.startsWith('/issues/')) {
		return normalizedSlug;
	}

	const archiveSlug = normalizedSlug.startsWith('/') ? normalizedSlug.slice(1) : normalizedSlug;
	return `/issues/${archiveSlug}`;
}

export function symbiontToTechArticle(
	post: WebsitePage,
	html?: string,
	toc?: any[]
): Post.Post {
	const metadata = getMetadata(post);
	const webLayoutFormat = getWebLayoutFormat(metadata);
	const cover = typeof post.cover === 'string' && post.cover
		? post.cover
		: typeof metadata.cover === 'string'
			? metadata.cover
			: undefined;
	const coverCaption = typeof metadata.coverCaption === 'string'
		? metadata.coverCaption
		: undefined;
	const coverInPost = typeof metadata.coverInPost === 'boolean'
		? metadata.coverInPost
		: true;
	const layoutWeight = typeof metadata.layoutWeight === 'number' && Number.isFinite(metadata.layoutWeight)
		? metadata.layoutWeight
		: undefined;
	const showPreviewSummary = getShowPreviewSummary(metadata, webLayoutFormat);

	return {
		// Direct pass-through fields
		// @ts-ignore -- slug will always be present at this point
		slug: toTechPublicSlug(post),
		title: post.title ?? 'Untitled',
		content: post.content ?? '',
		summary: post.summary ?? '',
		description: post.description ?? '',
		cover,
		tags: Array.isArray(post.tags) ? post.tags.filter(tag => !['web submission', 'Web Only'].includes(tag)) : [],
		authors: Array.isArray(post.authors) ? post.authors : [],
		
		// Date field mapping
		published: post.publish_at ?? new Date().toISOString(),
		updated: post.updated_at ?? post.publish_at ?? new Date().toISOString(),
		created: post.publish_at ?? new Date().toISOString(),
		
		// Rendered content
		html: html ?? '',
		toc: toc as any,
		summary_html: post.summary ? renderSummaryToHtml(post.summary) : post.content ? renderSummaryToHtml(post.content).substring(0, 200) : '',
		
		// QWER-specific UI fields (defaults)
		coverStyle: getCoverStyle(metadata),
		showPreviewSummary,
		previewLayout: webLayoutFormat ?? undefined,
		layoutWeight,
		coverInPost,
		coverCaption,
		options: [],
		series_tag: undefined,
		series_title: undefined,
		prev: undefined,
		next: undefined,
	};
}
