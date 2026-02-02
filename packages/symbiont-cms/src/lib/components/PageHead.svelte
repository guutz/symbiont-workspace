<script lang="ts">
	import type { Post } from '../types.js';

	/** Post data for meta tags */
	export let post: Post;

	/** Site name for og:site_name */
	export let siteName: string = '';

	/** Base URL for og:url and og:image (e.g., 'https://example.com') */
	export let baseUrl: string = '';

	/** Author name for meta:author */
	export let author: string = '';

	/** Twitter handle (e.g., '@username') for twitter:site */
	export let twitterHandle: string = '';

	// Construct full URL
	$: fullUrl = baseUrl && post.slug ? `${baseUrl}/${post.slug}` : '';

	// Use post summary or generate from content
	$: description = post.summary || post.content?.slice(0, 160) || '';

	// Format publish date
	$: publishDate = post.publish_at ? new Date(post.publish_at).toISOString() : '';
</script>

<svelte:head>
	<!-- Primary Meta Tags -->
	<title>{post.title}</title>
	<meta name="title" content={post.title} />
	<meta name="description" content={description} />
	{#if author}
		<meta name="author" content={author} />
	{/if}

	<!-- Open Graph / Facebook -->
	<meta property="og:type" content="article" />
	<meta property="og:title" content={post.title} />
	<meta property="og:description" content={description} />
	{#if fullUrl}
		<meta property="og:url" content={fullUrl} />
	{/if}
	{#if siteName}
		<meta property="og:site_name" content={siteName} />
	{/if}
	{#if post.cover_image}
		<meta property="og:image" content={post.cover_image} />
	{/if}
	{#if publishDate}
		<meta property="article:published_time" content={publishDate} />
	{/if}
	{#if post.updated_at}
		<meta property="article:modified_time" content={new Date(post.updated_at).toISOString()} />
	{/if}
	{#if post.tags && post.tags.length > 0}
		{#each post.tags as tag}
			<meta property="article:tag" content={tag} />
		{/each}
	{/if}

	<!-- Twitter -->
	<meta property="twitter:card" content="summary_large_image" />
	<meta property="twitter:title" content={post.title} />
	<meta property="twitter:description" content={description} />
	{#if twitterHandle}
		<meta property="twitter:site" content={twitterHandle} />
	{/if}
	{#if post.cover_image}
		<meta property="twitter:image" content={post.cover_image} />
	{/if}

	<!-- Canonical URL -->
	{#if fullUrl}
		<link rel="canonical" href={fullUrl} />
	{/if}
</svelte:head>
