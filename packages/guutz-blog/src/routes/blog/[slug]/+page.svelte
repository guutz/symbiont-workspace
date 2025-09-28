<script lang="ts">
	import { BlogPostPage } from 'symbiont-cms';
	import type { PageData } from './$types';

	export let data: PageData;
</script>

<BlogPostPage post={data.post} />