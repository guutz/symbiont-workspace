<!-- packages/california-tech/src/routes/categories/+page.svelte -->
<script lang="ts">
	import { fade } from 'svelte/transition';

	let { data } = $props();
</script>

<svelte:head>
	<title>All Categories | The California Tech</title>
	<meta name="description" content="Browse all article categories and topics" />
</svelte:head>

<main 
	class="max-w-5xl mx-auto px-4 py-8"
	in:fade={{ duration: 300, delay: 300 }}
	out:fade={{ duration: 300 }}
>
	<header class="mb-8 pb-4 border-b-2 border-black dark:border-white">
		<h1 class="text-4xl font-bold mb-2">All Categories</h1>
		<p class="text-lg opacity-80">Browse articles by topic</p>
	</header>

	{#if data.allTags.length === 0}
		<p class="text-center text-lg opacity-60">No categories found.</p>
	{:else}
		<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
			{#each data.allTags as tag}
				<a
					href="/?tag={tag.name}"
					class="group p-4 border-2 border-black dark:border-white rounded-lg hover:bg-black hover:text-white dark:hover:bg-white dark:hover:text-black transition-colors duration-200"
				>
					<div class="flex justify-between items-start mb-2">
						<h2 class="text-xl font-semibold">{tag.name}</h2>
						<span class="text-sm px-2 py-1 bg-black/10 dark:bg-white/10 group-hover:bg-white/20 dark:group-hover:bg-black/20 rounded">
							{tag.count}
						</span>
					</div>
					<p class="text-sm opacity-70">
						{tag.count} {tag.count === 1 ? 'article' : 'articles'}
					</p>
				</a>
			{/each}
		</div>
	{/if}

	<div class="mt-8 pt-4 border-t border-black/20 dark:border-white/20">
		<a 
			href="/" 
			class="inline-flex items-center gap-2 text-lg hover:underline"
		>
			<div class="i-carbon-arrow-left !w-5 !h-5"></div>
			Back to Home
		</a>
	</div>
</main>