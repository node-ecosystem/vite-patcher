import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: {
    'bin/pwa': 'src/patches/pwa.js'
  },
  format: ['esm'],
  clean: true,
  skipNodeModulesBundle: true,
  dts: false
})
