<!-- packages/california-tech/src/lib/components/header/ThemeToggleButton.svelte -->
<script lang="ts">
	import { page } from '$app/stores';
	import { enhance } from '$app/forms';
	import { theme } from '$lib/stores/themes';

	// For JS-enabled clients, use the store directly for an instant update.
	function toggleThemeClientSide() {
		theme.toggle();
	}
</script>

<!-- 
  This component uses progressive enhancement.
  - With JS: The `enhance` action intercepts the form submission. We call our
    client-side theme.toggle() for an instant UI update and prevent the form from submitting.
  - Without JS: The form posts to our dedicated API endpoint, which reads the current
    theme from cookies, toggles it, and redirects back.
-->
<form
	action="/api/toggle-theme?redirectTo={$page.url.pathname}"
	method="POST"
	use:enhance={() => {
		toggleThemeClientSide();

		// Cancel the actual form submission since we've already toggled client-side
		return async () => {
			// Don't call update() - we don't need the server response
		};
	}}
>
	<button
		type="submit"
		aria-label="Toggle Dark Mode"
		class="btn active:translate-y-2 duration-600 ease-out group"
	>
		{#key $theme}
			<div
				class="!w-8 !h-8 i-line-md-sunny-outline-loop dark:i-line-md-moon group-hover:(transition-transform duration-300 scale-120 ease-in-out)"
			></div>
		{/key}
	</button>
</form>