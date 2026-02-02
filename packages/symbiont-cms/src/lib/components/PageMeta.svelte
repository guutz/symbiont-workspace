<script lang="ts">
	import type { Post } from '../types.js';

	/** Post data */
	export let post: Post;

	/** Custom date formatter function */
	export let formatDate: (date: string) => string = (date) => {
		return new Date(date).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		});
	};

	/** Show updated date if different from publish date */
	export let showUpdated: boolean = true;

	/** Show tags */
	export let showTags: boolean = true;

	/** Show reading time estimate (assumes ~200 words per minute) */
	export let showReadingTime: boolean = false;

	/** Custom class mappings for styling */
	export let classMap: {
		container?: string;
		dateContainer?: string;
		publishDate?: string;
		updatedDate?: string;
		separator?: string;
		tagsContainer?: string;
		tag?: string;
		readingTime?: string;
	} = {};

	// Calculate reading time (rough estimate: 200 words per minute)
	$: readingTime = post.content
		? Math.ceil(post.content.split(/\s+/).length / 200)
		: 0;

	// Check if post was updated significantly after publishing
	$: wasUpdated =
		showUpdated &&
		post.updated_at &&
		post.publish_at &&
		new Date(post.updated_at).getTime() - new Date(post.publish_at).getTime() > 86400000; // 1 day
</script>

<div class={classMap.container || 'post-meta'}>
	<div class={classMap.dateContainer || 'post-dates'}>
		{#if post.publish_at}
			<time datetime={post.publish_at} class={classMap.publishDate || 'publish-date'}>
				{formatDate(post.publish_at)}
			</time>
		{/if}

		{#if wasUpdated}
			<span class={classMap.separator || 'separator'}>·</span>
			<time datetime={post.updated_at} class={classMap.updatedDate || 'updated-date'}>
				Updated {formatDate(post.updated_at!)}
			</time>
		{/if}

		{#if showReadingTime && readingTime > 0}
			<span class={classMap.separator || 'separator'}>·</span>
			<span class={classMap.readingTime || 'reading-time'}>
				{readingTime} min read
			</span>
		{/if}
	</div>

	{#if showTags && post.tags && post.tags.length > 0}
		<div class={classMap.tagsContainer || 'post-tags'}>
			{#each post.tags as tag}
				<span class={classMap.tag || 'tag'}>
					{tag}
				</span>
			{/each}
		</div>
	{/if}
</div>

<style>
	/* Default styles - easily overridden via classMap */
	.post-meta {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		margin-bottom: 1.5rem;
		color: #666;
		font-size: 0.875rem;
	}

	.post-dates {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.updated-date {
		font-style: italic;
		opacity: 0.8;
	}

	.post-tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.tag {
		display: inline-block;
		padding: 0.25rem 0.75rem;
		background: #f3f4f6;
		border-radius: 9999px;
		font-size: 0.75rem;
		color: #374151;
	}

	.separator {
		opacity: 0.5;
	}
</style>
