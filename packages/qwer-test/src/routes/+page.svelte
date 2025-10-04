<script lang="ts">
  import { tagsCur, tagsShowMobile, tagsShowDesktop } from '$stores/tags';
  import { postsShow, initializePostsFromServer } from '$stores/posts';
  import { siteConfig } from '$config/site';
  import { getLayoutComponent } from '$lib/components/LayoutMapper';

  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import type { PageData } from './$types';

  export let data: PageData;

  // Get the appropriate layout component
  const LayoutComponent = getLayoutComponent(siteConfig.indexLayout);

  onMount(() => {
    // Initialize posts from server data
    if (data.posts && data.posts.length > 0) {
      initializePostsFromServer(data.posts);
    }
    
    tagsCur.init();
    postsShow.init();

    $page.url.searchParams.forEach((v, k) => {
      k = decodeURI(k);
      if (k.match(/^tags(-.*)?/)) {
        k = k.replace(/^tags-/, '');
        v.split(',').forEach((v) => {
          tagsCur.add(k, v);
        });
      }
    });
  });
</script>

<svelte:head>
  <title>{siteConfig.title}</title>
  <meta name="description" content={siteConfig.description} />
  <link rel="canonical" href={siteConfig.url} />

  <!-- OpenGraph -->
  <meta property="og:site_name" content={siteConfig.title} />
  <meta property="og:locale" content={siteConfig.lang} />
  <meta property="og:type" content="website" />

  <meta property="og:title" content={siteConfig.title} />
  <meta name="twitter:title" content={siteConfig.title} />

  <meta property="og:description" content={siteConfig.description} />
  <meta name="twitter:description" content={siteConfig.description} />

  <meta property="og:url" content={siteConfig.url} />
  <meta property="twitter:url" content={siteConfig.url} />

  <meta property="og:image" content={new URL(siteConfig.cover, siteConfig.url).href} />
  <meta name="twitter:image" content={new URL(siteConfig.cover, siteConfig.url).href} />
  <meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<!-- Dynamic Layout Component -->
<svelte:component this={LayoutComponent} />
