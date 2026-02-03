/**
 * Utility to convert Symbiont CMS posts to QWER post format
 */
import type { WebsitePage } from 'symbiont-cms';
import type { Post } from '$lib/types/post';

export function symbiontToQwerPost(post: WebsitePage, html?: string, toc?: any[]): Post.Post {
	return {
		// Direct pass-through fields
		// @ts-ignore -- slug will always be present at this point
		slug: post.slug, 
		title: post.title ?? 'Untitled',
		content: post.content ?? '',
		summary: post.summary ?? '',
		summary_html: post.summary_html ?? '',
		description: post.description ?? '',
		language: post.language ?? 'en',
		cover: post.cover,
		tags: Array.isArray(post.tags) ? post.tags : [],
		authors: Array.isArray(post.authors) ? post.authors : [],
		
		// Date field mapping
		published: post.publish_at ?? new Date().toISOString(),
		updated: post.updated_at ?? post.publish_at ?? new Date().toISOString(),
		created: post.publish_at ?? new Date().toISOString(),
		
		// Rendered content
		html: html ?? '',
		toc: toc as any,
		
		// QWER-specific UI fields (defaults)
		coverStyle: 'NONE' as Post.CoverStyle,
		coverInPost: true,
		coverCaption: undefined,
		options: [],
		series_tag: undefined,
		series_title: undefined,
		prev: undefined,
		next: undefined,
	};
}
