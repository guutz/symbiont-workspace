<!-- packages/california-tech/src/lib/components/index_post.svelte -->
<script lang="ts">
	import type { Post } from '$lib/types/post';
	import { UserConfig } from '$config/QWER.config';
	import ImgBanner from '$lib/components/image_banner.svelte';

	const { data, index, showDate = false } = $props<{ data: Post.Post; index: number; showDate?: boolean }>();

	const numberPostsEager = 3;
	const showPreviewSummary = $derived(data.showPreviewSummary ?? true);
	const transformedCover = $derived(
		data.cover?.includes('supabase.co')
			? `${data.cover}?width=640&quality=72&format=webp`
			: data.cover
	);
	const formattedDate = $derived.by(() => {
		const publishDate = new Date(data.published);
		if (Number.isNaN(publishDate.getTime())) {
			return '';
		}

		return publishDate.toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'short',
			day: 'numeric',
			timeZone: 'America/Los_Angeles'
		});
	});

</script>

{#if data}
	<article
		itemscope
		itemtype="https://schema.org/BlogPosting"
		itemprop="blogPost"
		class="index-post flex flex-col relative w-full overflow-hidden group"
	>
		{#if data.series_tag && data.series_title}
			<div class="series flex items-stretch gap-0 z-10">
				<a
					href="/?tag={data.series_tag}"
					class="series-tag py-2 cursor-pointer"
					aria-label="Filter by series tag: {data.series_tag}"
				>
					<div class="pl-4 pr-3 text-sm font-bold"># {data.series_tag} {UserConfig.SeriesTagName}</div>
				</a>
				<div class="series-title flex-1 py-2">
					<div
						class="px-3 text-sm font-semibold tracking-wide align-middle whitespace-normal line-clamp-1 text-ellipsis"
					>
						{data.series_title}
					</div>
				</div>
			</div>
		{/if}

		{#if data.cover && data.coverStyle !== 'NONE'}
			{#if data.coverStyle === 'IN'}
				<ImgBanner
					loading={index < numberPostsEager ? 'eager' : 'lazy'}
					decoding={index < numberPostsEager ? 'auto' : 'async'}
					src={transformedCover ?? data.cover}
					imgClass="z-1 blur-sm op-80 absolute object-cover w-full h-full transition transform duration-300 ease-in-out group-hover:(scale-110 blur-none)"
				/>
				<div class="coverStyle-IN z-2 px-6 pt-4 pb-6 flex flex-col gap-2 bg-white/[0.25] dark:bg-black/[0.25]">
					<h2 class="text-xl font-bold" itemprop="name headline">
						<a href={data.slug} class="u-url title-link" itemprop="url">
							{data.title || 'No Title'}
						</a>
					</h2>
					<div class="metadata">
						{#if data.authors && data.authors.length > 0}
							<p class="author" itemprop="author">
								{data.authors.join(', ')}
							</p>
						{/if}
						{#if showDate && formattedDate}
							<p class="published-date">{formattedDate}</p>
						{/if}
						{#if data.tags && data.tags.length > 0}
							<p class="category">
								{data.tags[0]}
							</p>
						{/if}
					</div>
					{#if showPreviewSummary && data.summary_html}
						<p class="summary whitespace-pre-line" itemprop="description">
							{@html data.summary_html}
						</p>
					{:else if showPreviewSummary && data.summary}
						<p class="summary whitespace-pre-line" itemprop="description">{data.summary}</p>
					{/if}
				</div>
			{:else}
				<div class="flex flex-col">
					<div class="overflow-hidden">
						<a href={data.slug} class="cursor-pointer" itemprop="url">
							<ImgBanner
								src={transformedCover ?? data.cover}
								loading={index < numberPostsEager ? 'eager' : 'lazy'}
								decoding={index < numberPostsEager ? 'auto' : 'async'}
								imgClass="op-90 group-hover:scale-105 transition transform duration-300 ease-in-out w-full h-auto"
							/>
						</a>
					</div>
					<div class="index-post-panel px-1 pt-4 pb-6 flex flex-col gap-2 flex-1">
						<h2 class="text-xl font-bold" itemprop="name headline">
							<a href={data.slug} class="u-url title-link" itemprop="url">
								{data.title || 'No Title'}
							</a>
						</h2>
						<div class="metadata">
							{#if data.authors && data.authors.length > 0}
								<p class="author" itemprop="author">
									{data.authors.join(', ')}
								</p>
							{/if}
							{#if showDate && formattedDate}
								<p class="published-date">{formattedDate}</p>
							{/if}
							{#if data.tags && data.tags.length > 0}
								<p class="category">
									{data.tags[0]}
								</p>
							{/if}
						</div>
						{#if showPreviewSummary && data.summary_html}
							<p class="summary whitespace-pre-line" itemprop="description">
								{@html data.summary_html}
							</p>
						{:else if showPreviewSummary && data.summary}
							<p class="summary whitespace-pre-line" itemprop="description">{data.summary}</p>
						{/if}
					</div>
				</div>
			{/if}
		{:else}
			<div class="index-post-panel flex flex-col flex-1 gap-2 px-1 pt-4 pb-6">
				<h2 class="text-xl font-bold" itemprop="name headline">
					<a href={data.slug} class="u-url title-link" itemprop="url">
						{data.title || 'No Title'}
					</a>
				</h2>
				<div class="metadata">
					{#if data.authors && data.authors.length > 0}
						<p class="author" itemprop="author">
							{data.authors.join(', ')}
						</p>
					{/if}
					{#if showDate && formattedDate}
						<p class="published-date">{formattedDate}</p>
					{/if}
					{#if data.tags && data.tags.length > 0}
						<p class="category">
							{data.tags[0]}
						</p>
					{/if}
				</div>
				{#if showPreviewSummary && data.summary_html}
					<p class="summary whitespace-pre-line" itemprop="description">
						{@html data.summary_html}
					</p>
				{:else if showPreviewSummary && data.summary}
					<p class="summary whitespace-pre-line" itemprop="description">{data.summary}</p>
				{/if}
			</div>
		{/if}
	</article>
{/if}

<style lang="scss">
	.index-post {
		display: flex;
		flex-direction: column;
		aspect-ratio: 1 / 2;
		border: 0;
		box-shadow: none;
		color: var(--qwer-text-color);
		background-color: transparent;
		
		h2 a {
			color: var(--qwer-title-color);

			&:hover {
				color: var(--qwer-title-hover-color);
			}
		}
	}

	.metadata {
		--at-apply: 'flex gap-2 items-center text-sm border-b-1 pb-2 mb-1';
		border-color: var(--qwer-metadata-border-color);
	}

	.author {
		--at-apply: 'font-600 m-0';
	}

	.category {
		--at-apply: 'm-0 op-70';
	}

	.published-date {
		--at-apply: 'm-0 op-70';
	}

	.summary {
		--at-apply: 'text-base leading-relaxed m-0';
		flex: 1;
		min-height: 0;
		overflow: hidden;
		display: block;
		text-align: justify;
	}

	.coverStyle-IN {
		flex: 1;
		min-height: 0;
	}

	.index-post-panel {
		background-color: transparent;
		flex: 1;
		min-height: 0;
	}

	.series {
		border-bottom: 3px solid var(--qwer-series-border-color);
		box-shadow: 0 0 3px var(--qwer-series-border-color);
	}

	.series-tag {
		background-color: var(--qwer-series-bg-color);
		color: var(--qwer-series-tag-text-color);
		&:hover {
			background-color: var(--qwer-series-bg-hover-color);
		}
	}

	.series-title {
		background-color: var(--qwer-bg-color);
		color: var(--qwer-series-title-text-color);
	}
</style>
