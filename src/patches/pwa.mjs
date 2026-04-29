#!/usr/bin/env node

import { existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { loadFile, writeFile, parseModule } from 'magicast'
import { addVitePlugin } from 'magicast/helpers'

export default async function patchViteConfig() {
  const cwd = process.env.VITE_PATCHER_CWD || process.cwd()

  // 1. Find the vite.config file
  const targetPath = getViteConfigPath(cwd)

  if (!targetPath) {
    console.error('❌ vite.config not found!')
    process.exit(1)
  }

  console.log(`⏳ Patching file ${targetPath}…`)

  try {
    // Load the abstract syntax tree (AST) of the file
    const mod = await loadFile(targetPath)

    // Add the import manually
    mod.imports.$add({
      from: 'vite-plugin-pwa',
      name: 'VitePWA',
      imported: 'VitePWA'
    })

    // Find the configuration object in the original file
    // Supports "export default defineConfig({...})" or "export default {...}"
    const configObj = (mod.exports.default.$type === 'function-call' || mod.exports.default.$type === 'call')
      ? mod.exports.default.$args[0]
      : mod.exports.default

    // Ensure the plugins array exists
    // We only touch the AST for plugins if it doesn't exist, to preserve magicast array layout.
    const hadPlugins = !!configObj.plugins
    if (!hadPlugins) {
      configObj.plugins = []
    }

    const isTypescript = targetPath.endsWith('.ts')

    // Generate our VitePWA code as a literal string to insert manually
    const pluginCode = `...(process.env.NODE_ENV === 'production' ? [VitePWA({
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
    }))] : [])`

    // Generate the code safely with magicast (which just added the import/plugins array if missing)
    let generatedCode = mod.generate().code
    const eol = generatedCode.includes('\r\n') ? '\r\n' : '\n'

    // Inject string inside the array instead of using AST to preserve layout
    const pluginsIndex = generatedCode.indexOf('plugins: [')
    if (pluginsIndex !== -1) {
      const startIndex = generatedCode.indexOf('[', pluginsIndex) + 1
      let depth = 1
      let i = startIndex

      while (i < generatedCode.length && depth > 0) {
        const char = generatedCode[i]
        if (char === "'" || char === '"' || char === '\`') {
          const quote = char
          i++
          while (i < generatedCode.length && generatedCode[i] !== quote) {
            if (generatedCode[i] === '\\\\') i++
            i++
          }
        } else if (char === '[' || char === '{' || char === '(') {
          depth++
        } else if (char === ']' || char === '}' || char === ')') {
          depth--
          if (depth === 0) {
            let before = generatedCode.substring(0, i)
            const after = generatedCode.substring(i)

            let innerCode = before.substring(startIndex)
            const hasItems = innerCode.trim().length > 0

            if (hasItems && !innerCode.trimEnd().endsWith(',')) {
              before = `${before.trimEnd()},`
            }

            let insertStr = `${eol}    ${pluginCode.split('\n').join(eol + '    ')}${eol}  `

            generatedCode = before + insertStr + after
            break
          }
        }
        i++
      }
    }

    // Save the patched file
    writeFileSync(targetPath, generatedCode)

    console.log('✅ vite-plugin-pwa added and configured successfully!')
  } catch (error) {
    console.error('❌ Error while patching the file:', error)
    process.exit(1)
  }
}

const getViteConfigPath = (cwd) => {
  const configFiles = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']
  for (const file of configFiles) {
    const fullPath = resolve(cwd, file)
    if (existsSync(fullPath)) {
      return fullPath
    }
  }
}
