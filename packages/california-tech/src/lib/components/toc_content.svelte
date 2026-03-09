<script lang="ts">
  import { untrack } from 'svelte';
  import { slide } from 'svelte/transition';
  import type { TOC } from '$lib/types/toc';
  import { tocCur } from '$stores/toc';
  import Self from '$lib/components/toc_content.svelte';

  let { content, expanded = false, depth = 1 }: { content: TOC.Heading; expanded?: boolean; depth?: number } = $props();
  let isExpanded = $state(untrack(() => expanded));

  function handleClick() {
    // Use the slug directly as a hash to navigate
    // The browser will handle the scrolling automatically
    window.location.hash = content.slug;
  }

  let touchMoved = false;
  function touchStartHandler() {
    document.addEventListener('touchmove', touchMoveHandler);
  }
  function touchMoveHandler() {
    touchMoved = true;
  }
  function touchEndHandler() {
    if (touchMoved) {
      touchMoved = false;
    } else {
      handleClick();
    }
    document.removeEventListener('touchmove', touchMoveHandler);
  }
</script>

<li id={content.slug}>
  <div
    role="button"
    tabindex="0"
    onclick={handleClick}
    ontouchstart={touchStartHandler}
    ontouchend={touchEndHandler}
    onkeydown={(e) => {
      if (e.key === 'Enter') {
        handleClick();
      }
    }}
    data-toc-link
    class="z1 group flex items-center gap2 py2 pr4 {$tocCur.get(content.slug) ? 'border-[#0096FF]' : 'border-transparent'}"
    class:pl4={depth === 1}
    class:pl8={depth === 2}
    class:pl12={depth === 3}
    class:pl16={depth === 4}
    class:pl18={depth === 5}>
    {#if content.child && content.child.length > 0}
      <span
        role="button"
        tabindex="0"
        onclick={(e) => {
          e.stopPropagation();
          isExpanded = !isExpanded;
        }}
        onkeydown={(e) => {
          if (e.key === 'Enter') {
            isExpanded = !isExpanded;
          }
        }}
        class="cursor-pointer z10 !w-[1.25rem] !h-[1.25rem] inline-block transition-transform duration-300 ease-out shrink-0 {isExpanded
          ? 'i-akar-icons-circle-chevron-up active:translate-y--1 hover:i-akar-icons-circle-chevron-up-fill'
          : 'i-akar-icons-circle-chevron-down active:translate-y-1 hover:i-akar-icons-circle-chevron-down-fill'}"></span>
    {:else}
      <span class="!w-[1.25rem] !h-[1.25rem] i-akar-icons-circle inline-block shrink-0"></span>
    {/if}
    <span
      class="{$tocCur.get(content.slug)
        ? '!text-black !font-900 scale-105 dark:(!text-white)'
        : ''} cursor-pointer select-none text-black/[0.6] group-hover:(text-black) dark:(text-white/[0.6] group-hover:(text-white) group-active:(!text-black)) flex-1 min-w-0 break-words overflow-wrap-anywhere">
      {@html content.heading}
    </span>
  </div>
  {#if content.child && content.child.length > 0}
    {#if isExpanded}
      <ul transition:slide|global={{ duration: 300 }} class="flex flex-col">
        {#each content.child as c}
          <Self content={c} depth={depth + 1} expanded />
        {/each}
      </ul>
    {/if}
  {/if}
</li>

<style>
  [data-toc-link] {
    --at-apply: 'border-l-4 hover:bg-gray/[0.25] active:(bg-yellow) dark:(active:(text-black/[0.6]))';
  }
</style>
