# vite-patcher

Inject Vite Plugins and related configurations without any effort into your [vite.config](https://vite.dev/config).

**vite-patcher** is a CLI tool designed to automate the configuration of Vite plugins. It directly reads your Vite configuration file, applies necessary code injections (like adding imports and initializing plugins) while preserving your file's layout and formatting, and saves you from error-prone manual setup.

## ✨ Features

❯ **Automated Configuration:** Say goodbye to manual editing. Let the tool seamlessly inject plugin configurations into your `vite.config.*`.<br>
❯ **Smart Formatting:** The tool respects your existing indentation (tabs vs spaces) and preserves standard quotes.<br>
❯ **Vike Integration:** Detects when [vike](https://vike.dev) is included in your project and automatically handles edge cases (e.g., bypassing client/server double injection conflicts).<br>

## ℹ️ Supported Plugins

| Command | Plugin | Description
| - | - | -
| [pwa](./src/patches/pwa/README.md) | [vite-plugin-pwa](https://www.npmjs.com/package/vite-plugin-pwa) | Add [Progressive Web App (PWA)](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps) support. *Supports [vike](https://www.npmjs.com/package/vike) as well.*

## ⚙️ Installation

Install exactly what you need for your local environment:

| Package Manager | Command
| - | -
| **npm** | `npm install -D vite-patcher`
| **yarn** | `yarn add -D vite-patcher`
| **pnpm** | `pnpm add -D vite-patcher`

## 📖 Usage

Run the CLI tool directly to apply patches to your Vite configuration.

## 🌍 Environment Variables

You can customize the behavior of `vite-patcher` using the following environment variables:

| Variable | Description
| - | -
| `VITE_PATCHER_CWD` | Overrides the default working directory (`process.cwd()`). Useful if your `vite.config` is located in a different folder than the one where you run the command.

## 🛠️ Contributing

Got ideas or want to add a patch string?

1. Clone the repository.
2. Install dependencies with `yarn install`.
3. Build the project using `yarn build` (uses `tsdown`).
4. Run tests with `yarn test`.

## 📜 License

This project is licensed under the [MIT License](LICENSE).
