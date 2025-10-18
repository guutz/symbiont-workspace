<!-- packages/california-tech/src/lib/components/index_post.svelte -->
<script lang="ts">
	import type { Post } from '$lib/types/post';
	import { fly } from 'svelte/transition';
	import { dateConfig } from '$config/site';
	import { UserConfig } from '$config/QWER.config';
	import ImgBanner from '$lib/components/image_banner.svelte';

	const { data, index } = $props<{ data: Post.Post; index: number }>();

	const numberPostsEager = 3;

	const postPublishedStr = new Date(data.published).toLocaleString(
		dateConfig.toPublishedString.locales,
		dateConfig.toPublishedString.options
	);
	const postUpdatedStr = new Date(data.updated).toLocaleString(
		dateConfig.toUpdatedString.locales,
		dateConfig.toUpdatedString.options
	);
</script>

{#if data}
	<article
		itemscope
		itemtype="https://schema.org/BlogPosting"
		itemprop="blogPost"
		in:fly|global={{ x: index % 2 ? 100 : -100, duration: 300, delay: 300 }}
		out:fly|global={{ x: index % 2 ? -100 : 100, duration: 300 }}
		class="index-post flex flex-col relative w-full overflow-hidden group shadow-xl hover:(shadow-2xl) transform transition duration-300 md:(w-3xl rounded-lg hover:(scale-105))"
	>
		{#if data.series_tag && data.series_title}
			<div class="series flex items-stretch gap-0 z-10">
				<!-- This is now a simple link that works with and without JS -->
				<a
					href="/?tag={data.series_tag}"
					class="series-tag py-2 cursor-pointer"
					aria-label="Filter by series tag: {data.series_tag}"
				>
					<div class="pl-4 pr-3 text-sm font-bold"># {data.series_tag} {UserConfig.SeriesTagName}</div>
				</a>
				<div class="series-title flex-1 py-2 md:rounded-tr-2xl">
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
					src={data.cover}
					imgClass="z-1 blur-sm op-80 absolute object-cover w-full h-full transition transform duration-300 ease-in-out group-hover:(scale-110 blur-none)"
				/>
				<div class="coverStyle-IN z-2 px-8 pt-4 pb-6 flex flex-col gap-2 bg-white/[0.25] dark:bg-black/[0.25]">
					<time class="dt-published op-80 group-hover:font-600" datetime={data.published} itemprop="datePublished">
						{postPublishedStr}
					</time>
					<time class="hidden dt-updated" datetime={data.updated} itemprop="dateModified">
						{postUpdatedStr}
					</time>
					<h2 class="text-2xl font-bold line-clamp-2 text-ellipsis group-hover:font-900" itemprop="name headline">
						<a href={data.slug} class="u-url title-link-orange-500-orange-500" itemprop="url">
							{data.title}
						</a>
					</h2>
					<p class="text-lg line-clamp-2 group-hover:font-600" itemprop="description">{data.summary}</p>
				</div>
			{:else}
				<div class:flex-col={['TOP', 'BOT'].indexOf(data.coverStyle) !== -1} class="flex md:border-none relative">
					<div
						class="overflow-hidden
            {['TOP', 'BOT'].indexOf(data.coverStyle) !== -1 ? 'coverStyle-TOPnBOT' : ''}
            {['RIGHT', 'LEFT'].indexOf(data.coverStyle) !== -1 ? 'coverStyle-RnL' : ''}"
						class:order-first={data.coverStyle === 'TOP' || data.coverStyle === 'LEFT'}
						class:order-last={data.coverStyle === 'BOT' || data.coverStyle === 'RIGHT'}
					>
						<a href={data.slug} class="cursor-pointer" itemprop="url">
							<ImgBanner
								src={data.cover}
								loading={index < numberPostsEager ? 'eager' : 'lazy'}
								decoding={index < numberPostsEager ? 'auto' : 'async'}
								imgClass="op-90 group-hover:scale-110 transition transform duration-300 ease-in-out object-cover w-full h-full"
							/>
						</a>
					</div>
					<div class="index-post-panel px-8 pt-4 pb-6 flex flex-col gap-2 flex-1">
						<time class="dt-published op-80 group-hover:font-600" datetime={data.published} itemprop="datePublished">
							{postPublishedStr}
						</time>
						<time class="hidden dt-updated" datetime={data.updated} itemprop="dateModified">
							{postUpdatedStr}
						</time>
						<h2 class="text-2xl font-bold line-clamp-2 text-ellipsis group-hover:font-900" itemprop="name headline">
							<a href={data.slug} class="u-url title-link-orange-500-orange-500" itemprop="url">
								{data.title}
							</a>
						</h2>
						<p class="text-lg line-clamp-2 group-hover:font-600" itemprop="description">{data.summary}</p>
					</div>
				</div>
			{/if}
		{:else}
			<div class="index-post-panel flex flex-col flex-1 gap-2 px-8 pt-4 pb-6">
				<time class="dt-published op-80 group-hover:font-600" datetime={data.published} itemprop="datePublished">
					{postPublishedStr}
				</time>
				<time class="hidden dt-updated" datetime={data.updated} itemprop="dateModified">
					{postUpdatedStr}
				</time>

				<h2 class="text-2xl font-bold line-clamp-2 text-ellipsis group-hover:font-900" itemprop="name headline">
					<a href={data.slug} class="u-url title-link-orange-500-orange-500" itemprop="url">
						{#if data.title}
							{data.title}
						{:else}
							No Title
						{/if}
					</a>
				</h2>
				{#if data.summary}
					<p class="text-lg line-clamp-2 group-hover:font-600" itemprop="description">{data.summary}</p>
				{/if}
			</div>
		{/if}
	</article>
{/if}

<style lang="scss">
	.index-post {
		border-top: var(--qwer-border-mobile);
		border-bottom: var(--qwer-border-mobile);
		color: var(--qwer-text-color);
		h2 a {
			color: var(--qwer-title-color);

			&:hover {
				color: var(--qwer-title-hover-color);
			}
		}
	}

	.coverStyle-TOPnBOT {
		height: var(--qwer-cover-height-TOPnBOT-mobile);
	}
	.coverStyle-RnL {
		width: var(--qwer-cover-width-RnL-mobile);
	}

	.coverStyle-IN {
		height: var(--qwer-cover-height-IN-mobile);
	}

	@media (min-width: 768px) {
		.index-post {
			border: var(--qwer-border-desktop);
		}

		.coverStyle-TOPnBOT {
			height: var(--qwer-cover-height-TOPnBOT);
		}
		.coverStyle-RnL {
			width: var(--qwer-cover-width-RnL);
		}
		.coverStyle-IN {
			height: var(--qwer-cover-height-IN);
		}
	}

	.index-post-panel {
		background-color: var(--qwer-bg-color);
		min-height: var(--qwer-min-height);
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
