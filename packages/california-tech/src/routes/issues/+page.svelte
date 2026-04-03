<script lang="ts">
	import { page } from '$app/state';
	import { browser } from '$app/environment';
	import { fly } from 'svelte/transition';
	import type { Issue } from '$lib/types/index';
	import { mergeUniqueBy } from '$lib/utils/collections';
	import { buildCountLoadMoreHref, fetchIssueCardsPage, observeInfiniteScroll } from '$lib/utils/feed-client';

	let { data } = $props();

	let issues = $state<Issue.Card[]>([]);
	let hasMore = $state(false);
	let nextOffset = $state(0);
	let isLoadingMore = $state(false);
	let hasInitializedFromServer = $state(false);
	let sentinel = $state<HTMLDivElement | null>(null);

	const serverIssues = $derived(data.issues ?? []);
	const renderedIssues = $derived.by(() => (hasInitializedFromServer ? issues : serverIssues));
	const batchSize = $derived(data.batchSize ?? 24);
	const loadMoreHref = $derived.by(() => {
		return buildCountLoadMoreHref({
			basePath: '/issues',
			hasMore,
			searchParams: page.url.searchParams,
			nextCountHint: data.nextCount,
			shownCount: data.shownCount,
			renderedCount: renderedIssues.length,
			batchSize
		});
	});

	async function loadMoreIssues() {
		if (!browser || isLoadingMore || !hasMore) return;

		isLoadingMore = true;
		try {
			const payload = await fetchIssueCardsPage(fetch, {
				offset: nextOffset,
				limit: batchSize
			});
			issues = mergeUniqueBy(issues, payload.issues, (issue) => issue.date);
			nextOffset = payload.nextOffset;
			hasMore = payload.hasMore;
		} catch (error) {
			console.error('Failed to load more issues:', error);
		} finally {
			isLoadingMore = false;
		}
	}

	$effect(() => {
		issues = serverIssues;
		hasMore = Boolean(data.hasMore);
		nextOffset = data.shownCount ?? serverIssues.length;
		hasInitializedFromServer = true;
	});

	$effect(() => {
		if (!browser || !sentinel || !hasMore) return;
		return observeInfiniteScroll(sentinel, () => void loadMoreIssues());
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
	>
		{#if renderedIssues.length === 0}
			<div class="h-[20rem] flex items-center justify-center">
				<h2 class="text-3xl">No issues found</h2>
			</div>
		{:else}
			<div class="issues-grid">
				{#each renderedIssues as issue (issue.date)}
					{@const websiteHref = `/issues/${issue.date}`}
					{@const pdfHref = `/issues/${issue.date}.pdf`}
					<article class="issue-card">
						<div class="issue-cover-wrap">
							{#if issue.cover}
								<img src={issue.cover} alt={`Cover for ${issue.label}`} class="issue-cover" loading="lazy" decoding="async" />
							{:else}
								<div class="issue-cover-placeholder">{issue.label}</div>
							{/if}
						</div>
						<div class="issue-body">
							<h2 class="issue-title">{issue.label}</h2>
							<div class="issue-links">
								{#if issue.hasWebsite}
									<a href={websiteHref} class="issue-link">View issue articles</a>
								{/if}
								{#if issue.hasPdf}
									<a href={pdfHref} class="issue-link" target="_blank" rel="noopener noreferrer">Open PDF</a>
								{/if}
							</div>
						</div>
					</article>
				{/each}
			</div>
		{/if}

		{#if browser && hasMore}
			<div bind:this={sentinel} class="h-8 w-full" aria-hidden="true"></div>
		{/if}

		{#if browser && isLoadingMore}
			<div class="py-4 text-center text-sm op-70">Loading more issues...</div>
		{/if}

		{#if browser && hasMore && !isLoadingMore}
			<div class="py-6 flex justify-center">
				<button
					type="button"
					onclick={() => void loadMoreIssues()}
					class="border px-4 py-2 rounded hover:op-80 transition"
				>
					Load more issues
				</button>
			</div>
		{/if}

		{#if !browser && loadMoreHref}
			<div class="py-6 flex justify-center">
				<a href={loadMoreHref} class="border px-4 py-2 rounded hover:op-80 transition">
					Load more issues
				</a>
			</div>
		{/if}
	</div>
</div>

<style lang="scss">
	.issues-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 1.25rem;
	}

	.issue-card {
		--at-apply: 'border-1 overflow-hidden';
		border-color: var(--qwer-border-color);
		background-color: var(--qwer-bg-color);
		color: var(--qwer-text-color);
	}

	.issue-cover-wrap {
		--at-apply: 'w-full';
	}

	.issue-cover {
		--at-apply: 'w-full h-auto block';
	}

	.issue-cover-placeholder {
		--at-apply: 'w-full flex items-center justify-center px-4 text-center font-semibold op-70';
		aspect-ratio: 11 / 17;
		border: 1px dashed color-mix(in oklab, var(--qwer-border-color) 80%, transparent);
		background: color-mix(in oklab, var(--qwer-bg-color) 94%, var(--qwer-border-color));
	}

	.issue-body {
		--at-apply: 'px-5 py-4 flex flex-col gap-2';
	}

	.issue-title {
		--at-apply: 'text-xl font-bold m-0';
		color: var(--qwer-title-color);
	}

	.issue-links {
		--at-apply: 'flex flex-wrap gap-3 mt-2';
	}

	.issue-link {
		--at-apply: 'text-sm font-semibold underline underline-offset-4';
		color: var(--qwer-title-color);

		&:hover {
			color: var(--qwer-title-hover-color);
		}
	}

	@media (min-width: 768px) {
		.issues-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (min-width: 1100px) {
		.issues-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}
	}

	@media (min-width: 1500px) {
		.issues-grid {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}
	}
</style>
