#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

export default function patchViteConfig() {
  const cwd = process.env.VITE_PATCHER_CWD || process.cwd()

  // Find the vite.config file
  const targetPath = getViteConfigPath(cwd)

  if (!targetPath) {
    throw new Error('❌ vite.config not found!')
  }

  console.log(`⏳ Patching file ${targetPath}…`)

  try {
    const isTypescript = targetPath.endsWith('.ts')

    // Generate our VitePWA code as a literal string to insert manually
    const pluginCode = `
...(process.env.NODE_ENV === 'production' ? [VitePWA({
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

    let generatedCode = readFileSync(targetPath, 'utf8')
    // IMPORTANT FIX: Avoid letting magicast re-serialize the entire AST if we can help it, 
    // because recast converts 1 tab into 4 tabs by default, destroying user files.
    // Instead we will work directly on the original string.
    const eol = generatedCode.includes('\r\n') ? '\r\n' : '\n'

    // Add import statement
    if (!generatedCode.includes('vite-plugin-pwa')) {
      const lastImportIndex = generatedCode.lastIndexOf('import ')
      if (lastImportIndex === -1) {
        generatedCode = `import { VitePWA } from 'vite-plugin-pwa'${eol}${generatedCode}`
      } else {
        const importEndIndex = generatedCode.indexOf(eol, lastImportIndex)
        if (importEndIndex !== -1) {
          generatedCode = generatedCode.slice(0, Math.max(0, importEndIndex + eol.length)) + `import { VitePWA } from 'vite-plugin-pwa'${eol}` + generatedCode.slice(Math.max(0, importEndIndex + eol.length))
        }
      }
    }

    // Ensure plugins array exists
    let pluginsIndex = generatedCode.indexOf('plugins: [')
    if (pluginsIndex === -1) {
      // Assume we can safely append it to export default { or defineConfig({
      const defaultExportIndex = generatedCode.indexOf('export default ')
      if (defaultExportIndex !== -1) {
        const configBlockStart = generatedCode.indexOf('{', defaultExportIndex)
        if (configBlockStart !== -1) {
          generatedCode = generatedCode.slice(0, Math.max(0, configBlockStart + 1)) + `${eol}  plugins: [],` + generatedCode.slice(Math.max(0, configBlockStart + 1))
          pluginsIndex = generatedCode.indexOf('plugins: [')
        }
      }
    }

    // Inject string inside the array instead of using AST to preserve layout
    // pluginsIndex is already computed above
    if (pluginsIndex !== -1) {
      const pluginsLineStart = generatedCode.lastIndexOf('\n', pluginsIndex)
      let baseIndent = ''
      if (pluginsLineStart !== -1) {
        const linePrefix = generatedCode.slice(pluginsLineStart + 1, pluginsIndex)
        const indentMatch = linePrefix.match(/^[ \t]*/)
        if (indentMatch) {
          baseIndent = indentMatch[0]
        }
      }

      // Determine indentation mode (tabs vs spaces)
      let indentUnit = '  '
      if (baseIndent.includes('\t')) indentUnit = '\t'
      else if (baseIndent.includes(' ')) indentUnit = ' '.repeat(Math.max(2, baseIndent.length))
      else if (generatedCode.includes('\t')) indentUnit = '\t'

      const innerIndent = baseIndent + indentUnit

      const startIndex = generatedCode.indexOf('[', pluginsIndex) + 1
      let depth = 1
      let i = startIndex

      while (i < generatedCode.length && depth > 0) {
        const char = generatedCode[i]
        switch (char) {
          case "'":
          case '"':
          case '\`': {
            const quote = char
            i++
            while (i < generatedCode.length && generatedCode[i] !== quote) {
              if (generatedCode[i] === '\\\\') i++
              i++
            }
            break
          }
          case '[':
          case '{':
          case '(': {
            depth++
            break
          }
          case ']':
          case '}':
          case ')': {
            depth--
            if (depth === 0) {
              let before = generatedCode.slice(0, Math.max(0, i))
              const after = generatedCode.slice(Math.max(0, i))

              let innerCode = before.slice(Math.max(0, startIndex))
              const hasItems = innerCode.trim().length > 0

              if (hasItems && !innerCode.trimEnd().endsWith(',')) {
                // Ensure comma goes directly after the last character, preserving comments/newlines that follow
                before = before.replace(/(\S)(\s*)$/, '$1,$2')
              }

              let formattedPluginCode = pluginCode.split('\n').map((line, idx) => {
                if (idx === 0) return line

                // pluginCode is currently indented with 2 spaces for each indent level.
                // We remove the hardcoded spaces and replace them entirely with your indentUnit.
                const spaceCount = line.match(/^[ ]+/)?.[0].length || 0
                const multiplier = Math.floor(spaceCount / 2)

                const extraIndent = indentUnit === '\t'
                  ? '\t'.repeat(multiplier)
                  : ' '.repeat(multiplier * indentUnit.length)

                // Inject the full correct indent string per line
                return innerIndent + extraIndent + line.slice(Math.max(0, spaceCount))
              }).join(eol)

              let insertStr = `${formattedPluginCode}${eol}${baseIndent}`

              generatedCode = before.trimEnd() + insertStr + after
              break
            }
          }
        }
        i++
      }
    }

    // Save the patched file
    writeFileSync(targetPath, generatedCode)

    console.log('✅ vite-plugin-pwa added and configured successfully!')
  } catch (error) {
    console.error(`❌ Error while patching the file: ${error}`)
    throw error
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
