<script lang="ts">
  import { browser } from '$app/environment';
  import { navigating, page } from '$app/stores';
  import { afterUpdate, onMount } from 'svelte';
  
  import { query, result, searching } from '$lib/search/stores';

  import Masthead from '$lib/components/masthead.svelte';
  import ScrollButtons from '$lib/components/scroll_buttons.svelte';
  import DefaultNav from '$lib/components/header/DefaultNav.svelte';
  import SearchNav from '$lib/components/header/SearchNav.svelte';

  // Scroll-related state for ScrollButtons
  let scrollY: number;
  let lastY = 0;
  let innerHeight: number;
  let scrollHeight: number;
  let scrollPercent: number;
  let pageEndTopBound: number;
  let scrollingUp = false;
  let scrollThresholdStep: number;
  const topPercent = 0.025;
  const botPercent = 0.975;

  $: scrollThresholdStep = innerHeight * 0.1;
  $: if (browser) {
    pageEndTopBound = scrollHeight - innerHeight;
    scrollPercent = scrollY / pageEndTopBound;
    // Determine scroll direction only if scroll distance exceeds the threshold
    if (Math.abs(lastY - scrollY) > scrollThresholdStep) {
      scrollingUp = lastY - scrollY > 0;
      lastY = scrollY;
    }
  }

  // Update scrollHeight after the DOM updates
  afterUpdate(() => {
    scrollHeight = document.documentElement.scrollHeight;
  });
  
  // Initialize and reset search state
  onMount(() => {
    query.init();
    const queryParam = $page.url.searchParams.get('query');
    if (queryParam) {
        query.set(queryParam);
        $searching = true;
    }
  });

  // Reset search when navigating to a new page
  $: if ($navigating && $searching) {
    $searching = false;
    query.reset();
    $result = undefined;
  }
</script>

<svelte:window
  bind:scrollY
  bind:innerHeight
  on:keydown={(e) => {
    // Open search with '/' key, but not if inside an input field
    if (e.key === '/' && (e.target as HTMLElement).tagName !== 'INPUT') {
      e.preventDefault();
      if (!$searching) {
        $searching = true;
      }
    }
  }} 
/>

<header id="header" class="w-screen z-40" aria-label="Header Navigation">
  <Masthead />
  
  <!-- 
    This container uses CSS transitions instead of Svelte transitions to avoid 
    the overlap issue. One view fades/slides out while the other fades/slides in.
  -->
  <div class="relative py-2 min-h-4rem max-h-16">
    <!-- Search Bar View -->
    <div
      class="absolute inset-0 transition-all duration-300 ease-in-out"
      class:opacity-100={$searching}
      class:opacity-0={!$searching}
      class:pointer-events-auto={$searching}
      class:pointer-events-none={!$searching}
      class:translate-x-0={$searching}
      class:translate-x-12={!$searching}
    >
      <SearchNav />
    </div>

    <!-- Default Navigation View -->
    <div
      class="transition-all duration-300 ease-in-out"
      class:opacity-100={!$searching}
      class:opacity-0={$searching}
      class:pointer-events-auto={!$searching}
      class:pointer-events-none={$searching}
      class:-translate-x-0={!$searching}
      class:-translate-x-12={$searching}
    >
      <DefaultNav />
    </div>
  </div>
</header>

<ScrollButtons {topPercent} {botPercent} {scrollingUp} {scrollPercent} {scrollHeight} />

