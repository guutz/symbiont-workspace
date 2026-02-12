<script lang="ts">
  let { name, icon }: { name: string; icon?: string } = $props();
</script>

<div class="flex items-center justify-start cursor-pointer">
  <div class="{icon} !w8 !h8 shrink-0"></div>
  <div class="px2">{name}</div>
</div>
