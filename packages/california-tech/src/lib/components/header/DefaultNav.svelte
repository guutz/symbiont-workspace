<script lang="ts">
  import { navConfig, mobilenavConfig } from '$config/site';
  import Dropdown from '$lib/components/dd.svelte';
  import Actions from './Actions.svelte';
</script>

<div class="flex items-center justify-items-center max-w-7xl mx-auto px-4 sm:px-8 h-full">
  <!-- Mobile hamburger menu -->
  <div class="lg:hidden rounded-lg btn btn-ghost !p-0">
    <Dropdown nav={mobilenavConfig} class="text-sm p-2">
      <button aria-label="Navigation Menu" class="flex items-center">
        <div class="i-mdi-hamburger-menu !w-[1.5rem] !h-[1.5rem]"></div>
      </button>
    </Dropdown>
  </div>

  <!-- Desktop navigation links -->
  <div class="hidden lg:flex">
    {#each navConfig as n}
      <Dropdown class="text-lg px-3 py-2 btn btn-ghost" nav={n} />
    {/each}
  </div>

  <Actions />
</div>

