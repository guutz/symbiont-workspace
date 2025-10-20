<!-- packages/california-tech/src/routes/+page.svelte -->
<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { browser } from '$app/environment';
	import { fly } from 'svelte/transition';

	import FilterBar from '$lib/components/header/FilterBar.svelte';
	import IndexPosts from '$lib/components/index_posts.svelte';

	let { data } = $props();

	// State is now owned by the page component.
	let query = $state(data.query || '');
	let activeTag = $state(data.tag || '');

	// Show/hide tags sidebar
	let tagsShowDesktop = $state(true);

	// Listen for tags toggle event from navbar (JS only)
	$effect(() => {
		if (!browser) return;
		
		const handleToggleTags = () => {
			tagsShowDesktop = !tagsShowDesktop;
		};
		
		window.addEventListener('toggleTags', handleToggleTags);
		
		return () => {
			window.removeEventListener('toggleTags', handleToggleTags);
		};
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
				? post.tags?.some((tag) => typeof tag === 'string' && tag === activeTag) // Case-sensitive
				: true;

			return byQuery && byTag;
		}) : data.posts // Server-filtered posts (no JS)
	);

	// Sync state changes to URL (JS only)
	$effect(() => {
		if (!browser) return;

		const url = new URL($page.url);
		const params = url.searchParams;

		const currentQuery = params.get('q') || '';
		const currentTag = params.get('tag') || '';

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

<!-- Desktop View: Two-column layout -->
<div
	itemscope
	itemtype="https://schema.org/Blog"
	itemprop="blog"
	class="flex flex-col md:flex-row justify-center items-start max-w-[100rem] mx-auto px-4 gap-4"
>
	<!-- Center Column: Posts (flex to take available space) -->
	<div
		in:fly|global={{ y: 100, duration: 300, delay: 300 }}
		out:fly|global={{ y: -100, duration: 300 }}
		class="h-feed min-h-[50vh] w-full md:flex-1 md:max-w-[55rem]"
	>
		<IndexPosts posts={displayedPosts} />
	</div>

	<!-- Right Column: Filter Bar (Tags) - fixed width on desktop -->
	{#if tagsShowDesktop}
		<div
			in:fly|global={{ x: 100, y: -100, duration: 300, delay: 300 }}
			out:fly|global={{ x: 100, y: 100, duration: 300 }}
			class="w-full md:w-[20rem] lg:w-[22rem] flex-shrink-0"
		>
			<FilterBar
				bind:query
				bind:activeTag
				tags={data.allTags}
				class="my-4 rounded-2xl p-4 flex flex-col sticky top-[5rem] max-h-[calc(100vh-6rem)] overflow-hidden"
			/>
		</div>
	{/if}
</div>