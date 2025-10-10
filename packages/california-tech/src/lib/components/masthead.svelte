<script lang="ts">
  import { browser } from '$app/environment';
  import { replaceState } from '$app/navigation';
  import { techConfig } from '$config/tech';
  import { tagsCur } from '$stores/tags';
  import { postsShow } from '$stores/posts';
  import { onMount } from 'svelte';

  import TechLogo from './TechLogo.svelte';

  function resetHome() {
    tagsCur.init();
    postsShow.init();
    if (browser) {
      replaceState('', '/');
    }
  }

  // Format current date
  function getCurrentDate(): string {
    const date = new Date();
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('en-US', options);
  }

  let currentDate = getCurrentDate();

  onMount(() => {
    // Update date on client-side mount
    currentDate = getCurrentDate();
  });
</script>

<!-- Full width banner as home button -->
<a 
  href="/" 
  on:click={resetHome}
  class="block w-full px-4"
  aria-label="Return to home">
  <div id="banner" class="max-w-7xl mx-auto overflow-hidden cursor-pointer hover:opacity-90 transition-opacity">
    <!-- <img 
      src={techConfig.banner.src}
      alt={techConfig.banner.alt}
      class="w-full h-auto object-cover"/> -->
    <TechLogo className="w-full h-auto object-cover pt-4" />
  </div>
</a>

<!-- Info row below banner -->
<div id="info-bar" class="w-full py-2 px-8">
  <div class="flex justify-center md:justify-between items-center text-sm max-w-7xl mx-auto border-t-2 border-b-2 border-black dark:border-white py-2">
    <span class="font-semibold hidden md:inline">{techConfig.volume}</span>
    <span class="hidden md:inline">{techConfig.location}</span>
    <span>{currentDate}</span>
    <span class="hidden md:inline">{techConfig.email}</span>
  </div>
</div>

<style>
  #info-bar, #banner {
    background-color: var(--qwer-bg-color);
    color: var(--qwer-text-color);
  }
</style>
