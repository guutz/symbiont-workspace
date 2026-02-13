<!-- packages/california-tech/src/routes/+page.svelte -->
<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { fly } from 'svelte/transition';
	import { onMount } from 'svelte';

	import IndexPosts from '$lib/components/index_posts.svelte';

	let { data } = $props();

	// State for progressive enhancement
	let allPreviews = $state<any[]>([]);
	let previewsLoaded = $state(false);
	let isLoadingPreviews = $state(false);

	// Always derive from URL (single source of truth)
	const query = $derived(page.url.searchParams.get('q') || '');
	const activeTag = $derived(page.url.searchParams.get('tag') || '');

	// Client-side filtered posts (uses previews if available, otherwise server data)
	const displayedPosts = $derived.by(() => {
		// Use client-side filtering only when filters are active AND previews loaded
		if (browser && previewsLoaded && allPreviews.length > 0 && (query || activeTag)) {
			let filtered = allPreviews;
			
			if (query) {
				filtered = filtered.filter((post) =>
					(post.title?.toLowerCase() || '').includes(query.toLowerCase()) ||
					(post.summary?.toLowerCase() || '').includes(query.toLowerCase())
				);
			}
			
			if (activeTag) {
				filtered = filtered.filter((post) => post.tags?.includes(activeTag));
			}
			
			return filtered.slice(0, 50); // Show up to 50 results
		}
		
		// Default: use server-rendered posts (always fresh on navigation)
		return data.posts ?? [];
	});

	// Load post previews in background after initial render
	onMount(async () => {
		if (!browser || isLoadingPreviews) return;
		
		try {
			isLoadingPreviews = true;
			const response = await fetch('/api/posts/previews');
			if (response.ok) {
				allPreviews = await response.json();
				previewsLoaded = true;
			}
		} catch (error) {
			console.error('Failed to load post previews:', error);
		} finally {
			isLoadingPreviews = false;
		}
	});

</script>

<div
	itemscope
	itemtype="https://schema.org/Blog"
	itemprop="blog"
	class="flex justify-center items-start max-w-[90rem] mx-auto px-4"
>
	{#if isLoadingPreviews && !previewsLoaded}
		<div class="fixed bottom-4 right-4 px-4 py-2 bg-black/80 text-white dark:bg-white/80 dark:text-black rounded-lg text-sm z-50">
			Loading enhanced search...
		</div>
	{/if}
	
	<div
		in:fly|global={{ y: 100, duration: 300, delay: 300 }}
		out:fly|global={{ y: -100, duration: 300 }}
		class="h-feed min-h-[50vh] w-full"
	>
		<IndexPosts posts={displayedPosts} />
	</div>
</div>