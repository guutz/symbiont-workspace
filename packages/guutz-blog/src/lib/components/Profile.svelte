<script>
	export let photoSrc = '/mike.jpg';
	export let altText = 'Profile Photo';
</script>

<div class="profile-container">
	<div class="profile-photo">
		<img src={photoSrc} alt={altText} />
	</div>
	<div class="profile-bio">
		<slot></slot>
	</div>
</div>

<style>
	.profile-container {
		display: grid;
		grid-template-columns: 1fr 2fr;
		gap: 2rem;
		align-items: start;
	}

	.profile-photo img {
		width: 100%;
		max-width: 400px;
		border-radius: 4px;
	}

	.profile-bio {
		font-size: 1rem;
		line-height: 1.5;
	}

	.profile-bio :global(p) {
		margin-bottom: 1rem;
		margin-top: 0;
	}

	.profile-bio :global(a) {
		color: rgb(89, 222, 117);
	}

	/* Responsive layout */
	@media (max-width: 768px) {
		.profile-container {
			grid-template-columns: 1fr;
		}

		.profile-photo {
			text-align: center;
		}

		.profile-photo img {
			max-width: 300px;
		}
	}
</style>

