<script lang="ts">
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  import type { Asset } from '$generated/asset';
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  import { assets } from '$generated/assets';
  import { UserConfig } from '$config/QWER.config';
  import { fade } from 'svelte/transition';

  let {
    pictureClass = undefined,
    imgClass = undefined,
    src,
    alt = src,
    loading = 'eager',
    decoding = 'async',
    width = undefined,
    height = undefined,
  }: {
    pictureClass?: string;
    imgClass?: string;
    src: string;
    alt?: string;
    loading?: 'eager' | 'lazy';
    decoding?: 'async' | 'sync' | 'auto';
    width?: string | number;
    height?: string | number;
  } = $props();

  const asset = $derived($assets.get(src) as Asset.Image | undefined);
  const derivedWidth = $derived(asset?.width ?? width);
  const derivedHeight = $derived(asset?.height ?? height);
</script>

{#if asset}
  <picture
    in:fade|global={{ duration: 300, delay: 300 }}
    out:fade|global={{ duration: 300 }}
    class="select-none {pictureClass ?? ''}">
    {#if UserConfig.BannerImage && UserConfig.BannerImage['format']}
      {#each UserConfig.BannerImage['format'] as format, index}
        <!--
          /@imagetools/... get transformed to ./_app/immutable/assets/...
          while causes problem to page that is 2+ level of depth
          DirtyFix: blindly remove leading dot
        -->
        <source
          srcset={`${Array.isArray(asset['banner']) ? asset['banner'][index] : asset['banner']}`.replace(/^\./, '')}
          width={UserConfig.BannerImage['width']}
          height={UserConfig.BannerImage['height']}
          type={`image/${format}`} />
      {/each}
    {/if}
    <img
      draggable="false"
      itemprop="image"
      class={imgClass}
      {decoding}
      {loading}
      src={asset.original}
      {alt}
      width={derivedWidth}
      height={derivedHeight} />
  </picture>
{:else}
  <img
    draggable="false"
    itemprop="image"
    class={imgClass}
    {decoding}
    {loading}
    {src}
    {alt}
    width={derivedWidth}
    height={derivedHeight} />
{/if}
