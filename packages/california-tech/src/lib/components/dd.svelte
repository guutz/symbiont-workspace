<!-- packages/california-tech/src/lib/components/dd.svelte -->
<script lang="ts">
	import type { DD } from '$lib/types/dd';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import type { Snippet } from 'svelte';

	// Import the component itself for recursion. This replaces <svelte:self>.
	import Self from './dd.svelte';

	let {
		nav,
		class: className,
		children,
	} = $props<{
		nav: DD.Nav | DD.Link;
		class?: string;
		children: Snippet;
	}>();

	const uniqueId = `dd-checkbox-${Math.random().toString(36).slice(2, 9)}`;

	// Use $state for the checked status to enhance with hover.
	let isChecked = $state(false);

	function handleNavigation(e: Event, url?: string) {
		if (!url) return;
		e.preventDefault(); // Stop the <a> tag's default behavior.
		goto(url);
		isChecked = false; // Close the dropdown after navigation.
	}
</script>

<div
	class="relative {className ?? ''}"
	role="group"
	onmouseenter={() => {
		if (browser) isChecked = true;
	}}
	onmouseleave={() => {
		if (browser) isChecked = false;
	}}
>
	<!-- Hidden checkbox that holds the open/closed state -->
	<input type="checkbox" id={uniqueId} class="hidden-checkbox" bind:checked={isChecked} />

	<!-- The label acts as the clickable toggle for the checkbox -->
	<label for={uniqueId} class="cursor-pointer">
		{@render children()}
	</label>

	<!-- The dropdown menu -->
	{#if 'links' in nav && nav.links}
		<div
			class="dropdown-menu absolute w-max z-50 bg-white dark:bg-black rounded-lg"
			class:pos-up={nav.orientation === 0}
			class:pos-right={nav.orientation === 1}
			class:pos-down={nav.orientation === 2}
			class:pos-left={nav.orientation === 3}
		>
			<ul
				class="flex flex-col tracking-wide rounded-lg border-1 border-black dark:border-white"
				role="menu"
			>
				{#each nav.links as link}
					<li
						role="menuitem"
						class="text-black hover:bg-black/[0.2] dark:(hover:bg-white/[0.2] text-white) first:rounded-t-lg last:rounded-b-lg"
					>
						{#if 'links' in link}
							<!-- Recursive call using the self-imported component -->
							<Self nav={link}>
								<a
									href={link.url}
									class="p-4 flex items-center justify-between w-full {$page.url.pathname === link.url
										? 'font-bold'
										: ''}"
								>
									<span>{link.name}</span>
									{#if link.links}
										<span
											class="!w-[1.5rem] !h-[1.5rem] display-inline-block ml-auto"
											class:i-mdi-chevron-right={link.orientation === 1}
										></span>
									{/if}
								</a>
							</Self>
						{:else}
							<a
								href={link.url}
								onclick={(e) => handleNavigation(e, link.url)}
								class="block p-4 {$page.url.pathname === link.url ? 'font-bold' : ''}"
							>
								{link.name}
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>

<style>
	.hidden-checkbox {
		display: none;
	}

	.dropdown-menu {
		display: none; /* Hidden by default */
	}

	/* This is the "Checkbox Hack": when the checkbox is checked, show the menu */
	.hidden-checkbox:checked ~ .dropdown-menu {
		display: block;
	}

	.pos-up {
		--at-apply: 'bottom-full left-0 mb-2';
	}
	.pos-right {
		--at-apply: 'top-0 left-full ml-2';
	}
	.pos-down {
		--at-apply: 'top-full left-0 mt-2';
	}
	.pos-left {
		--at-apply: 'top-0 right-full mr-2';
	}
</style>

