<script lang="ts">
  import Masthead from '$lib/components/masthead.svelte';
  import ScrollButtons from '$lib/components/scroll_buttons.svelte';
  import DefaultNav from '$lib/components/header/DefaultNav.svelte';
</script>

<header id="header" class="w-screen z-40" aria-label="Header Navigation">
  <Masthead />
  <div class="relative py-2 min-h-4rem max-h-16">
    <DefaultNav />
  </div>
</header>

<ScrollButtons />