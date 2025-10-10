<script lang="ts">
	import type { PageData } from './$types';
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	
	// Styles
	import '$lib/styles/prism.scss';
	import '$lib/styles/prose.scss';
	import 'katex/dist/katex.min.css';
	
	// QWER Components
	import PostToc from '$lib/components/toc_root.svelte';
	import PostHeading from '$lib/components/post_heading.svelte';
	import SEO from '$lib/components/post_SEO.svelte';
	import TagsSection from '$lib/components/post_tags.svelte';
	
	// Stores
	import { tocCur } from '$stores/toc';
	
	export let data: PageData;
	
	// Data is already in QWER format from the server
	$: post = data.post;
	
	let observer: IntersectionObserver;
	let postElement: HTMLElement;
	
	// TOC scroll tracking
	$: if (postElement) {
		if (observer) observer.disconnect();
		
		observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					const heading = entry.target.getAttribute('toc-heading');
					if (heading) {
						if (entry.isIntersecting) {
							tocCur.addTOC(heading);
						} else {
							tocCur.delTOC(heading);
						}
					}
				});
			},
			{ rootMargin: '-64px 0px -64px 0px' },
		);
		
		// Assign toc-heading attributes
		const article = postElement.querySelector('article');
		if (article?.children) {
			let curHeading = '';
			for (let i = 0; i < article.children.length; i++) {
				const child = article.children[i];
				if (/^h[1-6]/i.test(child.tagName)) {
					curHeading = `#${child.id}`;
				}
				child.setAttribute('toc-heading', curHeading);
				observer.observe(child);
			}
		}
	}
	
	onMount(() => {
		// Scroll to hash after mount
		const hash = window.location.hash;
		if (hash) {
			setTimeout(() => {
				const heading = document.getElementById(hash.substring(1));
				const headerNav = document.getElementById('header-nav');
				if (heading && headerNav) {
					const top = heading.offsetTop - headerNav.clientHeight;
					window.scrollTo({ top, behavior: 'smooth' });
				}
			}, 100);
		}
	});
</script>

<SEO {post} />

<main
	in:fade|global={{ duration: 300, delay: 300 }}
	out:fade|global={{ duration: 300 }}
	class="flex flex-nowrap justify-center">
	<div class="max-w-screen-md flex-1"></div>
	
	<article
		id="post"
		itemscope
		itemtype="https://schema.org/BlogPosting"
		itemprop="blogPost"
		class="h-entry flex-none flex flex-col max-w-[55rem] w-full xl:(rounded-t-2xl)">
		<div in:fade|global={{ duration: 300, delay: 300 }} class="max-w-[55rem]">
			<PostHeading data={post} />
		</div>
		
		<div
			in:fade|global={{ duration: 300, delay: 300 }}
			bind:this={postElement}
			itemprop="articleBody"
			class="e-content prose prose-slate dark:prose-invert max-w-[55rem]">
			{@html data.html}
		</div>
	</article>
	
	<div
		in:fly|global={{ x: 100, y: -100, duration: 300, delay: 300 }}
		out:fly|global={{ x: 100, y: 100, duration: 300 }}
		class="max-w-screen-md flex-1 relative">
		{#if post.toc && post.toc.length > 0}
			<PostToc toc={post.toc} />
		{/if}
	</div>
</main>

<div
	in:fade|global={{ duration: 300, delay: 300 }}
	out:fade|global={{ duration: 300 }}
	class="flex flex-nowrap justify-center">
	<div class="max-w-screen-md flex-1"></div>
	
	<div id="post-bottom" class="flex-none flex flex-col max-w-[55rem] w-full xl:(rounded-b-2xl)">
		{#if post.tags && post.tags.length > 0}
			<TagsSection tags={post.tags as any} />
		{/if}
		
		<div class="divider"></div>
		
		<!-- TODO: Next/prev navigation - implement when we have post store with ordering -->
		<!-- For now, users can navigate via home page or tags -->
		
	</div>
	
	<div class="max-w-screen-md flex-1"></div>
</div>

<style lang="scss">
	#post {
		background-color: var(--qwer-bg-color);
	}
	
	#post-bottom {
		background-color: var(--qwer-bg-color);
	}
</style>
