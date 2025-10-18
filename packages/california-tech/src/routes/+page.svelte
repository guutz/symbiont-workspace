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

	// Show/hide states for mobile and desktop
	let tagsShowMobile = $state(false);
	let tagsShowDesktop = $state(true);

	// Client-side filtering
	const displayedPosts = $derived(
		data.allPosts.filter((post) => {
			const byQuery = query
				? (post.title?.toLowerCase() || '').includes(query.toLowerCase()) ||
					(post.summary?.toLowerCase() || '').includes(query.toLowerCase()) ||
					(post.content?.toLowerCase() || '').includes(query.toLowerCase())
				: true;

			const byTag = activeTag
				? post.tags?.some((tag) => typeof tag === 'string' && tag === activeTag)
				: true;

			return byQuery && byTag;
		})
	);

	// Sync state changes to URL
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

<!-- Mobile View: Show either tags or posts -->
{#if tagsShowMobile}
	<div
		in:fly|global={{ x: -100, y: -100, duration: 300, delay: 300 }}
		out:fly|global={{ x: -100, y: -100, duration: 300 }}
		class="mx-6 my-4 xl:hidden"
	>
		<FilterBar 
			bind:query 
			bind:activeTag 
			tags={data.allTags} 
			class="flex flex-col min-w-[12rem]" 
		/>
	</div>
{:else}
	<div
		in:fly|global={{ y: 100, duration: 300, delay: 300 }}
		out:fly|global={{ y: 100, duration: 300 }}
		itemscope
		itemtype="https://schema.org/Blog"
		itemprop="blog"
		class="flex flex-nowrap justify-center flex-col items-center xl:hidden"
	>
		<div class="h-feed min-h-[50vh] w-full">
			<IndexPosts posts={displayedPosts} />
		</div>
	</div>
{/if}

<!-- Desktop View: Two-column layout -->
<div
	itemscope
	itemtype="https://schema.org/Blog"
	itemprop="blog"
	class="flex-nowrap justify-center flex-col items-center hidden xl:(flex flex-row items-stretch)"
>
	<!-- Center Column: Posts -->
	<div
		in:fly|global={{ y: 100, duration: 300, delay: 300 }}
		out:fly|global={{ y: -100, duration: 300 }}
		class="h-feed min-h-[50vh] flex-1 w-full md:(rounded-2xl max-w-[50rem] mx-2)"
	>
		<IndexPosts posts={displayedPosts} />
	</div>

	<!-- Right Column: Filter Bar (Tags) -->
	<div
		in:fly|global={{ x: 100, y: -100, duration: 300, delay: 300 }}
		out:fly|global={{ x: 100, y: 100, duration: 300 }}
		class="min-w-[12rem] max-w-screen-md flex-1 relative mr-6"
	>
		{#if tagsShowDesktop}
			<FilterBar
				bind:query
				bind:activeTag
				tags={data.allTags}
				class="hidden max-w-[20rem] my-4 rounded-2xl p-4 xl:(flex flex-col min-w-[12rem] sticky top-[4rem])"
			/>
		{/if}
	</div>
</div>