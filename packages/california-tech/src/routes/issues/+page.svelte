<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { fly } from 'svelte/transition';
	import { onMount } from 'svelte';

	import IndexPosts from '$lib/components/index_posts.svelte';

	let { data } = $props();

	let allPreviews = $state<any[]>([]);
	let previewsLoaded = $state(false);
	let isLoadingPreviews = $state(false);

	const query = $derived(page.url.searchParams.get('q') || '');
	const activeTag = $derived(page.url.searchParams.get('tag') || '');

	const displayedPosts = $derived.by(() => {
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

			return filtered.slice(0, 50);
		}

		return data.posts ?? [];
	});

	onMount(async () => {
		if (!browser || isLoadingPreviews) return;

		try {
			isLoadingPreviews = true;
			const response = await fetch('/api/posts/previews?alias=tech-archives');
			if (response.ok) {
				allPreviews = await response.json();
				previewsLoaded = true;
			}
		} catch (error) {
			console.error('Failed to load issue previews:', error);
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
