import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
	plugins: [preact(), tailwindcss()],
	resolve: {
		alias: {
			'@': fileURLToPath(new URL('./src', import.meta.url)),
		},
	},
	build: {
		// 'hidden' writes .map files without a trailing sourceMappingURL comment:
		// production stack traces stay symbolisable without shipping the map to users.
		sourcemap: 'hidden',
		// Stated rather than inherited: the app needs WASM plus module workers, so an
		// upgrade that changes Vite's default target must not change the output silently.
		target: 'baseline-widely-available',
		// Vite's default, pinned so a chunk growing past it is a visible warning.
		chunkSizeWarningLimit: 500,
		rolldownOptions: {
			output: {
				// Rolldown's replacement for Rollup's manualChunks. `advancedChunks`
				// still exists in rolldown 1.x but is deprecated in favour of this.
				// Vendors change far less often than app code, so each group below
				// becomes a chunk whose hash survives edits to src.
				codeSplitting: {
					groups: [
						{
							name: 'pdfjs',
							test: /node_modules[\\/]pdfjs-dist[\\/]/,
							priority: 30,
						},
						{
							name: 'typst',
							test: /node_modules[\\/]@myriaddreamin[\\/]/,
							priority: 20,
						},
						{
							name: 'codemirror',
							test: /node_modules[\\/](@codemirror|@lezer|codemirror-lang-typst)[\\/]/,
							priority: 10,
						},
						{
							name: 'vendor',
							test: /node_modules[\\/]/,
							priority: 1,
						},
					],
				},
			},
		},
	},
	worker: {
		// Every worker is created as `new Worker(new URL(...), { type: 'module' })`;
		// Vite's 'iife' default would emit a classic script that cannot be loaded that way.
		format: 'es',
	},
})
