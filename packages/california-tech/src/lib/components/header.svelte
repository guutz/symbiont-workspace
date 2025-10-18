<!-- packages/california-tech/src/lib/components/header.svelte -->
<script lang="ts">
	import { browser } from '$app/environment';
	import Masthead from '$lib/components/masthead.svelte';
	import ScrollButtons from '$lib/components/scroll_buttons.svelte';
	import DefaultNav from '$lib/components/header/DefaultNav.svelte';

	// These are not props, but window bindings. Initialize them as simple variables.
	let scrollY = $state(0);
	let innerHeight = $state(0);

	// Scroll-related state for ScrollButtons
	const topPercent = 0.025;
	const botPercent = 0.975;
	let scrollHeight = $state(0);
	let lastY = 0;
	let scrollingUp = $state(false);

	// Reactive calculations with Runes
	const scrollThresholdStep = $derived(innerHeight * 0.1);
	const pageEndTopBound = $derived(scrollHeight - innerHeight);
	const scrollPercent = $derived(scrollY / pageEndTopBound || 0);

	$effect(() => {
		// This effect runs whenever scrollY changes
		if (browser) {
			if (Math.abs(lastY - scrollY) > scrollThresholdStep) {
				scrollingUp = lastY - scrollY > 0;
				lastY = scrollY;
			}
		}
	});

	$effect(() => {
		// This effect runs after the DOM updates, replacing afterUpdate
		if (browser) {
			scrollHeight = document.documentElement.scrollHeight;
		}
	});
</script>

<svelte:window bind:scrollY bind:innerHeight />

<header id="header" class="w-screen z-40" aria-label="Header Navigation">
	<Masthead />
	<div class="relative py-2 min-h-4rem max-h-16">
		<DefaultNav />
	</div>
</header>

<ScrollButtons {topPercent} {botPercent} {scrollingUp} {scrollPercent} {scrollHeight} />
