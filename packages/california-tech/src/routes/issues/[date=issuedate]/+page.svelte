<script lang="ts">
	import { page } from '$app/state';
	import { replaceState } from '$app/navigation';
	import { browser } from '$app/environment';
	import { fly } from 'svelte/transition';
	import type { Post } from '$lib/types/post';
	import { mergeUniqueBy } from '$lib/utils/collections';
	import {
		buildCountLoadMoreHref,
		fetchPostPreviewPage,
		getActiveIssueDateFromRoot,
		observeInfiniteScroll
	} from '$lib/utils/feed-client';

	import IndexPosts from '$lib/components/index_posts.svelte';

	let { data } = $props();

	let posts = $state<Post.Post[]>([]);
	let hasMore = $state(false);
	let nextOffset = $state<number>(0);
	let isLoadingMore = $state(false);
	let hasInitializedFromServer = $state(false);
	let sentinel = $state<HTMLDivElement | null>(null);
	let issueFeedRoot = $state<HTMLElement | null>(null);

	const serverPosts = $derived(data.posts ?? []);
	const query = $derived(page.url.searchParams.get('q') || '');
	const activeTag = $derived(page.url.searchParams.get('tag') || '');
	const batchSize = $derived(data.batchSize ?? 30);
	const issueDate = $derived(data.issueDate ?? '');
	const isFilterMode = $derived(Boolean(query || activeTag));
	const renderedPosts = $derived.by(() => (hasInitializedFromServer ? posts : serverPosts));

	const loadMoreHref = $derived.by(() => {
		return buildCountLoadMoreHref({
			basePath: `/issues/${issueDate}`,
			hasMore,
			searchParams: page.url.searchParams,
			nextCountHint: data.nextCount,
			shownCount: data.shownCount,
			renderedCount: posts.length,
			batchSize
		});
	});

	async function loadMorePosts() {
		if (!browser || isLoadingMore || !hasMore) return;

		isLoadingMore = true;
		try {
			const payload = await fetchPostPreviewPage(fetch, {
				offset: nextOffset,
				limit: batchSize,
				query,
				tag: activeTag,
				beforeDate: issueDate
			});
			posts = mergeUniqueBy(posts, payload.posts, (post) => post.slug);
			nextOffset = payload.nextOffset;
			hasMore = payload.hasMore;
		} catch (error) {
			console.error('Failed to load more issue posts:', error);
		} finally {
			isLoadingMore = false;
		}
	}

	$effect(() => {
		posts = serverPosts;
		hasMore = Boolean(data.hasMore);
		nextOffset = data.shownCount ?? serverPosts.length;
		hasInitializedFromServer = true;
	});

	$effect(() => {
		if (!browser || !sentinel || !hasMore) return;
		return observeInfiniteScroll(sentinel, () => void loadMorePosts());
	});

	$effect(() => {
		if (!browser || !issueFeedRoot || renderedPosts.length === 0) return;
		const root = issueFeedRoot;

		let ticking = false;
		const updateIssueUrl = () => {
			ticking = false;
			const activeIssueDate = getActiveIssueDateFromRoot(root, issueDate);

			if (!activeIssueDate) return;
			const params = page.url.searchParams.toString();
			const targetPath = `/issues/${activeIssueDate}`;
			const targetUrl = params ? `${targetPath}?${params}` : targetPath;
			const currentPathAndQuery = `${window.location.pathname}${window.location.search}`;
			if (currentPathAndQuery !== targetUrl) {
				replaceState(targetUrl, page.state);
			}
		};

		const onScrollOrResize = () => {
			if (ticking) return;
			ticking = true;
			window.requestAnimationFrame(updateIssueUrl);
		};

		window.addEventListener('scroll', onScrollOrResize, { passive: true });
		window.addEventListener('resize', onScrollOrResize);

		return () => {
			window.removeEventListener('scroll', onScrollOrResize);
			window.removeEventListener('resize', onScrollOrResize);
		};
	});
</script>

<div
	itemscope
	itemtype="https://schema.org/Blog"
	itemprop="blog"
	class="flex justify-center items-start max-w-[90rem] mx-auto px-4"
>
	<div
		in:fly|global={{ y: 100, duration: 300, delay: 300 }}
		out:fly|global={{ y: -100, duration: 300 }}
		class="h-feed min-h-[50vh] w-full"
		bind:this={issueFeedRoot}
	>
		<IndexPosts
			posts={renderedPosts}
			separateByIssueDate={!isFilterMode}
			showDateInCard={isFilterMode}
		/>

		{#if browser && hasMore}
			<div bind:this={sentinel} class="h-8 w-full" aria-hidden="true"></div>
		{/if}

		{#if browser && isLoadingMore}
			<div class="py-4 text-center text-sm op-70">Loading more posts...</div>
		{/if}

		{#if browser && hasMore && !isLoadingMore}
			<div class="py-6 flex justify-center">
				<button
					type="button"
					onclick={() => void loadMorePosts()}
					class="border px-4 py-2 rounded hover:op-80 transition"
				>
					Load more
				</button>
			</div>
		{/if}

		{#if !browser && loadMoreHref}
			<div class="py-6 flex justify-center">
				<a href={loadMoreHref} class="border px-4 py-2 rounded hover:op-80 transition">
					Load more
				</a>
			</div>
		{/if}
	</div>
</div>
