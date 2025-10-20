<!-- packages/california-tech/src/lib/components/header/FilterBar.svelte -->
<script lang="ts">
	import { strings } from '$lib/strings';
	import type { Tags } from '$lib/types/tags';
	import TagsCategory from './TagsCategory.svelte';

	let {
		tags,
		query = $bindable(),
		activeTag = $bindable(),
		class: className,
	} = $props<{
		tags: Tags.Category[];
		query: string;
		activeTag: string;
		class?: string;
	}>();

	let expanded = $state(true);

	function toggleExpanded() {
		expanded = !expanded;
	}
</script>

<div class={className}>
	<!-- Main Search Form for Posts -->
	<form action="/" method="GET" class="flex items-center relative mb-4">
		<input
			name="q"
			bind:value={query}
			placeholder={strings.IndexSearchBox()}
			class="w-full px-2 py-1 bg-transparent border-2 border-black/[0.5] dark:border-white/[0.5] rounded"
		/>
		<button type="submit" class="absolute right-2" aria-label="Search">
			<div class="i-carbon-search !w-6 !h-6"></div>
		</button>
	</form>

	<!-- Tag Filtering Section -->
	<details bind:open={expanded} class="group">
		<summary 
			class="select-none flex justify-between items-center border-b-2 border-black dark:border-white cursor-pointer list-none"
			onclick={(e) => {
				// Prevent default details toggle, handle it ourselves for animation
				e.preventDefault();
				toggleExpanded();
			}}
		>
			<h2 class="text-2xl my-2">{strings.Tags()}</h2>
			<div 
				class="display-inline-block !w-[1.75rem] !h-[1.75rem] transition-transform duration-200"
				class:rotate-180={!expanded}
				class:i-tabler-fold-down={expanded}
				class:i-tabler-fold-up={!expanded}
			></div>
		</summary>

		{#if expanded}
			<!-- List of Tag Categories -->
			<div class="pb-4 select-none overflow-y-auto" style="max-height: calc(100vh - 20rem);">
				{#each tags as category}
					<TagsCategory {category} bind:activeTag />
				{/each}
			</div>
		{/if}
	</details>
</div>

<style>
	input::placeholder {
		color: var(--qwer-input-placeholder-text-color);
	}
	
	/* Hide default details marker */
	summary::-webkit-details-marker {
		display: none;
	}
</style>