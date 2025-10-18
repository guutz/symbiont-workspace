<!-- packages/california-tech/src/lib/components/masthead.svelte -->
<script lang="ts">
	import { techConfig } from '$config/tech';
	import TechLogo from './TechLogo.svelte';

	// The `resetHome` function is no longer needed.
	// The `<a>` tag with `href="/"` handles resetting to the homepage correctly
	// for both JS (with client-side routing) and no-JS users (with a page reload).

	function getCurrentDate(): string {
		const date = new Date();
		const options: Intl.DateTimeFormatOptions = {
			weekday: 'long',
			year: 'numeric',
			month: 'long',
			day: 'numeric'
		};
		return date.toLocaleDateString('en-US', options);
	}

	// Use Runes for the date. It's initialized with the server-rendered date.
	let currentDate = $state(getCurrentDate());

	// An effect replaces onMount. This runs on the client to ensure the
	// date is updated to the user's local time zone after hydration.
	$effect(() => {
		currentDate = getCurrentDate();
	});
</script>

<!-- Banner linking to home -->
<a href="/" class="block w-full px-4" aria-label="Return to home">
	<div
		id="banner"
		class="max-w-7xl mx-auto overflow-hidden cursor-pointer hover:opacity-90 transition-opacity"
	>
		<TechLogo className="w-full h-auto object-cover pt-4" />
	</div>
</a>

<!-- Info row below banner -->
<div id="info-bar" class="w-full py-2 px-8">
	<div
		class="flex justify-center md:justify-between items-center text-sm max-w-7xl mx-auto border-t-2 border-b-2 border-black dark:border-white py-2"
	>
		<span class="font-semibold hidden md:inline">{techConfig.volume}</span>
		<span class="hidden md:inline">{techConfig.location}</span>
		<span>{currentDate}</span>
		<span class="hidden md:inline">{techConfig.email}</span>
	</div>
</div>

<style>
	#info-bar,
	#banner {
		background-color: var(--qwer-bg-color);
		color: var(--qwer-text-color);
	}
</style>
