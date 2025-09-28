<script lang="ts">
  import '@unocss/reset/sanitize/sanitize.css';
  import '@unocss/reset/sanitize/assets.css';
  import '@unocss/reset/tailwind.css';
  import '$lib/styles/defaultTheme.scss';
  import '$config/userTheme.scss';
  import '$lib/styles/global.scss';
  import 'uno.css';
  import 'tippy.js/dist/tippy.css';
  import 'tippy.js/themes/material.css';
  import 'tippy.js/animations/shift-away.css';

  import { fly } from 'svelte/transition';
  import Head from '$lib/components/head.svelte';
  import Header from '$lib/components/header.svelte';
  import Footer from '$lib/components/footer.svelte';
  import type { LayoutData } from './$types';

  export let data: LayoutData;

  import { navigating } from '$app/stores';
  import NProgress from 'nprogress';
  import '$lib/styles/nprogress.css';
  // Full list: https://github.com/rstacruz/nprogress#configuration
  NProgress.configure({ minimum: 0.2, easing: 'ease', speed: 600 });
  $: $navigating ? NProgress.start() : NProgress.done();

  import { browser } from '$app/environment';
  import { siteConfig } from '$config/site';
  import { onMount } from 'svelte';
  import { partytownSnippet } from '@qwik.dev/partytown/integration';
  let scriptEl: any;
  onMount(() => {
    if (scriptEl) {
      scriptEl.textContent = partytownSnippet();
    }
    if (browser) {
      document.documentElement.setAttribute('lang', siteConfig.lang);
    }
  });
</script>

<svelte:head>
  <script>
    partytown = {
      forward: ['plausible', 'dataLayer.push'],
    };
  </script>
  <script bind:this={scriptEl}></script>
</svelte:head>

<Head />

<Header />

{#key data.props.path}
  <div
    in:fly|global={{ y: 100, duration: 300, delay: 300 }}
    out:fly|global={{ y: -100, duration: 300 }}
    class="pt-[4rem] min-h-75vh">
    <slot />
  </div>
{/key}

<Footer />
