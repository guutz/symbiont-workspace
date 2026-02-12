<!-- packages/california-tech/src/lib/components/index_posts.svelte -->
<script lang="ts">
	import { strings } from '$lib/strings';
	import { fade } from 'svelte/transition';
	import IndexPost from '$lib/components/index_post.svelte';
	import type { Post } from '$lib/types/post';

	let { posts = [], class: className }: { posts?: Post.Post[]; class?: string } = $props();
</script>

<main
	id="index-posts"
	class="flex flex-col items-center py-4 gap-6 {className ?? ''}"
	itemscope
	itemprop="mainEntityOfPage"
	itemtype="https://schema.org/Blog"
>
	{#if posts.length === 0}
		<div
			class="h-[20rem] flex items-center justify-center"
			in:fade={{ duration: 300, delay: 300 }}
			out:fade={{ duration: 300 }}
		>
			<h2 class="text-3xl">{strings.NoPostFound()}</h2>
		</div>
	{:else}
		{@const seenDates = new Set<string>()}
		{#each posts as p, index (p.slug)}
			{@const publishDate = new Date(p.published)}
			{@const dateKey = !isNaN(publishDate.getTime()) 
				? publishDate.toLocaleDateString('en-US', { 
					year: 'numeric', 
					month: 'long', 
					day: 'numeric',
					timeZone: 'America/Los_Angeles'
				})
				: ''}
			{#if dateKey && !seenDates.has(dateKey)}
				{#key dateKey}
					<div class="issue-divider">
						{seenDates.add(dateKey) && dateKey}
					</div>
				{/key}
			{/if}
			<div class="post-wrapper">
				<IndexPost data={p} {index} />
			</div>
		{/each}
	{/if}
</main>

<style lang="scss">
	.issue-divider {
		--at-apply: 'my-4 h-4 whitespace-nowrap flex flex-row items-center self-stretch md:mx12';
		&:before {
			content: '';
			--at-apply: 'bg-black dark:bg-white op25 flex-grow h-0.5 w-full rounded-2xl';
		}
		&:after {
			content: '';
			--at-apply: 'bg-black dark:bg-white op25 flex-grow h-0.5 w-full rounded-2xl';
		}
		&:not(:empty) {
			--at-apply: 'gap-4';
		}
	}

	.post-wrapper {
		--at-apply: 'w-full max-w-100';
	}

	// Mobile: single column
	#index-posts {
		--at-apply: 'flex flex-col items-center';
	}

	// Tablet: 2 columns
	@media (min-width: 640px) {
		#index-posts {
			display: grid;
			grid-template-columns: repeat(2, 1fr);
			gap: 1.5rem;
			align-items: start;
		}

		.issue-divider {
			grid-column: 1 / -1;
		}

		.post-wrapper {
			max-width: none;
		}
	}

	// Desktop: 3 columns
	@media (min-width: 1024px) {
		#index-posts {
			grid-template-columns: repeat(3, 1fr);
			gap: 1.5rem;
		}
	}

	// Large desktop: 4 columns
	@media (min-width: 1536px) {
		#index-posts {
			grid-template-columns: repeat(4, 1fr);
			gap: 2rem;
		}
	}
</style>
