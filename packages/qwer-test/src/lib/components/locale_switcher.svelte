<script lang="ts">
  export let options: string[] = ['en'];
  export let value: string = options[0];

  const updateLocale = (event: Event) => {
    const target = event.target as HTMLSelectElement;
    value = target.value;
  };
</script>

<select on:change={updateLocale} value={value} style="background-color: var(--qwer-bg-color);">
  {#each options as option}
    <option value={option} selected={option === value}>{option}</option>
  {/each}
</select>
