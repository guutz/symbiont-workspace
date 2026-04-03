import type { Hook } from './types.js';
import { createSlug } from '../server/utils/slug.js';
import { uploadImageToSupabase, needsUploadToSupabase } from '../server/bucket/image-upload.js';
import { convertMarkdownToNotionBlocks } from '../server/notion-md/markdown-to-blocks.js';
import { diffBlocks } from '../server/notion/blocks-diff.js';
import { getPropertyNamedValue, getPropertyPlainText } from '../server/notion/property-utils.js';

/**
 * Default hooks implementing Symbiont's opinionated behavior.
 * Aligned with design memo (2026-02-21-hook-events-design-memo.md).
 * 
 * All hooks use default priority (50) unless specified.
 */

// ── Page Lifecycle ─────────────────────────────────────────────────

export const defaultPageBeforeHook: Hook<void> = {
	name: 'symbiont:page:before',
	event: 'page:before',
	fn: async (ctx) => {
		// No-op lifecycle hook
		return null;
	}
};

export const defaultPageShouldSyncHook: Hook<boolean> = {
	name: 'symbiont:page:should-sync',
	event: 'page:should-sync',
	fn: async (ctx) => {
		// By default, all pages should sync
		return true;
	}
};

export const defaultPageAfterHook: Hook<void> = {
	name: 'symbiont:page:after',
	event: 'page:after',
	fn: async (ctx) => {
		// No-op lifecycle hook
		return null;
	}
};

// ── Publishing ─────────────────────────────────────────────────────

/**
 * Cache for Notion database schema lookups (per sync run).
 * Key: dataSourceId, Value: status property definition
 */
const databaseSchemaCache = new Map<string, any>();

export const defaultPublishCheckHook: Hook<boolean> = {
	name: 'symbiont:publish:check',
	event: 'publish:check',
	fn: async (ctx) => {
		const notionClient = ctx.services.notionClient;
		if (!notionClient) {
			// No Notion client available - abstain and let custom hooks vote.
			return null;
		}

		const dataSourceId = ctx.config.dataSourceId;
		
		// Check cache first
		if (!databaseSchemaCache.has(dataSourceId)) {
			try {
				// Fetch database schema
				const dbSchema = await notionClient.getDatabaseSchema(dataSourceId);
				databaseSchemaCache.set(dataSourceId, dbSchema);
			} catch (error) {
				ctx.logger.warn({
					event: 'publish_check_schema_fetch_failed',
					dataSourceId,
					error: error instanceof Error ? error.message : String(error)
				});
				// If schema can't be fetched, abstain and let custom hooks vote.
				return null;
			}
		}

		const dbSchema = databaseSchemaCache.get(dataSourceId);
		
		// Find Status property
		const statusProp = Object.entries(dbSchema?.properties || {}).find(
			([name, prop]: [string, any]) => prop.type === 'status'
		);

		if (!statusProp) {
			// No status property - abstain and let custom hooks vote.
			return null;
		}

		const [statusPropName, statusPropDef] = statusProp as [string, any];
		
		// Find the 'Complete' group
		const completeGroup = statusPropDef.status?.groups?.find(
			(group: any) => group.name === 'Complete'
		);

		if (!completeGroup) {
			// No Complete group - abstain and let custom hooks vote.
			return null;
		}

		// Check if page's status option is in the Complete group
		const pageStatusProp = ctx.page.properties[statusPropName];
		if (!pageStatusProp || !('status' in pageStatusProp)) {
			return false;
		}

		const pageStatusId = (pageStatusProp as any).status?.id;
		if (!pageStatusId) {
			return false;
		}

		const isComplete = completeGroup.option_ids?.includes(pageStatusId);
		return isComplete || false;
	}
};

export const defaultPublishDateHook: Hook<string | Date> = {
	name: 'symbiont:publish:date',
	event: 'publish:date',
	fn: async (ctx) => {
		// Use last edited time as publish date
		return ctx.page.last_edited_time;
	}
};

// ── Slug Pipeline ──────────────────────────────────────────────────

export const defaultSlugExtractHook: Hook<string> = {
	name: 'symbiont:slug:extract',
	event: 'slug:extract',
	fn: async (ctx) => {
		const slugProperty = ctx.config.slugProperty;
		if (!slugProperty) {
			return null;
		}

		const slugProp = ctx.page.properties[slugProperty];
		return getPropertyNamedValue(slugProp);
	}
};

export const defaultSlugGenerateHook: Hook<string> = {
	name: 'symbiont:slug:generate',
	event: 'slug:generate',
	fn: async (ctx) => {
		// Check if slug already extracted - defer to slug:extract
		if (ctx.output.slug) {
			return null;
		}

		// Find the title-type property regardless of its name (databases may call it
		// 'Name', 'Article Title', etc. — only one property per page has type 'title').
		const titleProp = Object.values(ctx.page.properties).find(
			(p: any) => p.type === 'title'
		) as any;
		const pageTitle = titleProp?.title?.map((t: any) => t.plain_text).join('') || null;
		const title = pageTitle || ctx.output.title;
		if (!title) return null;
		return createSlug(title);
	}
};

export const defaultSlugConflictHook: Hook<string> = {
	name: 'symbiont:slug:conflict',
	event: 'slug:conflict',
	fn: async (ctx) => {
		const supabase = ctx.services.supabase;
		if (!supabase) {
			// No database access - just return input unchanged
			return ctx.input as string;
		}

		const candidateSlug = ctx.input as string;
		const pageId = ctx.page.id;
		const dataSourceId = ctx.config.dataSourceId;
		const strategy = ctx.config.onSlugConflict || 'auto-rename';

		// Sync-scoped slug map: loaded once per sync, then mutated in-memory.
		// Key: slug string → Value: page_id that owns it.
		// This collapses O(N) per-page DB roundtrips down to a single query.
		const cacheKey = `slugMap:${dataSourceId}`;
		if (!ctx.syncStore[cacheKey]) {
			const { data: allPages } = await supabase
				.from('pages')
				.select('page_id, slug')
				.eq('datasource_id', dataSourceId);

			const map = new Map<string, string>(
				(allPages ?? [])
					.filter((p: any) => p.slug)
					.map((p: any) => [p.slug as string, p.page_id as string])
			);
			ctx.syncStore[cacheKey] = map;

			ctx.logger.debug({
				event: 'slug_map_loaded',
				dataSourceId,
				existingSlugs: map.size
			});
		}

		const slugMap = ctx.syncStore[cacheKey] as Map<string, string>;

		// Resolve the slug using only in-memory lookups from here on.
		const existingPageId = slugMap.get(candidateSlug);

		// No conflict, or conflict is with the same page
		if (!existingPageId || existingPageId === pageId) {
			slugMap.set(candidateSlug, pageId);
			return candidateSlug;
		}

		// Handle conflict based on strategy
		switch (strategy) {
			case 'error':
				throw new Error(`Slug conflict: "${candidateSlug}" already exists`);

			case 'use-page-id': {
				const resolved = `${candidateSlug}-${pageId.slice(0, 8)}`;
				slugMap.set(resolved, pageId);
				return resolved;
			}

			case 'auto-rename':
			default: {
				// Try -2, -3, etc. up to 100 attempts
				for (let i = 2; i <= 100; i++) {
					const numberedSlug = `${candidateSlug}-${i}`;
					const occupant = slugMap.get(numberedSlug);
					if (!occupant || occupant === pageId) {
						ctx.logger.warn({
							event: 'slug_conflict_auto_renamed',
							originalSlug: candidateSlug,
							finalSlug: numberedSlug
						});
						slugMap.set(numberedSlug, pageId);
						return numberedSlug;
					}
				}

				// Fallback: use random suffix
				const randomSlug = `${candidateSlug}-${Math.random().toString(36).substring(2, 8)}`;
				ctx.logger.warn({
					event: 'slug_conflict_random_fallback',
					originalSlug: candidateSlug,
					finalSlug: randomSlug
				});
				slugMap.set(randomSlug, pageId);
				return randomSlug;
			}
		}
	}
};

export const defaultSlugSyncHook: Hook<void> = {
	name: 'symbiont:slug:sync',
	event: 'slug:sync',
	fn: async (ctx) => {
		const slugProperty = ctx.config.slugProperty;
		const notionClient = ctx.services.notionClient;
		
		if (!slugProperty || !notionClient) {
			return null;
		}

		const finalSlug = ctx.output.slug;
		if (!finalSlug) {
			return null;
		}

		// Don't write slug back to Notion for unpublished pages (no publish_at yet)
		if (!ctx.output.publish_at) {
			return null;
		}

		// Skip the Notion API write if the slug already matches what's on the page.
		// The page object was fetched at sync time and already contains the current
		// property values, so we can compare in-memory without an extra API call.
		const existingSlugProp = ctx.page.properties[slugProperty];
		const existingSlug = getPropertyNamedValue(existingSlugProp);

		if (existingSlug === finalSlug) {
			ctx.logger.debug({
				event: 'slug_sync_skipped_no_change',
				pageId: ctx.page.id,
				slug: finalSlug
			});
			return null;
		}

		// Write slug back to Notion
		try {
			await notionClient.updateProperty(ctx.page.id, slugProperty, finalSlug);
			
			ctx.logger.debug({
				event: 'slug_synced_to_notion',
				pageId: ctx.page.id,
				slug: finalSlug
			});
		} catch (error) {
			ctx.logger.warn({
				event: 'slug_sync_failed',
				pageId: ctx.page.id,
				error: error instanceof Error ? error.message : String(error)
			});
		}

		return null;
	}
};

// ── Metadata Extraction ────────────────────────────────────────────

export const defaultTitleExtractHook: Hook<string> = {
	name: 'symbiont:metadata:title',
	event: 'metadata:title',
	fn: async (ctx) => {
		const titleProp = ctx.page.properties.Title || ctx.page.properties.Name;
		const title = getPropertyPlainText(titleProp);
		return title || 'Untitled';
	}
};

export const defaultTagsExtractHook: Hook<string[]> = {
	name: 'symbiont:metadata:tags',
	event: 'metadata:tags',
	fn: async (ctx) => {
		const tagsProperty = ctx.config.tagsProperty;
		if (!tagsProperty) {
			return [];
		}
		
		const tagsProp = ctx.page.properties[tagsProperty];
		if (tagsProp && 'multi_select' in tagsProp) {
			return (tagsProp as any).multi_select?.map((tag: any) => tag.name) || [];
		}
		
		return [];
	}
};

export const defaultAuthorsExtractHook: Hook<string[]> = {
	name: 'symbiont:metadata:authors',
	event: 'metadata:authors',
	fn: async (ctx) => {
		const authorsProperty = ctx.config.authorsProperty;
		if (!authorsProperty) {
			return [];
		}
		
		const authorsProp = ctx.page.properties[authorsProperty];
		
		// Handle people property
		if (authorsProp && 'people' in authorsProp) {
			return (authorsProp as any).people?.map((person: any) => person.name || person.id) || [];
		}
		
		// Handle multi_select property
		if (authorsProp && 'multi_select' in authorsProp) {
			return (authorsProp as any).multi_select?.map((tag: any) => tag.name) || [];
		}
		
		return [];
	}
};

export const defaultSummaryExtractHook: Hook<string> = {
	name: 'symbiont:metadata:summary',
	event: 'metadata:summary',
	fn: async (ctx) => {
		const summaryProperty = ctx.config.summaryProperty;
		if (!summaryProperty) {
			return null;
		}
		
		const summaryProp = ctx.page.properties[summaryProperty];
		return getPropertyPlainText(summaryProp);
	}
};

export const defaultCustomMetadataHook: Hook<Record<string, unknown>> = {
	name: 'symbiont:metadata:custom',
	event: 'metadata:custom',
	fn: async (ctx) => {
		// Return empty object by default (other hooks can add fields)
		return {};
	}
};

// ── Content Pipeline ───────────────────────────────────────────────

export const defaultContentPreprocessHook: Hook<string> = {
	name: 'symbiont:content:preprocess',
	event: 'content:preprocess',
	fn: async (ctx) => {
		const notionClient = ctx.services.notionClient;
		if (!notionClient) {
			ctx.logger.warn({
				event: 'content_preprocess_no_notion_client',
				message: 'NotionClient not available in services'
			});
			return '';
		}

		try {
			return await notionClient.pageToMarkdown(ctx.page.id);
		} catch (error) {
			ctx.logger.error({
				event: 'content_preprocess_failed',
				pageId: ctx.page.id,
				error: error instanceof Error ? error.message : String(error)
			});
			return '';
		}
	}
};

export const defaultContentTextHook: Hook<string> = {
	name: 'symbiont:content:text',
	event: 'content:text',
	fn: async (ctx) => {
		// Pass-through by default — raw markdown string from content:preprocess
		return ctx.input as string;
	}
};

export const defaultContentMediaHook: Hook<string> = {
	name: 'symbiont:content:media',
	event: 'content:media',
	fn: async (ctx) => {
		const content = ctx.input as string;
		const supabase = ctx.services.supabase;
		
		if (!supabase || !content) {
			return content;
		}

		// Extract and upload inline images
		const imageUrlRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
		let processedContent = content;
		const matches = Array.from(content.matchAll(imageUrlRegex));

		for (const match of matches) {
			const fullMatch = match[0];
			const altText = match[1];
			const imageUrl = match[2];

			// Skip if already a Supabase URL
			if (!needsUploadToSupabase(imageUrl)) {
				continue;
			}

			try {
				const result = await uploadImageToSupabase(imageUrl, { supabase });

				const uploadedUrl = result.newUrl;
				if (uploadedUrl) {
					processedContent = processedContent.replace(fullMatch, `![${altText}](${uploadedUrl})`);
					ctx.logger.debug({
						event: 'inline_image_uploaded',
						pageId: ctx.page.id,
						originalUrl: imageUrl,
						uploadedUrl
					});
				}
			} catch (error) {
				ctx.logger.warn({
					event: 'inline_image_upload_failed',
					pageId: ctx.page.id,
					imageUrl,
					error: error instanceof Error ? error.message : String(error)
				});
			}
		}

		return processedContent;
	}
};

export const defaultContentPostprocessHook: Hook<string> = {
	name: 'symbiont:content:postprocess',
	event: 'content:postprocess',
	fn: async (ctx) => {
		const content = ctx.input as string;
		const supabase = ctx.services.supabase;

		if (!supabase || !content) {
			return content;
		}

		// Collect all sentinel occurrences and unique page IDs
		const sentinelMatches = Array.from(
			content.matchAll(/\[([^\]]+)\]\(notion:\/\/page\/([0-9a-f]{32})\)/gi),
		);
		if (sentinelMatches.length === 0) {
			return content;
		}

		const uniqueCleanIds = [...new Set(sentinelMatches.map(m => m[2].toLowerCase()))];

		// Re-format cleanId → UUID (insert dashes) for the Supabase query.
		// Our DB stores page_id in UUID format (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).
		const uuids = uniqueCleanIds.map(c =>
			`${c.slice(0, 8)}-${c.slice(8, 12)}-${c.slice(12, 16)}-${c.slice(16, 20)}-${c.slice(20)}`,
		);

		const { data: pages, error } = await supabase
			.from('pages')
			.select('page_id, slug')
			.in('page_id', uuids);

		if (error) {
			ctx.logger.warn({
				event: 'resolve_notion_page_links_failed',
				pageId: ctx.page.id,
				error: error.message,
			});
			return content;
		}

		// Build cleanId → slug lookup map
		const slugMap = new Map<string, string | null>();
		for (const page of pages ?? []) {
			if (page.page_id) {
				slugMap.set(page.page_id.replace(/-/g, ''), page.slug ?? null);
			}
		}

		// Single-pass replace — the regex captures cleanId in group 2, so we can
		// look up the slug from the map directly without a per-ID loop or per-ID
		// regex construction. String.replace() with a global regex always starts
		// from position 0 regardless of lastIndex.
		return content.replace(
			/\[([^\]]+)\]\(notion:\/\/page\/([0-9a-f]{32})\)/gi,
			(_, label: string, cleanId: string) => {
				const slug = slugMap.get(cleanId.toLowerCase()) ?? null;
				return slug ? `[${label}](/${slug})` : label;
			},
		);
	}
};

export const defaultContentSyncHook: Hook<void> = {
	name: 'symbiont:content:sync',
	event: 'content:sync',
	fn: async (ctx) => {
		const notionClient = ctx.services.notionClient;
		const finalContent = ctx.output.content;

		if (!notionClient || !finalContent) {
			return null;
		}

		const syncStrategy         = ctx.config.syncStrategy ?? 'patch';
		const forceFullThreshold   = ctx.config.forceFullReplaceThreshold ?? 0.6;

		try {
			// Convert markdown to Notion blocks
			const newBlocks = convertMarkdownToNotionBlocks(finalContent);

			// Fetch what's already in Notion (now fully paginated)
			const existingBlocks = await notionClient.getBlocks(ctx.page.id);

			// Compute diff
			const diff = diffBlocks(existingBlocks, newBlocks, forceFullThreshold);

			// Nothing changed — skip entirely
			if (
				diff.stats.updated  === 0 &&
				diff.stats.inserted === 0 &&
				diff.stats.deleted  === 0 &&
				diff.stats.replaced === 0
			) {
				ctx.logger.debug({
					event: 'content_sync_skipped_no_change',
					pageId: ctx.page.id,
					blockCount: newBlocks.length,
				});
				return null;
			}

			if (syncStrategy === 'replace' || diff.forceFullReplace) {
				// Full nuke-and-repave fallback
				ctx.logger.info({
					event: 'content_sync_full_replace',
					pageId: ctx.page.id,
					reason: syncStrategy === 'replace' ? 'config' : 'threshold',
					...diff.stats,
				});
				await notionClient.updatePageBlocks(ctx.page.id, newBlocks);
			} else {
				// Surgical patch
				ctx.logger.info({
					event: 'content_sync_patch',
					pageId: ctx.page.id,
					...diff.stats,
				});
				await notionClient.patchPageBlocks(ctx.page.id, diff);
			}

			ctx.logger.debug({
				event: 'content_synced_to_notion',
				pageId: ctx.page.id,
				blockCount: newBlocks.length,
			});
		} catch (error) {
			ctx.logger.warn({
				event: 'content_sync_failed',
				pageId: ctx.page.id,
				error: error instanceof Error ? error.message : String(error)
			});
		}

		return null;
	}
};

// ── Cover Pipeline ─────────────────────────────────────────────────

export const defaultCoverExtractHook: Hook<string> = {
	name: 'symbiont:cover:extract',
	event: 'cover:extract',
	fn: async (ctx) => {
		const coverProperty = ctx.config.coverProperty;
		
		// Try to extract from configured property first
		if (coverProperty) {
			const coverProp = ctx.page.properties[coverProperty];
			
			if (coverProp && 'files' in coverProp) {
				const files = (coverProp as any).files;
				if (files && files.length > 0) {
					const file = files[0];
					const url = file.file?.url || file.external?.url;
					if (url) {
						return url;
					}
				}
			}
		}

		// Fallback: scan content for first image
		const content = ctx.output.content;
		ctx.logger.debug({
			event: 'cover_extract_fallback',
			pageId: ctx.page.id,
			hasContent: !!content,
			contentLength: content?.length ?? 0
		});
		if (content) {
			const imageMatch = content.match(/!\[([^\]]*)\]\(([^)]+)\)/);
			ctx.logger.debug({
				event: 'cover_extract_content_scan',
				pageId: ctx.page.id,
				imageFound: !!imageMatch,
				imageUrl: imageMatch?.[2] ?? null
			});
			if (imageMatch) {
				return imageMatch[2]; // Return the URL
			}
		}

		return null;
	}
};

export const defaultCoverProcessHook: Hook<string> = {
	name: 'symbiont:cover:process',
	event: 'cover:process',
	fn: async (ctx) => {
		const coverUrl = ctx.input as string | null;
		const supabase = ctx.services.supabase;
		
		if (!coverUrl || !supabase) {
			return coverUrl;
		}

		// Skip if already a Supabase URL
		if (!needsUploadToSupabase(coverUrl)) {
			return coverUrl;
		}

		try {
			const result = await uploadImageToSupabase(coverUrl, { supabase });

			const uploadedUrl = result.newUrl;
			if (uploadedUrl) {
				ctx.logger.debug({
					event: 'cover_image_uploaded',
					pageId: ctx.page.id,
					originalUrl: coverUrl,
					uploadedUrl
				});
				return uploadedUrl;
			}
		} catch (error) {
			ctx.logger.warn({
				event: 'cover_upload_failed',
				pageId: ctx.page.id,
				coverUrl,
				error: error instanceof Error ? error.message : String(error)
			});
		}

		return coverUrl;
	}
};

export const defaultCoverSyncHook: Hook<void> = {
	name: 'symbiont:cover:sync',
	event: 'cover:sync',
	fn: async (ctx) => {
		const coverProperty = ctx.config.coverProperty;
		const notionClient = ctx.services.notionClient;

		if (!coverProperty || !notionClient) {
			return null;
		}

		const finalCover = ctx.output.cover;
		if (!finalCover) {
			return null;
		}

		// Skip the Notion API write if the cover already matches what's on the page.
		const existingCoverProp = ctx.page.properties[coverProperty];
		const existingCoverUrl = existingCoverProp && 'files' in existingCoverProp
			? ((existingCoverProp as any).files?.[0]?.file?.url
				?? (existingCoverProp as any).files?.[0]?.external?.url
				?? null)
			: null;

		if (existingCoverUrl === finalCover) {
			ctx.logger.debug({
				event: 'cover_sync_skipped_no_change',
				pageId: ctx.page.id,
				cover: finalCover
			});
			return null;
		}

		try {
			await notionClient.updateFileProperty(ctx.page.id, coverProperty, finalCover);
			ctx.logger.debug({
				event: 'cover_synced_to_notion',
				pageId: ctx.page.id,
				cover: finalCover
			});
		} catch (error) {
			ctx.logger.warn({
				event: 'cover_sync_failed',
				pageId: ctx.page.id,
				error: error instanceof Error ? error.message : String(error)
			});
		}

		return null;
	}
};

// ── Export All ─────────────────────────────────────────────────────

export const defaultHooks: Hook[] = [
	// Page lifecycle
	defaultPageBeforeHook,
	defaultPageShouldSyncHook,
	defaultPageAfterHook,

	// Publishing
	defaultPublishCheckHook,
	defaultPublishDateHook,

	// Slug pipeline
	defaultSlugExtractHook,
	defaultSlugGenerateHook,
	defaultSlugConflictHook,
	defaultSlugSyncHook,

	// Metadata extraction
	defaultTitleExtractHook,
	defaultTagsExtractHook,
	defaultAuthorsExtractHook,
	defaultSummaryExtractHook,
	defaultCustomMetadataHook,

	// Content pipeline
	defaultContentPreprocessHook,
	defaultContentTextHook,
	defaultContentMediaHook,
	defaultContentPostprocessHook,
	defaultContentSyncHook,

	// Cover pipeline
	defaultCoverExtractHook,
	defaultCoverProcessHook,
	defaultCoverSyncHook
];
