import svelte from 'rollup-plugin-svelte';
import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';
import livereload from 'rollup-plugin-livereload';
import { terser } from 'rollup-plugin-terser';
import copy from 'rollup-plugin-copy';

const production = !process.env.ROLLUP_WATCH;

export default {
	input: 'example/main.js',
	output: {
		sourcemap: true,
		format: 'iife',
		name: 'app',
		file: 'example/public/bundle.js'
	},
	plugins: [
		svelte({
			// enable run-time checks when not in production
			dev: !production,
			// we'll extract any component CSS out into
			// a separate file for better performance
			css: css => {
				css.write('example/public/bundle.css');
			}
		}),

		// copy Nimiq web-worker files to example/public dir
		copy({
			targets: [{ src: 'node_modules/@nimiq/core-web/worker*', dest: 'example/public' }],
			copyOnce: true,
			verbose: true,
		}),

		// If you have external dependencies installed from
		// npm, you'll most likely need these plugins. In
		// some cases you'll need additional configuration,
		// consult the documentation for details:
		// https://github.com/rollup/rollup-plugin-commonjs
		resolve({
			browser: true,
			dedupe: importee => importee === 'svelte' || importee.startsWith('svelte/')
		}),
		commonjs(),

		// Watch the `example/public` directory and refresh the
		// browser on changes when not in production
		!production && livereload('example/public'),

		// If we're building for production (npm run build
		// instead of npm run dev), minify
		production && terser()
	],
	watch: {
		clearScreen: false
	}
};
