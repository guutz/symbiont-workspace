<script lang="ts">
  import Masthead from '$lib/components/masthead.svelte';
  import ScrollButtons from '$lib/components/scroll_buttons.svelte';
  import DefaultNav from '$lib/components/header/DefaultNav.svelte';
  import { NavigationMenu } from "bits-ui";
  
  
</script>

<header id="header" class="w-screen z-40" aria-label="Header Navigation">
  <Masthead />
  <div class="relative py-2 min-h-4rem max-h-16">
    <NavigationMenu.Root>
      <NavigationMenu.List class="max-w-7xl mx-auto px-4 sm:px-8 h-full">
        <NavigationMenu.Item class="flex-grow">
          hi
        </NavigationMenu.Item>
      </NavigationMenu.List>
    </NavigationMenu.Root>
  </div>
</header>

<ScrollButtons />