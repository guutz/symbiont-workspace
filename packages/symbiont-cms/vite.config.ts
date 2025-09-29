import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	ssr: {
		noExternal: ['symbiont-cms']
	},
	define: {
		// Ensure process.cwd() works in server context
		'process.cwd': 'process.cwd'
	}
});
