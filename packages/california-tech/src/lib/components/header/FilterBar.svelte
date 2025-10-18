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
	let tagFilterQuery = $state('');

	// Filter the list of tags on the client side as the user types
	const filteredTagCategories = $derived(
		tagFilterQuery
			? tags
					.map((category: Tags.Category) => {
						const filteredTags = category.tags?.filter((tag: Tags.Tag) =>
							tag.name.toLowerCase().includes(tagFilterQuery.toLowerCase())
						) || [];

						return { ...category, tags: filteredTags };
					})
					.filter((category: Tags.Category) => category.tags && category.tags.length > 0)
			: tags
	);
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
	<div
		role="button"
		tabindex="0"
		class="select-none flex justify-between items-center border-b-2 border-black dark:border-white cursor-pointer"
		onclick={() => (expanded = !expanded)}
		onkeydown={(e) => {
			if (e.key === 'Enter') expanded = !expanded;
		}}
	>
		<h2 class="text-2xl my-2">{strings.Tags()}</h2>
		<div class="{expanded ? 'i-tabler-fold-down' : 'i-tabler-fold-up'} display-inline-block !w-[1.75rem] !h-[1.75rem]"></div>
	</div>

	{#if expanded}
		<!-- Input to filter the tag list itself -->
		<form onsubmit={(e) => e.preventDefault()} class="flex items-center relative">
			<input
				bind:value={tagFilterQuery}
				placeholder={strings.FilterTags()}
				onkeydown={(e) => {
					if (tagFilterQuery && e.key === 'Escape') {
						tagFilterQuery = '';
					}
				}}
				class="my-2 px-2 py-1 bg-transparent border-2 border-black/[0.5] dark:border-white/[0.5] rounded flex-1"
			/>
			{#if tagFilterQuery}
				<div
					role="button"
					tabindex="0"
					class="absolute right-0 cursor-pointer w-10 h-8 rounded flex items-center justify-center"
					onclick={() => (tagFilterQuery = '')}
					onkeydown={(e) => {
						if (e.key === 'Enter') tagFilterQuery = '';
					}}
				>
					<div class="i-carbon-close-filled !w-6 !h-6"></div>
				</div>
			{/if}
		</form>

		<!-- List of Tag Categories -->
		<div class="pb-4 select-none">
			{#each filteredTagCategories as category}
				<TagsCategory {category} bind:activeTag />
			{/each}
		</div>
	{/if}
</div>

<style>
	input::placeholder {
		color: var(--qwer-input-placeholder-text-color);
	}
</style>