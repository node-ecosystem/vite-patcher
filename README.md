# vite-patcher

Inject Vite Plugins and related configurations into your [vite.config](https://vite.dev/config).

## Supported Plugins

- **[vite-plugin-pwa](https://www.npmjs.com/package/vite-plugin-pwa)** ~ Add [Progressive Web App (PWA)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps)
  - Support [vike](https://www.npmjs.com/package/vike) too

## Installation

Using npm:
```bash
npm install -D vite-patcher
```

Using yarn:
```bash
yarn add -D vite-patcher
```

Using pnpm:
```bash
pnpm add -D vite-patcher
```

## Usage

Run the CLI tool directly to apply patches to your Vite configuration.

### pwa

Apply the PWA patch

Using npm:
```bash
npm run vite-patcher pwa
```

Using yarn:
```bash
yarn vite-patcher pwa
```

Using pnpm:
```bash
pnpm vite-patcher pwa
```

Or execute

Using npm:
```bash
npx vite-patcher pwa
```

Using yarn:
```bash
yarn dlx vite-patcher pwa
```

Using pnpm:
```bash
pnpm dlx vite-patcher pwa
```

## Contributing

1. Clone the repository.
2. Install dependencies with `yarn install`.
3. Build the project using `yarn build` (uses `tsdown`).
4. Run tests with `yarn test`.
