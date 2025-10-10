<script lang="ts">
  export let topPercent: number = 0.05; // Show button after 5% scroll
  export let botPercent: number = 0.95; // Show button until 95% scroll
  export let scrollingUp: boolean = true; // true: show "to top" button, false: show "to bottom" button
  export let scrollPercent: number = 0; // Current scroll percent (0 to 1)
  export let scrollHeight: number = 0; // Total scroll height
  import { fly } from 'svelte/transition';
</script>


{#if scrollingUp && scrollPercent > topPercent && scrollPercent < botPercent}
  <button
    id="totop"
    on:click={() => {
      scrollY = 0;
    }}
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
    id="tobotoom"
    on:click={() => {
      scrollY = scrollHeight;
    }}
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