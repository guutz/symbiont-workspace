<!-- packages/california-tech/src/lib/components/header/FilterBar.svelte -->
<script lang="ts">
  import type { Tags } from '$lib/types/tags';
  import { page } from '$app/stores';

  export let tags: Tags.Tag[] = [];
  export let currentQuery: string = '';
  export let currentTag: string = '';

  let query = currentQuery;
</script>  

<div class="max-w-7xl mx-auto px-4 sm:px-8 py-4">
  <form method="GET" action="/" class="flex flex-col md:flex-row gap-4 items-center">
    <div class="relative w-full md:flex-grow">
      <input
        type="search"
        name="q"
        bind:value={query}
        placeholder="Search posts..."
        class="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-red-500"
      />
      <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <div class="i-carbon-search text-gray-400"></div>
      </div>
    </div>
    <button type="submit" class="btn btn-primary w-full md:w-auto">Search</button>
  </form>

  <div class="mt-4 flex flex-wrap gap-2 items-center">
    <span class="font-semibold text-sm mr-2">Filter by tag:</span>
    <a 
      href="/" 
      class="px-3 py-1 text-sm rounded-full transition-colors"
      class:bg-red-600={!currentTag}
      class:text-white={!currentTag}
      class:bg-gray-200={currentTag}
      class:dark:bg-gray-700={currentTag}
      class:hover:bg-red-500={currentTag}
    >
      All
    </a>
    {#each tags as tag}
      <a 
        href={`/?tag=${tag.label.toLowerCase()}`}
        class="px-3 py-1 text-sm rounded-full transition-colors"
        class:bg-red-600={currentTag === tag.label.toLowerCase()}
        class:text-white={currentTag === tag.label.toLowerCase()}
        class:bg-gray-200={currentTag !== tag.label.toLowerCase()}
        class:dark:bg-gray-700={currentTag !== tag.label.toLowerCase()}
        class:hover:bg-red-500={currentTag !== tag.label.toLowerCase()}
      >
        {tag.label} ({tag.count})
      </a>
    {/each}
  </div>
</div>

