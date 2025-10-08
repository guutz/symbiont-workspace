import type { PageObjectResponse } from '@notionhq/client';
import type { HydratedDatabaseConfig } from '../types.js';
import { getTitle, getShortPostID, getTags, getPublishDate, defaultSlugRule } from '../utils/notion-helpers.js';
import { createSlug, generateUniqueSlugSync } from '../utils/slug-helpers.js';
import { gqlAdminClient, UPSERT_POST_MUTATION, CHECK_SLUG_QUERY, type SlugCheckResponse } from './graphql.js';
import { pageToMarkdown, syncSlugToNotion } from './notion.js';

/**
 * Process a page in batch mode (with pre-fetched data)
 */
export async function processPageBatch(
	page: PageObjectResponse,
	config: HydratedDatabaseConfig,
	existingPostsByPageId: Map<string, { id: string; slug: string }>,
	usedSlugs: Set<string>
): Promise<void> {
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
				console.log(`[symbiont] Notion slug '${notionSlug}' conflicts, using '${uniqueSlug}' for page '${page.id}'`);
				slug = uniqueSlug;
			} else {
				usedSlugs.add(notionSlug);
				console.log(`[symbiont] Updating slug from '${existingPost.slug}' to '${notionSlug}' per Notion change`);
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
	await upsertPost(page, config, title, short_post_ID, slug, mdString);
	console.log(`[symbiont] ${existingPost ? 'Updated' : 'Created'} post '${slug}' for page '${page.id}'`);
}

/**
 * Process a page from webhook (queries as needed)
 */
export async function processPageWebhook(
	page: PageObjectResponse,
	config: HydratedDatabaseConfig,
	existingPost: { id: string; slug: string } | null
): Promise<void> {
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
				source_id: config.short_db_ID,
				slug: notionSlug
			});
			
			if (conflictCheck.posts.length > 0) {
				// Conflict - generate unique variant
				const uniqueSlug = await resolveSlugConflict(page, config, notionSlug);
				console.log(`[symbiont] Notion slug '${notionSlug}' conflicts, using '${uniqueSlug}' for page '${page.id}'`);
				slug = uniqueSlug;
			} else {
				console.log(`[symbiont] Updating slug from '${existingPost.slug}' to '${notionSlug}' per Notion change`);
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
	await upsertPost(page, config, title, short_post_ID, slug, mdString);
	console.log(`[symbiont] ${existingPost ? 'Updated' : 'Created'} post '${slug}' for page '${page.id}'`);
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
	const slugRule = config.slugRule || defaultSlugRule;
	const customSlug = slugRule(page);

	if (customSlug && !usedSlugs.has(customSlug)) {
		usedSlugs.add(customSlug);
		console.log(`[symbiont] Using custom slug '${customSlug}'`);
		return customSlug;
	}

	// Generate slug from title
	const baseSlug = customSlug || createSlug(title);

	// Try base slug first
	if (!usedSlugs.has(baseSlug)) {
		usedSlugs.add(baseSlug);
		console.log(`[symbiont] Generated slug '${baseSlug}'`);
		return baseSlug;
	}

	// Conflict - try with short ID if available
	if (shortId) {
		const slugWithId = `${baseSlug}-${shortId.toLowerCase()}`;
		if (!usedSlugs.has(slugWithId)) {
			usedSlugs.add(slugWithId);
			console.log(`[symbiont] Slug '${baseSlug}' taken, using '${slugWithId}'`);
			return slugWithId;
		}
	}

	// Still conflict - use numbered suffix
	const finalSlug = generateUniqueSlugSync(baseSlug, usedSlugs, page.id);
	usedSlugs.add(finalSlug);
	console.log(`[symbiont] Generated unique slug '${finalSlug}'${customSlug ? ` (custom '${customSlug}' was taken)` : ''}`);
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
	const slugRule = config.slugRule || defaultSlugRule;
	const customSlug = slugRule(page);

	// Generate base slug from title
	const baseSlug = customSlug || createSlug(title);

	// Try base slug first
	const baseCheck = await gqlAdminClient.request<SlugCheckResponse>(CHECK_SLUG_QUERY, {
		source_id: config.short_db_ID,
		slug: baseSlug
	});

	if (baseCheck.posts.length === 0) {
		console.log(`[symbiont] Generated slug '${baseSlug}'`);
		return baseSlug;
	}

	// Still conflict - resolve with numbered suffix
	console.log(`[symbiont] Slug '${baseSlug}' conflicts, generating unique variant...`);
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
			source_id: config.short_db_ID,
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
	mdString: string
): Promise<void> {
	const postData = {
		source_id: config.short_db_ID,
		notion_page_id: page.id,
		notion_short_id: short_post_ID,
		title,
		slug,
		tags: getTags(page),
		updated_at: page.last_edited_time,
		publish_at: getPublishDate(page, config),
		content: mdString
	};

	await gqlAdminClient.request(UPSERT_POST_MUTATION, { post: postData });
}
