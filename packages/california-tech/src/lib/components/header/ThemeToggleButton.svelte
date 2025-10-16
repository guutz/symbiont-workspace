<!-- packages/california-tech/src/lib/components/header/ThemeToggleButton.svelte -->
<script lang="ts">
  import { theme } from '$stores/themes';
  import { browser } from '$app/environment';
</script>

{#if browser}
  <button
    aria-label="Toggle Dark Mode"
    on:click={theme.toggle}
    class="btn active:translate-y-px duration-500 ease-out group"
  >
    <div class="!w-8 !h-8 i-line-md-sunny-outline-loop dark:i-line-md-moon group-hover:scale-120 transition-transform"></div>
  </button>
{:else}
  <form action="/?/toggleTheme" method="POST">
    <button
      aria-label="Toggle Dark Mode"
      class="btn active:translate-y-px duration-500 ease-out group"
    >
      <div class="!w-8 !h-8 i-line-md-sunny-outline-loop dark:i-line-md-moon group-hover:scale-120 transition-transform"></div>
    </button>
  </form>
{/if}

