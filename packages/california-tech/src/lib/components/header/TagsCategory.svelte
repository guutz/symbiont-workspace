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
	<button
		onclick={toggle}
		class="w-full flex justify-between items-center text-lg font-semibold"
		aria-expanded={expanded}
	>
		<span>{category.name}</span>
		<div
			class="transition-transform duration-200 {expanded ? '' : '-rotate-90'}"
		>
			<div class="i-mdi-chevron-down !w-6 !h-6"></div>
		</div>
	</button>

	{#if expanded}
		<ul class="pl-2 pt-2 flex flex-col items-start gap-1">
			{#each category.tags as tag}
				<li>
					<a
						href="/?tag={tag.name}"
						class="text-base p-1 rounded hover:bg-black/[0.1] dark:hover:bg-white/[0.1]"
						class:font-bold={activeTag === tag.name}
						onclick={(e) => handleTagClick(e, tag.name)}
					>
						# {tag.name}
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</div>

