<!-- packages/california-tech/src/lib/components/header/TagsCategory.svelte -->
<script lang="ts">
	import type { Tags } from '$lib/types/tags';

	let {
		category,
		activeTag = $bindable(),
	} = $props<{
		category: Tags.Category;
		activeTag: string;
	}>();

	let expanded = $state(true);

	function toggle() {
		expanded = !expanded;
	}

	function handleTagClick(event: MouseEvent, tagName: string) {
		event.preventDefault();
		activeTag = tagName === activeTag ? '' : tagName;
	}
</script>

<div class="py-2">
	<!-- Use details/summary for no-JS support -->
	<details bind:open={expanded}>
		<summary
			class="w-full flex justify-between items-center text-lg font-semibold list-none cursor-pointer"
			onclick={(e) => {
				e.preventDefault();
				toggle();
			}}
		>
			<span>{category.name}</span>
			<div
				class="transition-transform duration-200"
				class:rotate-180={!expanded}
			>
				<div class="i-mdi-chevron-down !w-6 !h-6"></div>
			</div>
		</summary>

		{#if expanded}
			<ul class="pl-2 pt-2 flex flex-col items-start gap-1">
				{#each category.tags as tag}
					<li>
						<a
							href="/?tag={tag.name}"
							class="text-base p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors {activeTag === tag.name ? 'font-bold bg-black/15 dark:bg-white/15' : ''}"
							onclick={(e) => handleTagClick(e, tag.name)}
						>
							# {tag.name}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</details>
</div>

<style>
	/* Hide default details marker */
	summary::-webkit-details-marker {
		display: none;
	}
</style>