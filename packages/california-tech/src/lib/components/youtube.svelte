<script lang="ts">
  import { siteConfig } from '$config/site';

  let {
    id = undefined,
    list = undefined,
    playlist = undefined,
    start = undefined,
    autoplay = false,
    disablekb = false,
    controls = true,
    fs = true,
    loop = false,
  }: {
    id?: string;
    list?: string;
    playlist?: string;
    start?: string;
    autoplay?: boolean;
    disablekb?: boolean;
    controls?: boolean;
    fs?: boolean;
    loop?: boolean;
  } = $props();

  const src = `https://www.youtube.com/embed/${id}?${list ? `listType=playlist&amp;list=${list}&amp;` : ''}${
    playlist ? `playlist=${playlist}&amp;` : ''
  }${start ? `start=${start}&amp;` : ''}${autoplay ? 'autoplay=1&amp;' : ''}${disablekb ? 'disablekb=1&amp;' : ''}${
    controls ? '' : 'controls=0&amp;'
  }${fs ? '' : 'fs=0&amp;'}${
    loop ? 'loop=1&amp;' : ''
  }iv_load_policy=3&amp;modestbranding=1&amp;playsinline=1&amp;showinfo=0&amp;rel=0&amp;enablejsapi=1&amp;origin=${encodeURI(
    siteConfig.url,
  )}`;
</script>

<div class="relative my4">
  <iframe
    {src}
    title="Youtube Player"
    allowfullscreen
    allowtransparency
    loading="lazy"
    allow="autoplay"
    class="w-full h-auto aspect-video"></iframe>
</div>
