<script lang="ts">
  import { BlogPostPage } from 'symbiont-cms';
  import type { PageData } from './$types';
  import { dateConfig } from '$config/site';
  
  import '$lib/styles/prism.scss';
  import '$lib/styles/prose.scss';
  import 'katex/dist/katex.min.css';

  export let data: PageData;

  // Format date using QWER's date config
  const formatDate = (value: string) => {
    return new Date(value).toLocaleString(
      dateConfig.toPublishedString.locales,
      dateConfig.toPublishedString.options
    );
  };
</script>

<svelte:head>
  {#if data.post}
    <title>{data.post.title}</title>
    <meta name="description" content={data.post.content?.substring(0, 160) ?? ''} />
  {/if}
</svelte:head>

<div class="max-w-4xl mx-auto px-4 py-8">
	<BlogPostPage 
		post={data.post} 
		{formatDate}
		classMap={{
			h1: 'text-4xl font-bold mb-4 p-name',
			p: 'text-gray-600 dark:text-gray-400 mb-6',
			div: 'prose prose-lg dark:prose-invert max-w-none'
		}}
	/>
</div>
