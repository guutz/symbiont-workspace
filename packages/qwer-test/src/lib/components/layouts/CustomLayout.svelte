<script lang="ts">
  import IndexPosts from '$lib/components/index_posts.svelte';
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
  <!-- Mobile Layout - Custom -->
  <div
    in:fly|global={{ y: 100, duration: 300, delay: 300 }}
    out:fly|global={{ y: 100, duration: 300 }}
    itemscope
    itemtype="https://schema.org/Blog"
    itemprop="blog"
    class="flex flex-nowrap justify-center flex-col items-center xl:hidden">
    <!-- Custom mobile layout - modify this section -->
    <div class="h-feed min-h-50vh flex-none w-full">
      <div class="text-center mb-8">
        <h1 class="text-4xl font-bold mb-4">Custom Layout</h1>
        <p class="text-gray-600">This is a custom layout template. Modify this component to create your own design.</p>
      </div>
      <IndexPosts />
    </div>
  </div>
{/if}

<!-- Desktop Layout - Custom -->
<div
  itemscope
  itemtype="https://schema.org/Blog"
  itemprop="blog"
  class="flex-nowrap justify-center flex-col items-center hidden xl:(flex flex-row items-stretch)">
  <!-- Custom desktop layout - modify this section -->
  <div
    in:fly|global={{ y: 100, duration: 300, delay: 300 }}
    out:fly|global={{ y: -100, duration: 300 }}
    class="h-feed min-h-50vh flex-none w-full md:(rounded-2xl w-[50rem] mx2)">
    <div class="text-center mb-8">
      <h1 class="text-4xl font-bold mb-4">Custom Layout</h1>
      <p class="text-gray-600">This is a custom layout template. Modify this component to create your own design.</p>
    </div>
    <IndexPosts />
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