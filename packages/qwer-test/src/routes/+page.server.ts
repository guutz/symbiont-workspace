import { getPostsFromPrimarySource, requirePublicEnvVar, type Post as SymbiontPost } from 'symbiont-cms';
import type { Post } from '$lib/types/post';

export const load = async ({ fetch }: { fetch: typeof globalThis.fetch }) => {
	// Get GraphQL endpoint from environment
	const graphqlEndpoint = requirePublicEnvVar('PUBLIC_NHOST_GRAPHQL_URL');
	
	if (!graphqlEndpoint) {
		console.warn('[qwer-test] PUBLIC_NHOST_GRAPHQL_URL not set, returning empty posts');
		return {
			posts: []
		};
	}

	try {
		// Fetch posts using high-level helper that loads config automatically
		const postsFromDb = await getPostsFromPrimarySource(graphqlEndpoint, {
			fetch,
			limit: 100
		});

		// Transform Symbiont posts to QWER Post format
		// Most fields pass through directly thanks to type compatibility!
		const qwerPosts: Post.Post[] = postsFromDb.map((post: SymbiontPost) => ({
			// Direct pass-through fields
			slug: post.slug,
			title: post.title ?? 'Untitled',
			content: post.content ?? '',
			summary: post.summary ?? post.content?.substring(0, 200) ?? '',
			description: post.description ?? '',
			language: post.language ?? 'en',
			cover: post.cover,
			tags: Array.isArray(post.tags) ? post.tags : [],
			
			// Date field mapping
			published: post.publish_at ?? new Date().toISOString(),
			updated: post.updated_at ?? post.publish_at ?? new Date().toISOString(),
			created: post.publish_at ?? new Date().toISOString(),
			
			// QWER-specific UI fields (defaults)
			html: '', // Processed client-side if needed
			coverStyle: 'NONE' as Post.CoverStyle,
			coverInPost: true,
			coverCaption: undefined,
			options: [],
			series_tag: undefined,
			series_title: undefined,
			prev: undefined, // Calculated by postsShow store
			next: undefined, // Calculated by postsShow store
			toc: undefined   // Generated client-side if needed
		}));

		return {
			posts: qwerPosts
		};
	} catch (error) {
		console.error('[qwer-test] Error fetching posts from database:', error);
		return {
			posts: []
		};
	}
};
