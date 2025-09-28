import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
export default defineConfig({
	plugins: [sveltekit()],
	assetsInclude: ['**/*.md'],
	optimizeDeps: {
		include: ['three', 'three-globe', 'three/examples/jsm/controls/OrbitControls.js']
	},
	ssr: {
		noExternal: ['three', 'three-globe']
	}
});
