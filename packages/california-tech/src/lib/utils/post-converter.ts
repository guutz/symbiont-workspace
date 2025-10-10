/**
 * Utility to convert Symbiont CMS posts to QWER post format
 */
import type { Post as SymbiontPost } from 'symbiont-cms';
import type { Post } from '$lib/types/post';

export function symbiontToQwerPost(post: SymbiontPost, html?: string, toc?: any[]): Post.Post {
	return {
		// Direct pass-through fields
		slug: post.slug,
		title: post.title ?? 'Untitled',
		content: post.content ?? '',
		summary: post.summary ?? post.content?.substring(0, 200) ?? '',
		description: post.description ?? '',
		language: post.language ?? 'en',
		cover: post.cover,
		tags: Array.isArray(post.tags) ? post.tags : [],
		author: post.author ?? undefined,
		
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
