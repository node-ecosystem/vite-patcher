# `pwa` patch

Quickly inject and configure `vite-plugin-pwa` into your existing `vite.config`.

### 🚀 Usage

Use your local package manager:

| Package Manager | Command
| - | -
| **npm** | `npm run vite-patcher pwa`
| **yarn** | `yarn vite-patcher pwa`
| **pnpm** | `pnpm vite-patcher pwa`

Or use `npx`/`dlx` (without installing `vite-patcher` dependency) to execute this patch via your package runner:

| Package Manager | Command
| - | -
| **npm** | `npx vite-patcher pwa`
| **yarn** | `yarn dlx vite-patcher pwa`
| **pnpm** | `pnpm dlx vite-patcher pwa`

### 🩹 What it patches

#### 1. `vite.config.ts` (or `.js`, `.mjs`)
Adds the `VitePWA` as import and into your `plugins` array (use `process.env.NODE_ENV === 'production'` to use plugin only during the production build and not the development runtime).

```diff
+import { VitePWA } from 'vite-plugin-pwa'

export default {
  plugins: [
+    ...(process.env.NODE_ENV === 'production' ? [VitePWA({
+      registerType: 'autoUpdate',
+      devOptions: { type: 'module' },
+      manifest: {
+        name: 'My App',
+        short_name: 'MyApp',
+        theme_color: '#3F51B5',
+        background_color: '#3367D6',
+        icons: [{ src: '/icons/logo-192.png', sizes: '192x192', type: 'image/png' }]
+      }
+    }).map((plugin) => ({
+      ...plugin,
+      // Prevent from generating registerSW.js inside /dist/server
+      applyToEnvironment(environment: { name: string }) {
+        return environment.name === 'client'
+      }
+    }))] : [])
  ]
}
```

#### 2. Vike Integration (`+Head` & `manifest.webmanifest`)
If your project is using [Vike](https://vike.dev):

- 2.1 Injects the manifest link into your `/pages/+Head.tsx` (or `.jsx`, create it if missing)
  ```diff
  export function Head() {
    return (
      <>
  +      <link rel="manifest" href="/manifest.webmanifest" />
      </>
    )
  }
  ```

- 2.2 Creates an empty `manifest.webmanifest` file in your `/public` folder
  ```diff
  +
  ```
