<!-- packages/california-tech/src/lib/components/index_posts.svelte -->
<script lang="ts">
	import { strings } from '$lib/strings';
	import { fade } from 'svelte/transition';
	import IndexPost from '$lib/components/index_post.svelte';
	import type { Post } from '$lib/types/post';

	let { posts, class: className }: { posts: Post.Post[]; class?: string } = $props();
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
		{@const years = [new Date().getFullYear()]}
		{#each posts as p, index (p.slug)}
			{@const year = new Date(p.published).getFullYear()}
			{#if !isNaN(year) && !years.includes(year)}
				<div
					in:fade={{ duration: 300, delay: 300 }}
					out:fade={{ duration: 300 }}
					class="year-divider"
				>
					{years.push(year) && year}
				</div>
			{/if}
			<IndexPost data={p} {index} />
		{/each}
	{/if}
</main>

<style lang="scss">
	.year-divider {
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
</style>

