<script lang="ts">
	import { PostPage } from 'symbiont-cms';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<PostPage 
	post={data.post} 
	classMap={{
		h1: 'text-3xl font-bold mb-4',
		p: 'text-gray-600 mb-6',
		div: 'prose prose-lg'
	}}
/>