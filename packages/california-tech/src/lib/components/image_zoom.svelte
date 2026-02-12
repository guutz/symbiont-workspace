<script lang="ts">
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  import type { Asset } from '$generated/asset';
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  import { assets } from '$generated/assets';
  import { UserConfig } from '$config/QWER.config';
  import { fade } from 'svelte/transition';
  import { onMount } from 'svelte';
  import mediumZoom from 'medium-zoom';

  let imgElement = $state<HTMLElement | null>(null);
  // Reference to the container element for responsive adjustments
  let containerElement = $state<HTMLElement | null>(null);

  import type { Snippet } from 'svelte';

  let {
    class: className,
    captionClass = undefined,
    src,
    alt = src,
    loading = 'lazy',
    decoding = 'async',
    width = undefined,
    height = undefined,
    children,
  }: {
    class?: string;
    captionClass?: string;
    src: string;
    alt?: string;
    loading?: 'eager' | 'lazy';
    decoding?: 'async' | 'sync' | 'auto';
    width?: string | number;
    height?: string | number;
    children?: Snippet;
  } = $props();

  const asset = $derived($assets.get(src));
  const resolutions = $derived.by(() =>
    UserConfig['ExtraResolutions'] &&
    Object.entries(UserConfig.ExtraResolutions)
      .filter((e) => asset && asset[e[0] as keyof Asset.Image])
      .sort((a, b) => {
        return +b[0] - +a[0];
      }),
  );

  const getSrcset = function (res: string, index: number) {
    if (!asset) return;

    let _srcset = asset[res];

    if (_srcset && Array.isArray(_srcset)) {
      return _srcset[index];
    } else {
      return _srcset;
    }
  };

  const derivedWidth = $derived(asset?.width ?? width);
  const derivedHeight = $derived(asset?.height ?? height);

  // Function for responsive image size adjustment
  const updateImageSize = () => {
    if (imgElement && containerElement) {
      const containerWidth = containerElement.offsetWidth;
      imgElement.style.width = `${containerWidth}px`;
      imgElement.style.height = 'auto';
    }
  };

  onMount(() => {
    if (imgElement) {
      mediumZoom(imgElement, {
        scrollOffset: 0,
        background: 'rgba(25, 18, 25, .9)',
      });
    }

    // Add window resize listener for responsive adjustments
    window.addEventListener('resize', updateImageSize);
    updateImageSize();

    // Clean up event listener on component unmount
    return () => {
      window.removeEventListener('resize', updateImageSize);
    };
  });

  $effect(() => {
    updateImageSize();
  });
</script>

<figure
  bind:this={containerElement}
  in:fade|global={{ duration: 300, delay: 300 }}
  out:fade|global={{ duration: 300 }}
  class="my6 select-none w-full">
  {#if asset}
    <picture class="block w-full">
      {#if resolutions}
        {#each resolutions as [res, meta]}
          {#each meta.format as format, index}
            <!--
              /@imagetools/... get transformed to ./_app/immutable/assets/...
              while causes problem to page that is 2+ level of depth
              DirtyFix: blindly remove leading dot
            -->
            <source
              media={`(min-width: ${meta.minWidth})`}
              srcset={`${getSrcset(res, index)}`.replace(/^\./, '')}
              width={meta.width}
              type={`image/${format}`} />
          {/each}
        {/each}
      {/if}
      {#if UserConfig['ExtraResolutions'] && Object.keys(UserConfig['ExtraResolutions']).length}
        {#each Object.entries(UserConfig['ExtraResolutions']) as format, index}
          <!--
            /@imagetools/... get transformed to ./_app/immutable/assets/...
            while causes problem to page that is 2+ level of depth
            DirtyFix: blindly remove leading dot
          -->
          <source
            type={`image/${format}`}
            srcset={`${
              Array.isArray(asset['extraFormats']) ? asset['extraFormats'][index] : asset['extraFormats']
            }`.replace(/^\./, '')} />
        {/each}
      {/if}
      <img
        bind:this={imgElement}
        draggable="false"
        itemprop="image"
        class="z-50 m-auto md:rounded-2xl md:shadow-xl {className ?? 'w-full h-auto max-w-full object-contain'}"
        style="aspect-ratio: {derivedWidth} / {derivedHeight};"
        {decoding}
        {loading}
        src={asset.original}
        {alt}
        width={derivedWidth}
        height={derivedHeight} />
    </picture>
  {:else}
    <img
      bind:this={imgElement}
      draggable="false"
      itemprop="image"
      class="z-50 m-auto md:rounded-2xl md:shadow-xl {className ?? 'w-full h-auto max-w-full object-contain'}"
        style="aspect-ratio: {derivedWidth} / {derivedHeight};"
      {decoding}
      {loading}
      {src}
      {alt}
      width={derivedWidth}
      height={derivedHeight} />
  {/if}
  <figcaption class={captionClass ?? 'italic op70 text-center mt2'}>
    {@render children?.()}
  </figcaption>
</figure>
