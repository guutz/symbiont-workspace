/**
 * Utility to convert Symbiont CMS posts to QWER post format
 */
import type { WebsitePage } from 'symbiont-cms';
import type { Post } from '$lib/types/post';
import { renderSummaryToHtml } from 'symbiont-cms/server';

export function symbiontToQwerPost(post: WebsitePage, html?: string, toc?: any[]): Post.Post {
	return {
		// Direct pass-through fields
		// @ts-ignore -- slug will always be present at this point
		slug: post.slug, 
		title: post.title ?? 'Untitled',
		content: post.content ?? '',
		summary: post.summary ?? '',
		description: post.description ?? '',
		language: post.language ?? 'en',
		cover: post.meta?.cover ?? undefined,
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
		coverStyle: 'TOP' as Post.CoverStyle,
		coverInPost: true,
		coverCaption: undefined,
		options: [],
		series_tag: undefined,
		series_title: undefined,
		prev: undefined,
		next: undefined,
	};
}
