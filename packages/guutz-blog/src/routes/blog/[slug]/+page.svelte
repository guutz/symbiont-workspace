<script lang="ts">
	import { BlogPostPage } from 'symbiont-cms';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<BlogPostPage 
	post={data.post} 
	classMap={{
		h1: 'text-3xl font-bold mb-4',
		p: 'text-gray-600 mb-6',
		div: 'prose prose-lg'
	}}
/>