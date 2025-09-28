<script lang="ts">
	import { onMount } from 'svelte';
	import { browser } from '$app/environment';

	onMount(() => {
		// Initialize Ko-fi widget - script is already loaded in app.html
		if (browser && typeof (window as any).kofiWidgetOverlay !== 'undefined') {
			(window as any).kofiWidgetOverlay.draw('michaelguutz', {
				'type': 'floating-chat',
				'floating-chat.donateButton.text': 'Leave me a tip',
				'floating-chat.donateButton.background-color': '#ffffff',
				'floating-chat.donateButton.text-color': '#323842'
			});
		}
	});
</script>

<header>
	<div class="header-container">
		<div class="logo-name">
			<a href="/">
				<img class="banana" src="/banana.png" alt="Banana" />
				<span class="name">Michael Gutierrez</span>
			</a>
		</div>

		<nav>
			<ul>
				<li><a href="/">About</a></li>
				<li><a href="/resume">Resume</a></li>
				<li><a href="https://linkedin.com/in/michaelguutz" target="_blank">LinkedIn</a></li>
			</ul>
		</nav>
	</div>
</header>

<main>
	<slot />
</main>

<footer>
	<div class="banana-footer">
		<img src="/banana.png" alt="Banana" />
		<p>Time flies like an arrow. Fruit flies like a banana.</p>
	</div>
</footer>

<style>
	/* Header styles */
	header {
		background-color: #f5f5f5;
		padding: 1rem 0;
		width: 100%;
		color: #333;
	}

	.header-container {
		width: 70%;
		max-width: 1100px;
		margin: 0 auto;
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 0 1rem;
	}

	.logo-name {
		display: flex;
		align-items: center;
	}

	.logo-name a {
		display: flex;
		align-items: center;
		text-decoration: none;
		color: inherit;
	}

	.banana {
		height: 30px;
		width: auto;
		margin-right: 1rem;
	}

	.name {
		font-size: 1.5rem;
		font-weight: 700;
		/* color: #999; */
	}

	/* Navigation */
	nav ul {
		display: flex;
		list-style: none;
		margin: 0;
		padding: 0;
		gap: 1.5rem;
	}

	nav a {
		text-decoration: none;
		color: #333;
		font-weight: 500;
	}

	nav a:hover {
		text-decoration: underline;
	}

	/* Main content */
	main {
		width: 70%;
		max-width: 1100px;
		margin: 2rem auto;
		padding: 0 1rem;
		min-height: calc(100vh - 300px); /* Ensures footer stays at bottom */
	}

	/* Footer */
	footer {
		margin-top: 2rem;
		padding: 1rem 0;
		text-align: center;
	}

	.banana-footer {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		color: #888;
		font-style: italic;
	}

	.banana-footer img {
		width: 40px;
		height: auto;
	}

	/* Responsive adjustments */
	@media (max-width: 768px) {
		.header-container,
		main {
			width: 90%;
		}

		.header-container {
			flex-direction: column;
			gap: 1rem;
		}

		nav ul {
			flex-wrap: wrap;
			justify-content: center;
		}
	}

	@media print {
		header {
			display: none
		}

		footer {
			display: none
		}
	}
</style>
