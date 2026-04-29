import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    'bin/vite-patcher': 'src/bin/vite-patcher.mjs'
  }
})
