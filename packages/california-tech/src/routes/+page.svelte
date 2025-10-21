<!-- packages/california-tech/src/routes/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { fly } from 'svelte/transition';

	import IndexPosts from '$lib/components/index_posts.svelte';

	let { data } = $props();

	// Initialize state from URL params
	let query = $state(data.query || '');
	let activeTag = $state(data.tag || '');

	// Sync URL params to state when they change (external navigation)
	$effect(() => {
		if (!browser) return;
		
		const urlQuery = $page.url.searchParams.get('q') || '';
		const urlTag = $page.url.searchParams.get('tag') || '';
		
		// Only update if URL changed (avoid infinite loop)
		if (urlQuery !== query) {
			query = urlQuery;
		}
		if (urlTag !== activeTag) {
			activeTag = urlTag;
		}
	});

	// Client-side filtering (with JS)
	const displayedPosts = $derived(
		browser ? data.allPosts.filter((post) => {
			const byQuery = query
				? (post.title?.toLowerCase() || '').includes(query.toLowerCase()) ||
					(post.summary?.toLowerCase() || '').includes(query.toLowerCase()) ||
					(post.content?.toLowerCase() || '').includes(query.toLowerCase())
				: true;

			const byTag = activeTag
				? post.tags?.some((tag) => typeof tag === 'string' && tag === activeTag)
				: true;

			return byQuery && byTag;
		}) : data.posts // Server-filtered posts (no JS)
	);

	// Sync state changes to URL (when user interacts with filters)
	// Skip initial mount to avoid overwriting URL params
	let isInitialMount = true;
	$effect(() => {
		if (!browser) return;
		
		// Skip the first run (initial mount)
		if (isInitialMount) {
			isInitialMount = false;
			return;
		}

		const url = new URL($page.url);
		const params = url.searchParams;

		const currentQuery = params.get('q') || '';
		const currentTag = params.get('tag') || '';

		// Only update URL if our state is different
		if (query !== currentQuery || activeTag !== currentTag) {
			if (query) {
				params.set('q', query);
			} else {
				params.delete('q');
			}

			if (activeTag) {
				params.set('tag', activeTag);
			} else {
				params.delete('tag');
			}

			goto(`?${params.toString()}`, { replaceState: true, keepFocus: true, noScroll: true });
		}
	});
</script>

<!-- Single-column centered layout -->
<div
	itemscope
	itemtype="https://schema.org/Blog"
	itemprop="blog"
	class="flex justify-center items-start max-w-[55rem] mx-auto px-4"
>
	<div
		in:fly|global={{ y: 100, duration: 300, delay: 300 }}
		out:fly|global={{ y: -100, duration: 300 }}
		class="h-feed min-h-[50vh] w-full"
	>
		<IndexPosts posts={displayedPosts} />
	</div>
</div>