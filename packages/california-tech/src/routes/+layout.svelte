<script lang="ts">
  import '@unocss/reset/sanitize/sanitize.css';
  import '@unocss/reset/sanitize/assets.css';
  import '@unocss/reset/tailwind.css';
  import '$lib/styles/defaultTheme.scss';
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
  import type { Snippet } from 'svelte';

  let { data, children }: { data: LayoutData; children: Snippet } = $props();

  import { navigating } from '$app/stores';
  import NProgress from 'nprogress';
  import '$lib/styles/nprogress.css';
  // Full list: https://github.com/rstacruz/nprogress#configuration
  NProgress.configure({ minimum: 0.2, easing: 'ease', speed: 600 });
  $effect(() => {
    if ($navigating) {
      NProgress.start();
    } else {
      NProgress.done();
    }
  });

  import { browser } from '$app/environment';
  import { afterNavigate } from '$app/navigation';
  import { siteConfig } from '$config/site';
  import { onMount } from 'svelte';
  // import { partytownSnippet } from '@qwik.dev/partytown/integration';
  // let scriptEl: any;
  
  onMount(() => {
    // if (scriptEl) {
    //   scriptEl.textContent = partytownSnippet();
    // }
    if (browser) {
      document.documentElement.setAttribute('lang', siteConfig.lang);
    }
  });

  afterNavigate(({ to, from }) => {
    if (!browser || !to) return;
    if (to.url.hash) return;
    if (from && to.url.pathname === from.url.pathname && to.url.search === from.url.search) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  });
</script>

<!-- <svelte:head>
  <script>
    partytown = {
      forward: ['plausible', 'dataLayer.push'],
    };
  </script>
  <script bind:this={scriptEl}></script>
</svelte:head> -->

<Head />

<Header />

{#key data.props.path}
  <div
    in:fly|global={{ y: 100, duration: 300, delay: 300 }}
    out:fly|global={{ y: -100, duration: 300 }}
    class="min-h-75vh">
    {@render children()}
  </div>
{/key}

<Footer />
