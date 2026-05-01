# vite-patcher

Inject Vite Plugins and related configurations into your [vite.config](https://vite.dev/config).

## ℹ️ Supported Plugins

| Command | Plugin | Description
| - | - | -
[pwa](/#pwa) | [vite-plugin-pwa](https://www.npmjs.com/package/vite-plugin-pwa) | Add [Progressive Web App (PWA)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps) ~ _Support [vike](https://www.npmjs.com/package/vike) too_

## ⚙️ Installation

| Package Manager | Command
| - | -
| **npm** | `npm install -D vite-patcher`
| **yarn** | `yarn add -D vite-patcher`
| **pnpm** | `pnpm add -D vite-patcher`

## 📖 Usage

Run the CLI tool directly to apply patches to your Vite configuration.

### pwa

Apply the PWA patch:

| Package Manager | Command
| - | -
| **npm** | `npm run vite-patcher pwa`
| **yarn** | `yarn vite-patcher pwa`
| **pnpm** | `pnpm vite-patcher pwa`

Or execute:

| Package Manager | Command
| - | -
| **npm** | `npx vite-patcher pwa`
| **yarn** | `yarn dlx vite-patcher pwa`
| **pnpm** | `pnpm dlx vite-patcher pwa`

## 📜 License

This project is licensed under the [MIT License](LICENSE).
