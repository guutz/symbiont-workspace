<!-- packages/california-tech/src/lib/components/index_posts.svelte -->
<script lang="ts">
	import { strings } from '$lib/strings';
	import { fade } from 'svelte/transition';
	import IndexPost from '$lib/components/index_post.svelte';
	import type { Post } from '$lib/types/post';

	let {
		posts = [],
		class: className,
		separateByIssueDate = true,
		showDateInCard = false
	}: {
		posts?: Post.Post[];
		class?: string;
		separateByIssueDate?: boolean;
		showDateInCard?: boolean;
	} = $props();

	const groupedByIssueDate = $derived.by(() => {
		const groups: Array<{ issueDate: string; dateLabel: string; posts: Post.Post[] }> = [];
		const map = new Map<string, { issueDate: string; dateLabel: string; posts: Post.Post[] }>();

		for (const post of posts) {
			const publishDate = new Date(post.published);
			const issueDate = !Number.isNaN(publishDate.getTime())
				? publishDate.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
				: '';
			const dateLabel = !Number.isNaN(publishDate.getTime())
				? publishDate.toLocaleDateString('en-US', {
					year: 'numeric',
					month: 'long',
					day: 'numeric',
					timeZone: 'America/Los_Angeles'
				})
				: 'Undated';
			const groupKey = issueDate || dateLabel;

			if (!map.has(groupKey)) {
				const group = { issueDate, dateLabel, posts: [] as Post.Post[] };
				map.set(groupKey, group);
				groups.push(group);
			}

			map.get(groupKey)!.posts.push(post);
		}

		return groups;
	});
</script>

<main
	id="index-posts"
	class="flex flex-col items-center py-4 gap-6 {className ?? ''}"
	itemscope
	itemprop="mainEntityOfPage"
	itemtype="https://schema.org/Blog"
>
	{#if posts.length === 0}
		<div
			class="h-[20rem] flex items-center justify-center"
			in:fade={{ duration: 300, delay: 300 }}
			out:fade={{ duration: 300 }}
		>
			<h2 class="text-3xl">{strings.NoPostFound()}</h2>
		</div>
	{:else}
		{#if separateByIssueDate}
			{#each groupedByIssueDate as issue}
				<section class="issue-section" data-issue-date={issue.issueDate}>
					<div class="issue-divider">{issue.dateLabel}</div>
					<div class="issue-grid">
						{#each issue.posts as p, index (p.slug)}
							<div class="post-wrapper">
								<IndexPost data={p} {index} showDate={showDateInCard} />
							</div>
						{/each}
					</div>
				</section>
			{/each}
		{:else}
			<section class="issue-section">
				<div class="issue-grid">
					{#each posts as p, index (p.slug)}
						<div class="post-wrapper">
							<IndexPost data={p} {index} showDate={showDateInCard} />
						</div>
					{/each}
				</div>
			</section>
		{/if}
	{/if}
</main>

<style lang="scss">
	.issue-divider {
		--at-apply: 'my-4 whitespace-nowrap flex flex-col items-center self-stretch';
		width: 100%;
		box-sizing: border-box;
		gap: 0.5rem;
		line-height: 1;
		&:before {
			content: '';
			width: 100%;
			height: 0;
			border-top: 3px double var(--qwer-text-color);
		}
		&:after {
			content: '';
			width: 100%;
			height: 0;
			border-top: 3px double var(--qwer-text-color);
		}
	}

	.issue-section {
		--at-apply: 'w-full';
	}

	.issue-grid {
		display: grid;
		grid-template-columns: repeat(1, minmax(0, 1fr));
		gap: 0;
		position: relative;
	}

	/* Safety mask: removes any accidental exterior left rail from separator overlap */
	.issue-grid::before {
		content: '';
		position: absolute;
		left: 0;
		top: 0;
		bottom: 0;
		width: 1px;
		background: var(--qwer-bg-color);
		z-index: 6;
		pointer-events: none;
	}

	.post-wrapper {
		--at-apply: 'w-full';
		position: relative;
		padding: 10px;
		box-sizing: border-box;
	}

	.post-wrapper::before,
	.post-wrapper::after {
		content: '';
		position: absolute;
		pointer-events: none;
		display: none;
		background: var(--qwer-text-color);
		z-index: 5;
	}

	/* Mobile (single column): only internal horizontal separators */
	.post-wrapper + .post-wrapper::after {
		display: block;
		top: 0;
		left: 0;
		right: 0;
		height: 1px;
	}

	#index-posts {
		--at-apply: 'flex flex-col items-center w-full';
	}

	@media (min-width: 640px) {
		.issue-grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}

		/* Reset mobile separator rules */
		.post-wrapper::before,
		.post-wrapper::after,
		.post-wrapper + .post-wrapper::after {
			display: none;
		}

		/* Inset vertical separators (do not touch horizontal lines) */
		.post-wrapper:not(:nth-child(3n + 1))::before {
			display: block;
			position: absolute;
			left: 0;
			top: 10px;
			bottom: 10px;
			width: 1px;
		}

		/* Horizontal separators after first row */
		.post-wrapper:nth-child(n + 4)::after {
			display: block;
			top: 0;
			left: 0;
			right: 0;
			height: 1px;
		}
	}

	@media (min-width: 1024px) {
		.issue-grid {
			grid-template-columns: repeat(4, minmax(0, 1fr));
		}

		/* Reset 3-column separator rules */
		.post-wrapper::before,
		.post-wrapper::after,
		.post-wrapper + .post-wrapper::after {
			display: none;
		}

		.post-wrapper:not(:nth-child(4n + 1))::before {
			display: block;
			position: absolute;
			left: 0;
			top: 10px;
			bottom: 10px;
			width: 1px;
		}

		.post-wrapper:nth-child(n + 5)::after {
			display: block;
			top: 0;
			left: 0;
			right: 0;
			height: 1px;
		}
	}

	@media (min-width: 1536px) {
		.issue-grid {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}

		/* Reset 4-column separator rules */
		.post-wrapper::before,
		.post-wrapper::after,
		.post-wrapper + .post-wrapper::after {
			display: none;
		}

		.post-wrapper:not(:nth-child(5n + 1))::before {
			display: block;
			position: absolute;
			left: 0;
			top: 10px;
			bottom: 10px;
			width: 1px;
		}

		.post-wrapper:nth-child(n + 6)::after {
			display: block;
			top: 0;
			left: 0;
			right: 0;
			height: 1px;
		}
	}
</style>
