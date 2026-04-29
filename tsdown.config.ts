import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    'bin/vite-patches': 'src/bin/vite-patches.mjs'
  }
})
