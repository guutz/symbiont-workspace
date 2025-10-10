<script lang="ts">
  import { theme } from '$stores/themes';
  import { onMount } from 'svelte';

  // Keying the button on the theme value ensures the icon transition re-runs
  let currentTheme: string;
  onMount(() => {
    // We need to subscribe to get the value for the key
    const unsubscribe = theme.subscribe(value => {
      currentTheme = value;
    });
    return unsubscribe;
  });
</script>

{#key currentTheme}
  <button
    aria-label="Toggle Dark Mode"
    on:click={theme.toggle}
    class="btn active:translate-y-px duration-500 ease-out group"
  >
    <div
      class="!w-8 !h-8 i-line-md-sunny-outline-loop dark:i-line-md-moon group-hover:scale-120 transition-transform"
    ></div>
  </button>
{/key}
