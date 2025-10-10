<script lang="ts">
  import { afterUpdate, onDestroy } from 'svelte';
  import { goto } from '$app/navigation';
  import { query, searching } from '$lib/search/stores';
  import { strings } from '$lib/strings';
  import type { Post } from '$lib/types/post';
  import { fly } from 'svelte/transition';

  let searchbox: HTMLInputElement;
  let input: string = $query ?? '';
  let liveResults: Post.Post[] = [];
  let showDropdown = false;
  let timer: number;

  // Commits the search and navigates to the full results page
  function handleSubmit() {
    query.set(input);
    $searching = false;
    if (input) {
      goto(`/search?q=${encodeURIComponent(input)}`);
    }
  }

  function closeSearch() {
    $searching = false;
    showDropdown = false;
    liveResults = [];
  }

  // Live search that fetches quick results
  async function liveSearch() {
    if (input.length < 2) {
      showDropdown = false;
      liveResults = [];
      return;
    }

    try {
      const res = await fetch(`/api/search/quick?q=${encodeURIComponent(input)}`);
      if (res.ok) {
        liveResults = await res.json();
        showDropdown = liveResults.length > 0;
      }
    } catch (error) {
      console.error('Error fetching search results:', error);
      showDropdown = false;
    }
  }

  // Debounce the live search input
  function handleInput() {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      liveSearch();
    }, 200); // 200ms delay
  }

  // Focus the input when the search bar becomes visible
  afterUpdate(() => {
    if ($searching) {
      searchbox?.focus();
    }
  });
  
  onDestroy(() => {
    clearTimeout(timer);
  });
</script>

<div class="relative flex items-center w-full max-w-7xl mx-auto px-4 h-full">
  <form on:submit|preventDefault={handleSubmit} class="grow flex items-center" action="/search" method="GET">
    <input
      bind:this={searchbox}
      bind:value={input}
      on:input={handleInput}
      on:keydown={(e) => {
        if (e.code === 'Escape') {
          e.preventDefault();
          closeSearch();
        }
      }}
      on:focus={() => input.length > 1 && liveResults.length > 0 && (showDropdown = true)}
      type="search"
      name="q"
      placeholder={strings.IndexSearchBox()}
      spellcheck="false"
      autocomplete="off"
      id="index-search-input"
      class="grow mx-4 px-2 h-10 rounded bg-transparent border-1 border-black dark:border-white focus:!border-red-500"
    />
    <button class="btn inline-block active:translate-y-px duration-500 ease-out group md:hidden" aria-label="Submit Search">
      <div class="!w-8 !h-8 i-carbon-search group-hover:scale-120 transition-transform"></div>
    </button>
  </form>
  <button
    on:click={closeSearch}
    class="mx-2 btn active:translate-y-px duration-500 ease-out group flex items-center gap-2 md:(border-1 border-black/[0.25] dark:border-white/[0.25])"
    aria-label="Close Search"
    id="close-search-button"
  >
    <div class="!w-8 !h-8 i-carbon-close group-hover:scale-120 transition-transform"></div>
    <label for="close-search-button" class="hidden md:inline-block">
      <span class="mx-2">{strings.IndexCloseSearchBox()}</span>
      <kbd>ESC</kbd>
    </label>
  </button>

  <!-- Live Results Dropdown -->
  {#if showDropdown && liveResults.length > 0}
    <div
      transition:fly={{ y: -5, duration: 200 }}
      class="absolute top-full left-0 right-0 mt-2 mx-4 border border-black/[0.1] dark:border-white/[0.1] rounded-lg shadow-lg z-50"
      on:introstart={() => (showDropdown = true)}
      on:outroend={() => (showDropdown = false)}
    >
      <ul class="py-2">
        {#each liveResults as post}
          <li>
            <a href={`/${post.slug}`} on:click={closeSearch} class="px-4 py-2 flex items-center gap-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
              <div class="flex-shrink-0 w-8 h-8 i-carbon-document text-gray-400"></div>
              <div class="flex-grow overflow-hidden">
                <p class="font-semibold truncate">{post.title}</p>
                <p class="text-sm text-gray-500 truncate">{post.summary || (post.content ?? '').substring(0, 80)}</p>
              </div>
            </a>
          </li>
        {/each}
         <li class="border-t border-black/[0.1] dark:border-white/[0.1] mt-2 pt-2">
            <button on:click={handleSubmit} class="w-full text-left px-4 py-2 flex items-center gap-4 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
               <div class="flex-shrink-0 w-8 h-8 i-carbon-search text-gray-400"></div>
               <p>See all results for "{input}"</p>
            </button>
         </li>
      </ul>
    </div>
  {/if}
</div>

