<script lang="ts">
	export let data;
</script>

<article>
	{#if data.metadata?.title}
		<h1>{data.metadata.title}</h1>
	{/if}
	{#if data.metadata?.date}
		<p class="text-gray-500">
			Last updated on: {new Date(data.metadata.date).toLocaleString('en-US', {
				year: 'numeric',
				month: 'long',
				day: 'numeric',
				hour: 'numeric',
				minute: 'numeric'
			})}
		</p>
	{/if}

	<svelte:component this={data.component} />
</article>

<style>
	article {
		font-family: Ubuntu, ui-sans-serif;
	}
</style>
