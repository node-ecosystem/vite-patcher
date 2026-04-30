#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import type { UserConfig } from 'vite'

import { createFolder, getPath } from '../utils.ts'

let isTypescript: boolean

export default async function patchViteConfig() {
  const cwd = process.env.VITE_PATCHER_CWD || process.cwd()
  // Find the vite.config file
  const targetPath = getPath(cwd, 'vite.config')

  if (!targetPath) {
    throw new Error('❌ vite.config not found')
  }

  console.log(`⏳ Patching file ${targetPath}…`)

  try {
    let generatedCode = readFileSync(targetPath, 'utf8')

    const eol = generatedCode.includes('\r\n') ? '\r\n' : '\n'

    // Add import statement
    if (!generatedCode.includes('vite-plugin-pwa')) {
      const lastImportIndex = generatedCode.lastIndexOf('import ')
      if (lastImportIndex === -1) {
        generatedCode = `import { VitePWA } from 'vite-plugin-pwa'${eol}${generatedCode}`
      } else {
        const importEndIndex = generatedCode.indexOf(eol, lastImportIndex)
        if (importEndIndex !== -1) {
          const pos = importEndIndex + eol.length
          generatedCode = `${generatedCode.slice(0, pos)}import { VitePWA } from 'vite-plugin-pwa'${eol}${generatedCode.slice(pos)}`
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
          generatedCode = `${generatedCode.slice(0, configBlockStart + 1)}${eol}  plugins: [],${generatedCode.slice(configBlockStart + 1)}`
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

      isTypescript = targetPath.endsWith('.ts')

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
              let before = generatedCode.slice(0, i)
              const after = generatedCode.slice(i)

              const innerCode = before.slice(startIndex)
              const hasItems = innerCode.trim().length > 0

              if (hasItems && !innerCode.trimEnd().endsWith(',')) {
                // Ensure comma goes directly after the last character, preserving comments/newlines that follow
                before = before.replace(/(\S)(\s*)$/, '$1,$2')
              }

              const formattedPluginCode = pluginCode.split('\n').map((line, idx) => {
                if (idx === 0) return `${innerIndent}${line}`

                // Re-indent pluginCode correctly replacing hardcoded spaces
                const spaceCount = line.match(/^[ ]+/)?.[0].length || 0
                const multiplier = Math.floor(spaceCount / 2)
                const extraIndent = indentUnit === '\t'
                  ? '\t'.repeat(multiplier)
                  : ' '.repeat(multiplier * indentUnit.length)

                return `${innerIndent}${extraIndent}${line.slice(spaceCount)}`
              }).join(eol)

              generatedCode = `${before.trimEnd()}${eol}${formattedPluginCode}${eol}${baseIndent}${after}`
              break
            }
          }
        }
        i++
      }
    }

    // Save the patched file
    writeFileSync(targetPath, generatedCode)

    console.log('✅ vite-plugin-pwa added to vite.config')

    await patchVikeHeadPage(cwd, targetPath)
  } catch (error) {
    console.error('❌ Error while patching the file:', error)
    throw error
  }
}

const patchVikeHeadPage = async (cwd: string, viteConfigPath: string) => {
  const SKIP_MESSAGE = 'Skipping "manifest" integration.'
  // Check if package.json exists
  const pkgPath = resolve(cwd, 'package.json')
  if (!existsSync(pkgPath)) {
    console.warn(`⚠️ Could not find package.json in ${cwd}. ${SKIP_MESSAGE}`)
    return
  }
  // Check vike in package.json dependencies
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (!((pkg.dependencies && pkg.dependencies.vike) || (pkg.devDependencies && pkg.devDependencies.vike))) {
    console.warn(`⚠️ Vike not detected in package.json dependencies. ${SKIP_MESSAGE}`)
    return
  }

  const { default: viteConfig }: { default: UserConfig } = await import(`file:${viteConfigPath}`)

  // Check vike in vite.config dependencies
  if (!viteConfig.plugins?.find((p) => '_vikeVitePluginOptions' in p)) {
    console.warn(`⚠️ Vike not detected in package.json or vite.config dependencies. ${SKIP_MESSAGE}`)
    return
  }

  const projectRoot = viteConfig.root ? resolve(cwd, viteConfig.root) : cwd

  // Check if +Head file exists in pages directory
  let headPath = getPath(join(projectRoot, 'pages'), '+Head', ['tsx', 'jsx'])
  if (headPath) {
    // Add manifest link in +Head file if it doesn't exist
    let headContent = readFileSync(headPath, 'utf8')
    if (headContent.includes('manifest.webmanifest')) {
      console.log(`ℹ️ ${headPath} already includes a manifest link. ${SKIP_MESSAGE}`)
    } else {
      headContent = headContent.replace(/(\s*)(<\/>)/, `$1  <link rel="manifest" href="/manifest.webmanifest" />$1$2`)
      writeFileSync(headPath, headContent, 'utf8')
      console.log(`✅ Updated ${headPath} to include manifest link`)
    }
  } else {
    const pagesDir = join(projectRoot, 'pages')
    createFolder(pagesDir)
    headPath = join(pagesDir, `+Head.${isTypescript ? 'tsx' : 'jsx'}`)
    const defaultHead = `export function Head() {
  return (
    <>
      <link rel="manifest" href="/manifest.webmanifest" />
    </>
  )
}
`
    writeFileSync(headPath, defaultHead, 'utf8')
    console.log(`✅ Created ${headPath} with manifest link`)
  }

  // Create manifest.webmanifest in public directory if it doesn't exist
  const publicDir = join(projectRoot, 'public')
  createFolder(publicDir)
  const manifestPath = join(publicDir, 'manifest.webmanifest')
  if (!existsSync(manifestPath)) {
    writeFileSync(manifestPath, '', 'utf8')
  }
  console.log(`✅ Created ${manifestPath}`)
}
