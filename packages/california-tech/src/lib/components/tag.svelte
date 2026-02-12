<script lang="ts">
  import type { Tags } from '$lib/types/tags';
  let { data }: { data: Tags.Tag } = $props();

  import { page } from '$app/stores';
  import { goto } from '$app/navigation';

  const isActive = $derived($page.url.searchParams.get('tag') === data.name);

  function handleClick() {
    const params = new URLSearchParams($page.url.searchParams);
    const current = params.get('tag');
    if (current === data.name) {
      params.delete('tag');
    } else {
      params.set('tag', data.name);
    }
    const query = params.toString();
    goto(query ? `?${query}` : '/', { replaceState: true, keepFocus: true, noScroll: true });
  }
</script>

<button
  class:btn_active={isActive}
  class="text-sm m-1 normal-case border-2 border-dotted btn hover:(border-[#007300] border-solid) border-black/[0.5] dark:(border-white/[0.5]) active:(scale-80 transition-transform duration-250 ease-in-out)"
  onclick={handleClick}
  ontouchstart={handleClick}>
  {data.name}
</button>

<style>
  .btn_active {
    --at-apply: 'font-bold shadow-lg bg-black/[0.6] text-white dark:(bg-white/[0.85] text-black) hover:(border-[#CC0000] border-solid)';
  }
</style>
