<script lang="ts">
	import Renderer from './Renderer.svelte';
	import type { Post, ClassMap } from '$lib/types.js';

	export let post: Post | null = null;
	export let formatDate: (value: string) => string = (value) =>
		new Date(value).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});

	/**
	 * A map of HTML tags to CSS classes to apply to the rendered output.
	 * @type {ClassMap}
	 */
	export let classMap: ClassMap = {};
</script>

{#if post}
	<slot name="before" {post} />

	<h1 class={classMap.h1 ?? ''}>{post.title}</h1>

	{#if post.publish_at}
		<p class={classMap.p ?? ''}>
			<slot name="date" {post}>
				Published on {formatDate(post.publish_at)}
			</slot>
		</p>
	{/if}

	<div class={classMap.div ?? ''}>
		<slot name="content" {post}>
			<Renderer content={post.content ?? ''} classMap={classMap} />
		</slot>
	</div>

	<slot name="after" {post} />
{:else}
	<slot name="not-found">
		<h1 class={classMap.h1 ?? ''}>Post not found</h1>
	</slot>
{/if}
