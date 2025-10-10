<script lang="ts">
	import type { TocItem } from '../types.js';
	import { onMount } from 'svelte';

	/** Table of contents items */
	export let items: TocItem[];

	/** Show active section highlighting */
	export let highlightActive: boolean = true;

	/** Custom class mappings for styling */
	export let classMap: {
		container?: string;
		list?: string;
		item?: string;
		link?: string;
		activeLink?: string;
		nestedList?: string;
	} = {};

	let activeId: string = '';

	onMount(() => {
		if (!highlightActive) return;

		const observer = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						activeId = entry.target.id;
					}
				});
			},
			{
				rootMargin: '-80px 0px -80% 0px',
				threshold: 1.0
			}
		);

		// Observe all headings
		items.forEach((item) => {
			const element = document.getElementById(item.id);
			if (element) {
				observer.observe(element);
			}
			// Also observe nested items
			if (item.children) {
				item.children.forEach((child) => {
					const childElement = document.getElementById(child.id);
					if (childElement) {
						observer.observe(childElement);
					}
				});
			}
		});

		return () => observer.disconnect();
	});

	function isActive(id: string): boolean {
		return highlightActive && activeId === id;
	}
</script>

<nav class={classMap.container || 'toc-container'} aria-label="Table of Contents">
	<ul class={classMap.list || 'toc-list'}>
		{#each items as item}
			<li class={classMap.item || 'toc-item'}>
				<a
					href="#{item.id}"
					class="{classMap.link || 'toc-link'} {isActive(item.id) ? classMap.activeLink || 'active' : ''}"
				>
					{item.text}
				</a>
				{#if item.children && item.children.length > 0}
					<ul class={classMap.nestedList || 'toc-nested-list'}>
						{#each item.children as child}
							<li class={classMap.item || 'toc-item'}>
								<a
									href="#{child.id}"
									class="{classMap.link || 'toc-link'} {isActive(child.id) ? classMap.activeLink || 'active' : ''}"
								>
									{child.text}
								</a>
								{#if child.children && child.children.length > 0}
									<ul class={classMap.nestedList || 'toc-nested-list'}>
										{#each child.children as grandchild}
											<li class={classMap.item || 'toc-item'}>
												<a
													href="#{grandchild.id}"
													class="{classMap.link || 'toc-link'} {isActive(grandchild.id) ? classMap.activeLink || 'active' : ''}"
												>
													{grandchild.text}
												</a>
											</li>
										{/each}
									</ul>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</li>
		{/each}
	</ul>
</nav>

<style>
	/* Default styles - easily overridden via classMap */
	.toc-container {
		position: sticky;
		top: 2rem;
		padding: 1rem;
		background: #f9fafb;
		border-radius: 0.5rem;
		max-height: calc(100vh - 4rem);
		overflow-y: auto;
	}

	.toc-list {
		list-style: none;
		padding: 0;
		margin: 0;
	}

	.toc-item {
		margin: 0.25rem 0;
	}

	.toc-link {
		display: block;
		padding: 0.25rem 0.5rem;
		color: #6b7280;
		text-decoration: none;
		border-radius: 0.25rem;
		transition: all 0.2s;
		font-size: 0.875rem;
	}

	.toc-link:hover {
		color: #111827;
		background: #e5e7eb;
	}

	.toc-link.active {
		color: #2563eb;
		background: #dbeafe;
		font-weight: 500;
	}

	.toc-nested-list {
		list-style: none;
		padding-left: 1rem;
		margin: 0.25rem 0;
	}

	/* Scrollbar styling */
	.toc-container::-webkit-scrollbar {
		width: 4px;
	}

	.toc-container::-webkit-scrollbar-thumb {
		background: #d1d5db;
		border-radius: 2px;
	}

	.toc-container::-webkit-scrollbar-thumb:hover {
		background: #9ca3af;
	}
</style>
