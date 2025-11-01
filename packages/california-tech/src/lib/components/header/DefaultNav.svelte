<!-- packages/california-tech/src/lib/components/header/DefaultNav.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import ThemeToggleButton from '$lib/components/header/ThemeToggleButton.svelte';

	let searchExpanded = $state(false);
	let searchQuery = $state('');
	let searchInput = $state<HTMLInputElement>();

	function toggleSearch() {
		searchExpanded = !searchExpanded;
		if (searchExpanded && browser) {
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

	// Navigation sections - customize these!
	const sections = [
		{ name: 'News', href: '/?tag=News' },
		{ name: 'Sports', href: '/?tag=Sports' },
		{ name: 'Opinion', href: '/?tag=Opinion' },
		{ name: 'Features', href: '/?tag=Features' },
		{ name: 'All Categories', href: '/categories' },
	];
</script>

<div class="flex items-center justify-between max-w-7xl mx-auto px-4 sm:px-8 h-full gap-4">
	<!-- Main navigation links -->
	<nav class="hidden lg:flex items-center gap-1" aria-label="Primary">
		{#each sections as section}
			<a 
				href={section.href}
				class="px-3 py-2 hover:bg-black/10 dark:hover:bg-white/10 rounded transition-colors"
				class:font-bold={$page.url.searchParams.get('tag') === section.name || 
				                  ($page.url.pathname === '/categories' && section.href === '/categories')}
			>
				{section.name}
			</a>
		{/each}
	</nav>

	<!-- Mobile: Hamburger dropdown -->
	<details class="lg:hidden relative" role="navigation">
		<summary class="px-3 py-2 cursor-pointer list-none hover:bg-black/10 dark:hover:bg-white/10 rounded">
			Menu
		</summary>
		<div class="absolute top-full left-0 mt-2 bg-white dark:bg-black border-2 border-black dark:border-white rounded-lg shadow-lg min-w-[200px] z-50">
			{#each sections as section}
				<a
					href={section.href}
					class="block px-4 py-2 hover:bg-black/10 dark:hover:bg-white/10 first:rounded-t-lg last:rounded-b-lg"
					class:font-bold={$page.url.searchParams.get('tag') === section.name}
				>
					{section.name}
				</a>
			{/each}
		</div>
	</details>

	<!-- Right side: Search + Theme -->
	<div class="ml-auto flex items-center gap-2">
		<!-- Search (with no-JS fallback) -->
		<div class="flex items-center js-only-search">
			{#if searchExpanded}
				<form 
					onsubmit={handleSearch}
					class="flex items-center border-2 border-black dark:border-white rounded overflow-hidden"
				>
					<input
						bind:this={searchInput}
						bind:value={searchQuery}
						type="search"
						name="q"
						placeholder="Search..."
						class="px-3 py-1 bg-transparent focus:outline-none w-[200px] sm:w-[300px]"
					/>
					<button type="submit" class="px-3 py-1 hover:bg-black/10 dark:hover:bg-white/10" aria-label="Submit search">
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
					class="btn group"
					aria-label="Open search"
				>
					<div class="!w-8 !h-8 i-carbon-search group-hover:scale-110 transition-transform"></div>
				</button>
			{/if}
		</div>
		
		<ThemeToggleButton />
	</div>
</div>

<!-- No-JS Search Fallback -->
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

<style>
	input::placeholder {
		color: var(--qwer-input-placeholder-text-color);
	}
	
	/* Hide default details marker */
	summary::-webkit-details-marker {
		display: none;
	}
</style>