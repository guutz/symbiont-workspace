<script lang="ts">
	import type { ContentFeatures } from '../types.js';

	/**
	 * Features detected in the content.
	 * Component will load only the necessary CSS assets.
	 */
	export let features: ContentFeatures;

	/**
	 * CDN URL for Prism themes.
	 * @default 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes'
	 */
	export let prismCdnUrl: string = 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes';

	/**
	 * Prism theme to load.
	 * @default 'prism-tomorrow'
	 */
	export let prismTheme: string = 'prism-tomorrow';

	/**
	 * CDN URL for KaTeX CSS.
	 * @default 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css'
	 */
	export let katexCdnUrl: string = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';

	/**
	 * CDN URL for Mermaid CSS (if needed).
	 * Mermaid usually inlines styles, but you can provide custom CSS.
	 */
	export let mermaidCssUrl: string = '';

	// Determine what to load
	$: hasSyntaxHighlighting =
		features.syntaxHighlighting && features.syntaxHighlighting.length > 0;
	$: hasMath = features.math === true;
	$: hasMermaid = features.mermaid === true;
</script>

<svelte:head>
	<!-- Load Prism CSS only if code blocks are present -->
	{#if hasSyntaxHighlighting}
		<link rel="stylesheet" href="{prismCdnUrl}/{prismTheme}.css" />
	{/if}

	<!-- Load KaTeX CSS only if math is present -->
	{#if hasMath}
		<link rel="stylesheet" href={katexCdnUrl} />
	{/if}

	<!-- Load Mermaid CSS only if diagrams are present -->
	{#if hasMermaid && mermaidCssUrl}
		<link rel="stylesheet" href={mermaidCssUrl} />
	{/if}
</svelte:head>

<!--
  Optional: You can also load JS libraries here if needed.
  However, Prism/KaTeX should be loaded server-side during markdown processing.
  This component is primarily for conditional CSS loading.
-->
