<script lang="ts">
  import { browser } from '$app/environment';
  import { fly } from 'svelte/transition';

  // Configurable thresholds
  const topPercent = 0.025;
  const botPercent = 0.975;

  // Scroll state
  let scrollY = $state(0);
  let innerHeight = $state(0);
  let scrollHeight = $state(0);
  let lastY = 0;
  let scrollingUp = $state(false);

  // Reactive calculations
  const scrollThresholdStep = $derived(innerHeight * 0.1);
  const pageEndTopBound = $derived(scrollHeight - innerHeight);
  const scrollPercent = $derived(scrollY / pageEndTopBound || 0);

  // Track scroll direction (debounced by threshold)
  $effect(() => {
    if (browser) {
      if (Math.abs(lastY - scrollY) > scrollThresholdStep) {
        scrollingUp = lastY - scrollY > 0;
        lastY = scrollY;
      }
    }
  });

  // Update scroll height when document changes
  $effect(() => {
    if (browser) {
      scrollHeight = document.documentElement.scrollHeight;
    }
  });

  function scrollToTop() {
    scrollY = 0;
  }

  function scrollToBottom() {
    scrollY = scrollHeight;
  }
</script>

<svelte:window bind:scrollY bind:innerHeight />

{#if scrollingUp && scrollPercent > topPercent && scrollPercent < botPercent}
  <button
    id="totop"
    onclick={scrollToTop}
    aria-label="scroll to top"
    in:fly|global={{ y: 50, duration: 300, delay: 300 }}
    out:fly|global={{ y: 50, duration: 300 }}
    class="fixed grid group border-none bottom-2 right-2 z-50 duration-600 delay-300 ease-in-out rounded-full bg-transparent">
    <div
      class="backdrop-blur rounded-full col-start-1 row-start-1 transition-all duration-600 ease-in-out scale-70 relative bg-transparent">
      <div
        class="absolute z-50 top-[1.85rem] left-[1.85rem] i-mdi-chevron-up !h-[2.5rem] !w-[2.5rem] group-hover:text-black"></div>
      <svg
        height="100"
        width="100"
        class="fill-none group-hover:fill-gray-500/[0.5]"
        style="transform: rotate(-90deg);stroke-dasharray: 251;">
        <circle
          cx="50"
          cy="50"
          r="40"
          stroke-width="6"
          class="stroke-emerald"
          style="stroke-dashoffset: {251 - 251 * scrollPercent};" />
      </svg>
    </div>
  </button>
{/if}

{#if !scrollingUp && scrollPercent > topPercent && scrollPercent < botPercent}
  <button
    id="tobottom"
    onclick={scrollToBottom}
    aria-label="scroll to bottom"
    in:fly|global={{ y: 50, duration: 300, delay: 300 }}
    out:fly|global={{ y: 50, duration: 300 }}
    class="fixed grid group border-none bottom-2 right-2 z-50 duration-600 delay-300 ease-in-out rounded-full bg-transparent">
    <div
      class="backdrop-blur rounded-full col-start-1 row-start-1 transition-all duration-600 ease-in-out scale-70 relative bg-transparent">
      <div
        class="absolute z-50 top-[1.85rem] left-[1.85rem] i-mdi-chevron-down !h-[2.5rem] !w-[2.5rem] group-hover:text-black"></div>
      <svg
        height="100"
        width="100"
        class="fill-none group-hover:fill-gray-500/[0.5]"
        style="transform: rotate(-90deg);stroke-dasharray: 251;">
        <circle
          cx="50"
          cy="50"
          r="40"
          stroke-width="6"
          class="stroke-emerald"
          style="stroke-dashoffset: {251 - 251 * scrollPercent};" />
      </svg>
    </div>
  </button>
{/if}