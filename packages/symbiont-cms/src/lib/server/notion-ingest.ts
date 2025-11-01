import type { PageObjectResponse } from '@notionhq/client';
import type { HydratedDatabaseConfig, FrontMatterLayout } from '../types.js';
import { getMeta, defaultSlugRule } from '../utils/notion-helpers.server.js';
import { createSlug } from '../utils/slug-helpers.js';
import { gqlAdminClient, UPSERT_POST_MUTATION, CHECK_SLUG_QUERY, type SlugCheckResponse, GET_EXISTING_POST_QUERY, type ExistingPostResponse } from './graphql.js';
import { pageToMarkdown, syncSlugToNotion } from './notion.js';
import { createLogger } from '../utils/logger.js';

export async function ingestNotionPage(
	page: PageObjectResponse,
	config: HydratedDatabaseConfig
): Promise<void> {
	const logger = createLogger({ 
		operation: 'processPage', 
		databaseId: config.dbNickname,
		pageId: page.id
	});

	const { tags, authors, title, coverImageURI, shortPostID, publishDate } = getMeta(page, config);
	const mdString = await pageToMarkdown(page.id);
	const layout_config: FrontMatterLayout = {
		targets: {
			web: {
				cover_image: coverImageURI || null
			}
		}
	}

	// Determine slug
	const slugRule = config.slugRule || defaultSlugRule;
	const notionSlug = slugRule(page);

	// Check if this post has already been ingested into the database (efficient single query)
	const existingPostResult = await gqlAdminClient.request<ExistingPostResponse>(GET_EXISTING_POST_QUERY, {
		source_id: config.dbNickname,
		notion_page_id: page.id
	});

	const existingPost = existingPostResult.posts.length > 0 ? existingPostResult.posts[0] : null;
	
	let slug: string;
	if (existingPost) {
		// Check if user changed the slug in Notion
		if (notionSlug && notionSlug !== existingPost.slug) {
			// User wants to override - validate it's unique
			const conflictCheck = await gqlAdminClient.request<SlugCheckResponse>(CHECK_SLUG_QUERY, {
				dbNickname: config.dbNickname,
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
		slug = await resolveNewSlug(page, config, title);
	}

	// Always sync slug back to Notion to keep them in sync
	await syncSlugToNotion(page, config.notionDatabaseId, slug);

	const postData = {
		title, 
		content: mdString,
		slug, 
		publish_at: publishDate,
		tags, 
		updated_at: page.last_edited_time,
		notion_short_id: shortPostID,
		layout_config, 
		authors
	}

	// Upsert post
	await gqlAdminClient.request(UPSERT_POST_MUTATION, { post: postData });
	logger.info({ 
		event: 'post_processed', 
		slug, 
		title 
	});
}

/**
 * Resolve slug for new post in webhook mode (queries for conflicts)
 */
async function resolveNewSlug(
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
		dbNickname: config.dbNickname,
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
			dbNickname: config.dbNickname,
			slug: numberedSlug
		});

		if (result.posts.length === 0) {
			return numberedSlug;
		}
	}

	// Fallback
	return `${baseSlug}-${page.id.slice(-8)}`;
}
