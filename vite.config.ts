import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// The build is one self-contained dist/index.html, so it also opens straight from disk.
export default defineConfig({
  plugins: [viteSingleFile()],
  // the CSS minifier keeps only -webkit-backdrop-filter, which Chrome ignores, so the panels lose their blur
  build: { cssMinify: false },
  server: { host: '127.0.0.1', port: 8770, strictPort: true },
  preview: { host: '127.0.0.1', port: 8771, strictPort: true },
});
