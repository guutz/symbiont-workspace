<script lang="ts">
  import tippy from '$lib/actions/tippy';

  let { tags = [] }: { tags?: Array<string | string[] | Record<string, string | string[]>> } = $props();
  const formattedTags = $derived.by(() =>
    tags
      ?.map((c) => {
        if (typeof c === 'string') return { category: 'tags', name: c, url: `/?tags=${c}` };
        if (Array.isArray(c)) {
          return c.map((v) => {
            return { category: 'tags', name: v, url: `/?tags=${v}` };
          });
        }
        const [key, value] = Object.entries(c)[0];
        if (Array.isArray(value)) {
          return value.map((v) => {
            return { category: key, name: v, url: `/?tags-${key}=${v}` };
          });
        }
        return { category: key, name: value, url: `/?tags-${key}=${value}` };
      })
      .flat(),
  );
</script>

{#if formattedTags}
  <div class="divider"></div>

  <div class="flex gap-x-2 mx8 flex-wrap">
    {#each formattedTags as tag}
      <a use:tippy class="btn btn-ghost" rel="tag" href={tag.url} aria-label="{tag.category}: {tag.name}">
        #{tag.name}
      </a>
    {/each}
  </div>
{/if}
