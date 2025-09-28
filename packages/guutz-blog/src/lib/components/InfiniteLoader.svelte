<script lang="ts">
  import { onMount } from 'svelte';

  let element: HTMLDivElement;

  onMount(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // When the element is intersecting, dispatch a standard CustomEvent
        if (entries[0].isIntersecting) {
          element.dispatchEvent(new CustomEvent('intersect', { bubbles: true }));
        }
      },
      // Trigger when the element is 250px from the bottom of the viewport
      { rootMargin: '0px 0px 250px 0px' } 
    );

    observer.observe(element);

    return () => observer.disconnect();
  });
</script>

<div bind:this={element} style="height: 1px;"></div>