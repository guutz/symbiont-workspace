import type { PageObjectResponse } from '@notionhq/client';
import type { HydratedDatabaseConfig } from '../types.js';
import { getTitle, getShortPostID, getTags, getPublishDate, defaultSlugRule } from '../utils/notion-helpers.js';
import { createSlug, generateUniqueSlugSync } from '../utils/slug-helpers.js';
import { gqlAdminClient, UPSERT_POST_MUTATION, CHECK_SLUG_QUERY, type SlugCheckResponse } from './graphql.js';
import { pageToMarkdown, syncSlugToNotion } from './notion.js';
import { createLogger } from '../utils/logger.js';

/**
 * Process a page in batch mode (with pre-fetched data)
 */
export async function processPageBatch(
	page: PageObjectResponse,
	config: HydratedDatabaseConfig,
	existingPostsByPageId: Map<string, { id: string; slug: string }>,
	usedSlugs: Set<string>
): Promise<void> {
	const logger = createLogger({ 
		operation: 'process_page_batch', 
		databaseId: config.short_db_ID,
		pageId: page.id
	});
	
	const title = getTitle(page);
	const short_post_ID = getShortPostID(page);
	const mdString = await pageToMarkdown(page.id);

	// Determine slug
	const existingPost = existingPostsByPageId.get(page.id);
	const slugRule = config.slugRule || defaultSlugRule;
	const notionSlug = slugRule(page);
	
	let slug: string;
	if (existingPost) {
		// Check if user changed the slug in Notion
		if (notionSlug && notionSlug !== existingPost.slug) {
			// User wants to override - validate it's unique
			if (usedSlugs.has(notionSlug)) {
				const uniqueSlug = generateUniqueSlugSync(notionSlug, usedSlugs, page.id);
				usedSlugs.add(uniqueSlug);
				logger.warn({ 
					event: 'slug_conflict_resolved', 
					requested_slug: notionSlug, 
					final_slug: uniqueSlug 
				});
				slug = uniqueSlug;
			} else {
				usedSlugs.add(notionSlug);
				logger.info({ 
					event: 'slug_updated', 
					old_slug: existingPost.slug, 
					new_slug: notionSlug 
				});
				slug = notionSlug;
			}
		} else {
			// No change in Notion, keep existing slug
			slug = existingPost.slug;
		}
	} else {
		// New post - generate slug
		slug = await resolveNewSlugBatch(page, config, title, short_post_ID, usedSlugs);
	}

	// Always sync slug back to Notion to keep them in sync
	await syncSlugToNotion(page, config.notionDatabaseId, slug);

	// Upsert post
	await upsertPost(page, config, title, short_post_ID, slug, author, features, mdString);
	logger.info({ 
		event: existingPost ? 'post_updated' : 'post_created', 
		slug, 
		title 
	});
}

/**
 * Process a page from webhook (queries as needed)
 */
export async function processPageWebhook(
	page: PageObjectResponse,
	config: HydratedDatabaseConfig,
	existingPost: { id: string; slug: string } | null
): Promise<void> {
	const logger = createLogger({ 
		operation: 'process_page_webhook', 
		databaseId: config.short_db_ID,
		pageId: page.id
	});
	
	const title = getTitle(page);
	const short_post_ID = getShortPostID(page);
	const mdString = await pageToMarkdown(page.id);

	// Determine slug
	const slugRule = config.slugRule || defaultSlugRule;
	const notionSlug = slugRule(page);
	
	let slug: string;
	if (existingPost) {
		// Check if user changed the slug in Notion
		if (notionSlug && notionSlug !== existingPost.slug) {
			// User wants to override - validate it's unique
			const conflictCheck = await gqlAdminClient.request<SlugCheckResponse>(CHECK_SLUG_QUERY, {
				short_db_ID: config.short_db_ID,
				slug: notionSlug
			});
			
			if (conflictCheck.posts.length > 0) {
				// Conflict - generate unique variant
				const uniqueSlug = await resolveSlugConflict(page, config, notionSlug);
				logger.warn({ 
					event: 'slug_conflict_resolved', 
					requested_slug: notionSlug, 
					final_slug: uniqueSlug 
				});
				slug = uniqueSlug;
			} else {
				logger.info({ 
					event: 'slug_updated', 
					old_slug: existingPost.slug, 
					new_slug: notionSlug 
				});
				slug = notionSlug;
			}
		} else {
			// No change in Notion, keep existing slug
			slug = existingPost.slug;
		}
	} else {
		// New post - generate slug
		slug = await resolveNewSlugWebhook(page, config, title);
	}

	// Always sync slug back to Notion to keep them in sync
	await syncSlugToNotion(page, config.notionDatabaseId, slug);

	// Upsert post
	await upsertPost(page, config, title, short_post_ID, slug, author, features, mdString);
	logger.info({ 
		event: existingPost ? 'post_updated' : 'post_created', 
		slug, 
		title 
	});
}

/**
 * Resolve slug for new post in batch mode (using pre-fetched data)
 */
async function resolveNewSlugBatch(
	page: PageObjectResponse,
	config: HydratedDatabaseConfig,
	title: string,
	shortId: string | null,
	usedSlugs: Set<string>
): Promise<string> {
	const logger = createLogger({ 
		operation: 'resolve_slug_batch',
		pageId: page.id 
	});
	
	const slugRule = config.slugRule || defaultSlugRule;
	const customSlug = slugRule(page);

	if (customSlug && !usedSlugs.has(customSlug)) {
		usedSlugs.add(customSlug);
		logger.debug({ event: 'using_custom_slug', slug: customSlug });
		return customSlug;
	}

	// Generate slug from title
	const baseSlug = customSlug || createSlug(title);

	// Try base slug first
	if (!usedSlugs.has(baseSlug)) {
		usedSlugs.add(baseSlug);
		logger.debug({ event: 'generated_slug', slug: baseSlug });
		return baseSlug;
	}

	// Conflict - try with short ID if available
	if (shortId) {
		const slugWithId = `${baseSlug}-${shortId.toLowerCase()}`;
		if (!usedSlugs.has(slugWithId)) {
			usedSlugs.add(slugWithId);
			logger.debug({ 
				event: 'slug_conflict_used_short_id', 
				base_slug: baseSlug, 
				final_slug: slugWithId 
			});
			return slugWithId;
		}
	}

	// Still conflict - use numbered suffix
	const finalSlug = generateUniqueSlugSync(baseSlug, usedSlugs, page.id);
	usedSlugs.add(finalSlug);
	logger.debug({ 
		event: 'generated_unique_slug', 
		base_slug: baseSlug,
		final_slug: finalSlug,
		custom_was_taken: !!customSlug
	});
	return finalSlug;
}

/**
 * Resolve slug for new post in webhook mode (queries for conflicts)
 */
async function resolveNewSlugWebhook(
	page: PageObjectResponse,
	config: HydratedDatabaseConfig,
	title: string
): Promise<string> {
	const logger = createLogger({ 
		operation: 'resolve_slug_webhook',
		pageId: page.id 
	});
	
	const slugRule = config.slugRule || defaultSlugRule;
	const customSlug = slugRule(page);

	// Generate base slug from title
	const baseSlug = customSlug || createSlug(title);

	// Try base slug first
	const baseCheck = await gqlAdminClient.request<SlugCheckResponse>(CHECK_SLUG_QUERY, {
		short_db_ID: config.short_db_ID,
		slug: baseSlug
	});

	if (baseCheck.posts.length === 0) {
		logger.debug({ event: 'generated_slug', slug: baseSlug });
		return baseSlug;
	}

	// Still conflict - resolve with numbered suffix
	logger.debug({ event: 'slug_conflict_detected', slug: baseSlug });
	return resolveSlugConflict(page, config, baseSlug);
}

/**
 * Resolve slug conflicts by trying numbered variations
 */
async function resolveSlugConflict(
	page: PageObjectResponse,
	config: HydratedDatabaseConfig,
	baseSlug: string
): Promise<string> {
	// Conflict - try numbered variations
	for (let i = 2; i <= 100; i++) {
		const numberedSlug = `${baseSlug}-${i}`;
		const result = await gqlAdminClient.request<SlugCheckResponse>(CHECK_SLUG_QUERY, {
			short_db_ID: config.short_db_ID,
			slug: numberedSlug
		});

		if (result.posts.length === 0) {
			return numberedSlug;
		}
	}

	// Fallback
	return `${baseSlug}-${page.id.slice(-8)}`;
}

/**
 * Upsert post data to database
 */
async function upsertPost(
	page: PageObjectResponse,
	config: HydratedDatabaseConfig,
	title: string,
	short_post_ID: string | null,
	slug: string,
	authors: string[],
	features: string[],
	mdString: string
): Promise<void> {
	const postData = {
		source_id: config.short_db_ID,
		notion_page_id: page.id,
		notion_short_id: short_post_ID,
		title,
		slug,
		tags: getTags(page),
		authors,
		features,
		updated_at: page.last_edited_time,
		publish_at: getPublishDate(page, config),
		content: mdString
	};

	await gqlAdminClient.request(UPSERT_POST_MUTATION, { post: postData });
}
