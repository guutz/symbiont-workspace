<script lang="ts">
  import { page } from '$app/stores';
  import { searching } from '$lib/search/stores';
  import { tagsShowDesktop, tagsShowMobile } from '$stores/tags';
  import { strings } from '$lib/strings';
  import ThemeToggleButton from './ThemeToggleButton.svelte';
</script>

<div class="ml-auto flex items-center">
  <!-- Only show Search and Tags buttons on the homepage -->
  {#if $page.route?.id === '/'}
    <button
      id="search-button"
      aria-label="Open Search"
      tabindex="0"
      on:click={() => { $searching = true; }}
      class="mx-2 btn active:translate-y-px duration-600 ease-out group flex items-center gap-2 md:(border-1 border-black/[0.25] dark:border-white/[0.25])"
    >
      <div class="!w-7 !h-7 i-carbon-search group-hover:scale-120 transition-transform"></div>
      <label for="search-button" class="hidden md:inline-block">
        <span class="mx-2">{strings.IndexSearchBox()}</span>
        <kbd>/</kbd>
      </label>
    </button>
    
    <!-- Desktop Tags Button -->
    <button
      aria-label="Toggle Tags View"
      on:click={() => { $tagsShowDesktop = !$tagsShowDesktop; }}
      class="btn active:translate-y-px duration-600 ease-out group hidden xl:inline-block"
    >
      <div
        class:i-mdi-tag-off={$tagsShowDesktop}
        class:i-mdi-tag={!$tagsShowDesktop}
        class="!w-7 !h-7 group-hover:scale-120 transition-transform"
      ></div>
    </button>

    <!-- Mobile/Tablet Tags Button -->
    <button
      aria-label="Toggle Tags View"
      on:click={() => { $tagsShowMobile = !$tagsShowMobile; }}
      class="btn active:translate-y-px duration-600 ease-out group xl:hidden"
    >
      <div
        class:i-mdi-tag-off={$tagsShowMobile}
        class:i-mdi-tag={!$tagsShowMobile}
        class="!w-7 !h-7 group-hover:scale-120 transition-transform"
      ></div>
    </button>
  {/if}
  
  <ThemeToggleButton />
</div>
