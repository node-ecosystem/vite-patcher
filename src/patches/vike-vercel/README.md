# `vike-vercel` patch

Quickly inject and configure `vite-plugin-pwa` into your existing `vite.config`.

### 🚀 Usage

Use your local package manager:

| Package Manager | Command
| - | -
| **npm** | `npm run vite-patcher vike-vercel hono`
| **yarn** | `yarn vite-patcher vike-vercel hono`
| **pnpm** | `pnpm vite-patcher vike-vercel hono`

Or use `npx`/`dlx` (without installing `vite-patcher` dependency) to execute this patch via your package runner:

| Package Manager | Command
| - | -
| **npm** | `npx vite-patcher vike-vercel hono`
| **yarn** | `yarn dlx vite-patcher vike-vercel hono`
| **pnpm** | `pnpm dlx vite-patcher vike-vercel hono`

### 🩹 What it patches

#### 1. Vercel Integration

- 1.1 `vercel.json`

```diff
+{
+  "outputDirectory": "dist/client",
+  "installCommand": "yarn install --immutable",
+  "rewrites": [
+    {
+      "source": "/((?!assets/).*)",
+      "destination": "/api/ssr.js"
+    }
+  ]
+}
```

- 2.1 `vercel.json`

```diff
+import { app } from '../dist/server/index.mjs'
+export const GET = app.fetch
+export const POST = app.fetch
```

#### 2. Vike Integration (`+Head` & `manifest.webmanifest`)
If your project is using [Vike](https://vike.dev):
