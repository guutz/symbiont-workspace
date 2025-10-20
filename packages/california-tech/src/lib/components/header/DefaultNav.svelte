<!-- packages/california-tech/src/lib/components/header/DefaultNav.svelte -->
<script lang="ts">
	import { navConfig, mobilenavConfig } from '$config/site';
	import Dropdown from '$lib/components/dd.svelte';
	import ThemeToggleButton from '$lib/components/header/ThemeToggleButton.svelte';
</script>

<div class="flex items-center justify-items-center max-w-7xl mx-auto px-4 sm:px-8 h-full">
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

  <div class="ml-auto flex items-center gap-2">
		<!-- Tags Toggle Button (works without JS via checkbox) -->
		<label for="tags-toggle" class="btn active:translate-y-2 duration-600 ease-out group cursor-pointer hidden md:block">
			<div class="!w-8 !h-8 i-mdi-tag-multiple group-hover:(transition-transform duration-300 scale-120 ease-in-out)"></div>
		</label>
		
		<ThemeToggleButton />
	</div>
</div>
