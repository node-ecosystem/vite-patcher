#!/usr/bin/env node

import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadFile, writeFile, parseModule } from 'magicast'
import { addVitePlugin } from 'magicast/helpers'

export default async function patchViteConfig() {
  // 1. Find the vite.config file
  const targetPath = getViteConfigPath()

  if (!targetPath) {
    console.error('❌ vite.config not found!')
    process.exit(1)
  }

  console.log(`⏳ Patching file ${targetPath}…`)

  try {
    // 2. Load the abstract syntax tree (AST) of the file
    const mod = await loadFile(targetPath)

    // 3. Add the import manually
    mod.imports.$add({
      from: 'vite-plugin-pwa',
      name: 'VitePWA',
      imported: 'VitePWA'
    })

    // 4. Find the configuration object in the original file
    // Supports "export default defineConfig({...})" or "export default {...}"
    const configObj = (mod.exports.default.$type === 'function-call' || mod.exports.default.$type === 'call')
      ? mod.exports.default.$args[0]
      : mod.exports.default

    // Ensure the plugins array exists
    if (!configObj.plugins) {
      configObj.plugins = []
    }

    const isTypescript = targetPath.endsWith('.ts')

    const dummyMod = parseModule(`
      export default [
        ...process.env.NODE_ENV === 'production' ? [VitePWA({
          registerType: 'autoUpdate',
          devOptions: {
            type: 'module'
          },
          manifest: {
            name: 'My App',
            short_name: 'MyApp',
            theme_color: '#3F51B5',
            background_color: '#3367D6',
            icons: [
              {
                src: '/icons/logo-192.png',
                sizes: '192x192',
                type: 'image/png'
              }
            ]
          }
        }).map((plugin) => ({
          ...plugin,
          // Prevent from generating registerSW.js inside /dist/server
          applyToEnvironment(environment${isTypescript ? ': { name: string }' : ''}) {
            return environment.name === 'client'
          }
        }))] : null
      ]
    `)

    // 5. Extract exactly the first element of the exported array
    // This captures the entire "...process.env..." statement
    const complexPluginAst = dummyMod.exports.default.$ast.elements[0]

    // 6. Inject our complex AST node into the plugins array
    configObj.plugins.$ast.elements.push(complexPluginAst)

    // 7. Save the patched file
    writeFileSync(targetPath, mod.generate().code)

    console.log('✅ vite-plugin-pwa added and configured successfully!')
  } catch (error) {
    console.error('❌ Error while patching the file:', error)
    process.exit(1)
  }
}

const getViteConfigPath = () => {
  const configFiles = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']
  const cwd = process.env.VITE_PATCHER_CWD || process.cwd()

  for (const file of configFiles) {
    const fullPath = resolve(cwd, file)
    if (existsSync(fullPath)) {
      return fullPath
    }
  }
}
