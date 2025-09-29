<script lang="ts">
	import Renderer from '../Renderer.svelte';
	import type { Post } from '../types.js';

	export let post: Post | null = null;
	export let formatDate: (value: string) => string = (value) =>
		new Date(value).toLocaleDateString(undefined, {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
</script>

{#if post}
	<slot name="before" {post} />

	<h1 class="symbiont-blog-title">{post.title}</h1>

	{#if post.publish_at}
		<p class="symbiont-blog-meta">
			<slot name="date" {post}>
				Published on {formatDate(post.publish_at)}
			</slot>
		</p>
	{/if}

	<div class="symbiont-blog-content">
		<slot name="content" {post}>
			<Renderer content={post.content ?? ''} />
		</slot>
	</div>

	<slot name="after" {post} />
{:else}
	<slot name="not-found">
		<h1 class="symbiont-blog-title">Post not found</h1>
	</slot>
{/if}

<style>
	:global(.symbiont-blog-title) {
		font-size: clamp(2rem, 3vw, 3rem);
		font-weight: 700;
		margin-bottom: 0.75rem;
		line-height: 1.1;
	}

	:global(.symbiont-blog-meta) {
		color: rgba(0, 0, 0, 0.6);
		margin-bottom: 2rem;
		font-size: 0.95rem;
	}

	:global(.symbiont-blog-content) {
		line-height: 1.7;
		font-size: 1.05rem;
	}

	:global(.symbiont-blog-content h2) {
		margin-top: 2.5rem;
	}

	:global(.symbiont-blog-content p + p) {
		margin-top: 1.25rem;
	}
</style>
