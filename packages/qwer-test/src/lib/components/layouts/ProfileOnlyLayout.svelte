<script lang="ts">
  import IndexProfile from '$lib/components/index_profile.svelte';
  import Tags from '$lib/components/tags_root.svelte';
  import { tagsShowMobile, tagsShowDesktop } from '$stores/tags';
  import { fly } from 'svelte/transition';
</script>

{#if $tagsShowMobile}
  <div
    in:fly|global={{ x: -100, y: -100, duration: 300, delay: 300 }}
    out:fly|global={{ x: -100, y: -100, duration: 300 }}
    class="mx6 my4 xl:hidden">
    <Tags class="flex flex-col min-w-[12rem]" />
  </div>
{:else}
  <!-- Mobile Layout - Profile Only -->
  <div
    in:fly|global={{ y: 100, duration: 300, delay: 300 }}
    out:fly|global={{ y: 100, duration: 300 }}
    itemscope
    itemtype="https://schema.org/Blog"
    itemprop="blog"
    class="flex flex-nowrap justify-center flex-col items-center xl:hidden">
    <div class="max-w-screen-md flex-1 relative">
      <IndexProfile class="flex flex-col gap2 items-center text-center" />
    </div>
  </div>
{/if}

<!-- Desktop Layout - Profile Only -->
<div
  itemscope
  itemtype="https://schema.org/Blog"
  itemprop="blog"
  class="flex-nowrap justify-center flex-col items-center hidden xl:(flex flex-row items-stretch)">
  <div
    in:fly|global={{ x: -100, y: -100, duration: 300, delay: 300 }}
    out:fly|global={{ x: -100, y: 100, duration: 300 }}
    class="min-w-12rem max-w-screen-md flex-1 relative">
    <IndexProfile
      class="flex flex-col gap2 ml-auto max-w-fit justify-end items-center text-center xl:(sticky top-[4rem] min-w-[10rem])" />
  </div>
  <div
    in:fly|global={{ x: 100, y: -100, duration: 300, delay: 300 }}
    out:fly|global={{ x: 100, y: 100, duration: 300 }}
    class="min-w-12rem max-w-screen-md flex-1 relative mr6">
    {#if $tagsShowDesktop}
      <Tags class="hidden max-w-[20rem] my4 rounded-2xl p4 xl:(flex flex-col min-w-[12rem] sticky top-[4rem])" />
    {/if}
  </div>
</div>