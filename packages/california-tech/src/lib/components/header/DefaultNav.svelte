<!-- packages/california-tech/src/lib/components/header/DefaultNav.svelte -->
<script lang="ts">
	import { navConfig, mobilenavConfig } from '$config/site';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import Dropdown from '$lib/components/dd.svelte';
	import ThemeToggleButton from '$lib/components/header/ThemeToggleButton.svelte';

	let searchExpanded = $state(false);
	let searchQuery = $state('');
	let searchInput = $state<HTMLInputElement>();

	function toggleSearch() {
		searchExpanded = !searchExpanded;
		if (searchExpanded && browser) {
			// Focus input after animation
			setTimeout(() => searchInput?.focus(), 100);
		}
	}

	function handleSearch(e: Event) {
		e.preventDefault();
		if (searchQuery.trim()) {
			goto(`/?q=${encodeURIComponent(searchQuery.trim())}`);
			searchExpanded = false;
			searchQuery = '';
		}
	}

	// Popular tags (configure these based on your actual tags)
	const popularTags = ['News', 'Sports', 'Opinion', 'Features'];
</script>

<div class="flex items-center justify-between max-w-7xl mx-auto px-4 sm:px-8 h-full gap-4">
	<!-- Mobile hamburger menu -->
	<div class="lg:hidden rounded-lg btn btn-ghost !p-0">
		<Dropdown nav={mobilenavConfig} class="text-sm p-2">
			{#snippet children()}
				<div aria-label="Navigation Menu" class="flex items-center">
					<div class="i-mdi-hamburger-menu !w-[1.5rem] !h-[1.5rem]"></div>
				</div>
			{/snippet}
		</Dropdown>
	</div>

	<!-- Desktop navigation links -->
	<div class="hidden lg:flex">
		{#each navConfig as n}
			<Dropdown class="text-lg px-3 py-2 btn btn-ghost" nav={n}>
				{#snippet children()}
					<a href={n.url} class="flex items-center cursor-pointer gap-2">
						{n.name}
						{#if 'links' in n && n.links}
							<span
								class="!w-[1.5rem] !h-[1.5rem] display-inline-block"
								class:i-mdi-chevron-up={n.orientation === 0}
								class:i-mdi-chevron-right={n.orientation === 1}
								class:i-mdi-chevron-down={n.orientation === 2}
								class:i-mdi-chevron-left={n.orientation === 3}
							></span>
						{/if}
					</a>
				{/snippet}
			</Dropdown>
		{/each}
	</div>

	<!-- Popular Tags (Desktop only) -->
	<div class="hidden lg:flex items-center gap-2 border-l border-black dark:border-white pl-4">
		{#each popularTags as tag}
			<a 
				href="/?tag={tag}" 
				class="text-sm px-2 py-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
				class:font-bold={$page.url.searchParams.get('tag') === tag}
			>
				{tag}
			</a>
		{/each}
		<a 
			href="/categories" 
			class="text-sm px-2 py-1 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors border border-black/20 dark:border-white/20"
		>
			All Categories
		</a>
	</div>

	<!-- Right side controls -->
	<div class="ml-auto flex items-center gap-2">
		<!-- Search Bar (JS enabled only) -->
		<div class="flex items-center js-only-search">
			{#if searchExpanded}
				<form 
					onsubmit={handleSearch}
					class="flex items-center border-2 border-black dark:border-white rounded overflow-hidden transition-all duration-300"
				>
					<input
						bind:this={searchInput}
						bind:value={searchQuery}
						type="search"
						name="q"
						placeholder="Search articles..."
						class="px-3 py-1 bg-transparent focus:outline-none w-[200px] sm:w-[300px]"
					/>
					<button 
						type="submit" 
						class="px-3 py-1 hover:bg-black/10 dark:hover:bg-white/10"
						aria-label="Submit search"
					>
						<div class="i-carbon-search !w-5 !h-5"></div>
					</button>
					<button 
						type="button"
						onclick={toggleSearch}
						class="px-3 py-1 hover:bg-black/10 dark:hover:bg-white/10 border-l border-black/20 dark:border-white/20"
						aria-label="Close search"
					>
						<div class="i-carbon-close !w-5 !h-5"></div>
					</button>
				</form>
			{:else}
				<button 
					onclick={toggleSearch}
					class="btn active:translate-y-2 duration-600 ease-out group"
					aria-label="Open search"
				>
					<div class="!w-8 !h-8 i-carbon-search group-hover:(transition-transform duration-300 scale-120 ease-in-out)"></div>
				</button>
			{/if}
		</div>
		
		<ThemeToggleButton />
	</div>
</div>

<!-- No-JS Search Form (appears below header when JS disabled) -->
<noscript>
	<style>
		.js-only-search { display: none !important; }
	</style>
	<div class="max-w-7xl mx-auto px-4 sm:px-8 pb-2">
		<form action="/" method="GET" class="flex items-center border-2 border-black dark:border-white rounded overflow-hidden">
			<input
				type="search"
				name="q"
				placeholder="Search articles..."
				class="flex-1 px-3 py-2 bg-transparent"
			/>
			<button type="submit" class="px-4 py-2 hover:bg-black/10 dark:hover:bg-white/10">
				Search
			</button>
		</form>
	</div>
</noscript>

<!-- No-JS Search Form (replaces search icon when JS disabled) -->
<!-- <noscript>
	<style>
		.js-only-search { display: none !important; }
	</style>
	<div class="flex items-center">
		<form action="/" method="GET" class="flex items-center border-2 border-black dark:border-white rounded overflow-hidden">
			<input
				type="search"
				name="q"
				placeholder="Search..."
				class="px-3 py-1 bg-transparent w-[150px] sm:w-[200px]"
			/>
			<button type="submit" class="px-3 py-1 hover:bg-black/10 dark:hover:bg-white/10" aria-label="Search">
				<div class="i-carbon-search !w-5 !h-5"></div>
			</button>
		</form>
	</div>
</noscript> -->

<style>
	input::placeholder {
		color: var(--qwer-input-placeholder-text-color);
	}
</style>