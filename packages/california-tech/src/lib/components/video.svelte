<script lang="ts">
  let {
    class: className,
    autoplay = true,
    loop = true,
    poster = undefined,
    width = undefined,
    height = undefined,
    title = undefined,
    id = undefined,
    webm = undefined,
    mp4 = undefined,
  }: {
    class?: string;
    autoplay?: boolean;
    loop?: boolean;
    poster?: string;
    width?: string;
    height?: string;
    title?: string;
    id?: string;
    webm?: string;
    mp4?: string;
  } = $props();
</script>

<video
  {id}
  {autoplay}
  {loop}
  {width}
  {height}
  class="!h-full !w-auto m-auto {className ?? ''}"
  controls
  {poster}
  data-poster={poster}>
  {#if mp4}
    <source {title} src={mp4} type="video/mp4" />
  {/if}
  {#if webm}
    <source {title} src={webm} type="video/webm" />
  {/if}
  <track kind="captions" />
</video>
