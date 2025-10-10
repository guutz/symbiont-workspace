<script lang="ts">
  import type { PageData } from './$types';

  export let data: PageData;

  $: ({ query, results } = data);
</script>

<svelte:head>
  <title>{query ? `Results for "${query}"` : 'Search'}</title>
</svelte:head>

<div class="max-w-4xl mx-auto px-4 sm:px-8 py-8">
  <header class="mb-8">
    <h1 class="text-4xl font-bold mb-4">Search Results</h1>
    {#if query}
      <p class="text-xl text-gray-600 dark:text-gray-400">
        Found {results.length} {results.length === 1 ? 'result' : 'results'} for <span class="font-semibold text-black dark:text-white">"{query}"</span>
      </p>
    {/if}
  </header>

  <main>
    {#if results.length > 0}
      <ul class="space-y-6">
        {#each results as post}
          <li>
            <a href={`/${post.slug}`} class="block p-4 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <h2 class="text-2xl font-semibold text-red-600 dark:text-red-500">{post.title}</h2>
              <p class="mt-2 text-gray-700 dark:text-gray-300 line-clamp-2">{post.summary || (post.content ?? '').substring(0, 150)}</p>
            </a>
          </li>
        {/each}
      </ul>
    {:else if query}
      <p>No posts found matching your search.</p>
    {/if}
  </main>
</div>

