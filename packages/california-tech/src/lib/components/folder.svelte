<script lang="ts">
  import File from '$lib/components/file.svelte';
  import Self from '$lib/components/folder.svelte';
  import type { Folder } from '$lib/types/folder';

  let { expanded = true, name, files = [] }: { expanded?: boolean; name: string; files?: Array<Folder.Item> } =
    $props();
  let isExpanded = $state(expanded);

  function toggle() {
    isExpanded = !isExpanded;
  }
</script>

<div
  role="button"
  tabindex="0"
  class="flex justify-start items-center cursor-pointer"
  onclick={toggle}
  onkeydown={(e) => {
    if (e.key === 'Enter') {
      toggle();
    }
  }}>
  <div
    class="{isExpanded ? 'i-fluent-emoji-flat-open-file-folder' : 'i-fluent-emoji-flat-file-folder'} !w8 !h8 shrink-0"></div>
  <div class="px2">
    {name}
  </div>
</div>

{#if isExpanded}
  <ul>
    {#each files as file}
      <li>
        {#if file.files}
          <Self name={file.name} files={file.files ?? []} />
        {:else}
          <File name={file.name} icon={file.icon} />
        {/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  ul {
    --at-apply: 'border-gray/[0.5] border-l-2';
    padding: 0.2em 0 0 0.5em;
    margin: 0 0 0 0.5em;
    list-style: none;
  }

  li {
    padding: 0.2em 0;
  }
</style>
