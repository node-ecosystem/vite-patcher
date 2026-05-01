#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse, Lang } from '@ast-grep/napi'

import { createFolder, getPath, getViteConfigPath } from '../utils.ts'

let isTypescript: boolean

export default async function () {
  const cwd = process.env.VITE_PATCHER_CWD || process.cwd()
  const viteConfigPath = getViteConfigPath(cwd)
  await patchViteConfig(viteConfigPath)
  await patchVikeHeadManifest(cwd, viteConfigPath)
}

const patchViteConfig = async (viteConfigPath: string) => {
  console.log(`⏳ Patching file ${viteConfigPath} …`)

  try {
    let generatedCode = readFileSync(viteConfigPath, 'utf8')

    const eol = generatedCode.includes('\r\n') ? '\r\n' : '\n'

    let root = parse(Lang.TypeScript, generatedCode).root()

    // Add import statement
    if (!generatedCode.includes('vite-plugin-pwa')) {
      const imports = root.findAll({ rule: { kind: 'import_statement' } })
      if (imports.length > 0) {
        const lastImport = imports.at(-1)!
        const pos = lastImport.range().end.index
        generatedCode = `${generatedCode.slice(0, pos)}${eol}import { VitePWA } from 'vite-plugin-pwa'${generatedCode.slice(pos)}`
      } else {
        generatedCode = `import { VitePWA } from 'vite-plugin-pwa'${eol}${generatedCode}`
      }
      root = parse(Lang.TypeScript, generatedCode).root()
    }

    // Ensure plugins array exists
    let pIdentifier = root.find({ rule: { kind: 'property_identifier', regex: '^plugins$' } })
    let pluginsArray = pIdentifier?.parent()?.find({ rule: { kind: 'array' } })

    if (!pluginsArray) {
      // Find the vite config object literal
      const exportDefault = root.find({ rule: { kind: 'export_statement' } })
      const targetObj = exportDefault?.find({ rule: { kind: 'object' } }) || root.find({ rule: { kind: 'object' } })

      if (targetObj) {
        const insertPos = targetObj.range().start.index + 1
        generatedCode = `${generatedCode.slice(0, insertPos)}${eol}  plugins: [],${generatedCode.slice(insertPos)}`
        root = parse(Lang.TypeScript, generatedCode).root()
        pIdentifier = root.find({ rule: { kind: 'property_identifier', regex: '^plugins$' } })
        pluginsArray = pIdentifier?.parent()?.find({ rule: { kind: 'array' } })
      }
    }

    if (pluginsArray) {
      const pluginsPos = pluginsArray.range().start.index // '[' pos
      const pluginsLineStart = generatedCode.lastIndexOf('\n', pluginsPos)
      let baseIndent = ''
      if (pluginsLineStart !== -1) {
        const linePrefix = generatedCode.slice(pluginsLineStart + 1, pluginsPos)
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

      const startIndex = pluginsPos + 1
      isTypescript = viteConfigPath.endsWith('.ts')

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

      // Extract raw code inside brackets
      const arrayEndPos = pluginsArray.range().end.index - 1
      let before = generatedCode.slice(0, arrayEndPos)
      const after = generatedCode.slice(arrayEndPos)

      const innerCode = generatedCode.slice(startIndex, arrayEndPos)
      const hasItems = innerCode.trim().length > 0

      if (hasItems && !before.trimEnd().endsWith(',')) {
        // Ensure comma goes directly after the last character
        before = before.replace(/(\S)(\s*)$/, '$1,$2')
      }

      let formattedPluginCode = pluginCode.split('\n').map((line, idx) => {
        if (idx === 0) return `${innerIndent}${line}`
        // pluginCode is hardcoded to use 2 spaces per indentation level.
        return innerIndent + line.replace(/^(  )+/g, match => indentUnit.repeat(match.length / 2))
      }).join(eol)

      generatedCode = `${before.trimEnd()}${eol}${formattedPluginCode}${eol}${baseIndent}${after}`
    }

    // Save the patched file
    writeFileSync(viteConfigPath, generatedCode)

    console.log('✅ vite-plugin-pwa added to vite.config')
  } catch (error) {
    console.error('❌ Error while patching the file:', error)
    throw error
  }
}

const patchVikeHeadManifest = async (cwd: string, viteConfigPath: string) => {
  const SKIP_MESSAGE = 'Skipping "manifest" integration.'
  // Check if package.json exists
  const pkgPath = resolve(cwd, 'package.json')
  if (!existsSync(pkgPath)) {
    console.warn(`⚠️ Could not find package.json in ${cwd}. ${SKIP_MESSAGE}`)
    return
  }
  // Check vike in package.json dependencies
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (!pkg.dependencies?.vike && !pkg.devDependencies?.vike) {
    console.warn(`⚠️ Vike not detected in package.json dependencies. ${SKIP_MESSAGE}`)
    return
  }

  // Parse vite.config to find vike plugins and root instead of executing it
  const viteConfigCode = readFileSync(viteConfigPath, 'utf8')
  const rootAST = parse(Lang.TypeScript, viteConfigCode).root()

  // Check vike in vite.config dependencies (import statement)
  const isVikeImported = rootAST.find({ rule: { pattern: 'import $_ from \'vike/plugin\'' } }) ||
    rootAST.find({ rule: { pattern: 'import { $_ } from \'vike/plugin\'' } }) ||
    rootAST.findAll({ rule: { kind: 'import_statement' } }).some(n => n.text().includes('vike'))

  if (!isVikeImported) {
    console.warn(`⚠️ Vike not detected in package.json or vite.config dependencies. ${SKIP_MESSAGE}`)
    return
  }

  // Try to find vite config "root" property
  let projectRoot = cwd
  const rootProp = rootAST.find({ rule: { pattern: 'root: $ROOT' } })
  if (rootProp) {
    const rootValMatch = rootProp.getMatch('ROOT')?.text()
    if (rootValMatch) {
      // Remove quotes from rootValMatch
      const strippedRoot = rootValMatch.replaceAll(/^['"]|['"]$/g, '')
      projectRoot = resolve(cwd, strippedRoot)
    }
  }

  // Check if +Head file exists in pages directory
  let headPath = getPath(join(projectRoot, 'pages'), '+Head', ['tsx', 'jsx'])
  if (headPath) {
    // Add manifest link in +Head file if it doesn't exist
    let headContent = readFileSync(headPath, 'utf8')
    if (headContent.includes('manifest.webmanifest')) {
      console.log(`ℹ️ ${headPath} already includes a manifest link. ${SKIP_MESSAGE}`)
    } else {
      // Intelligently infer indentation from previous tags inside the fragment
      const match = headContent.match(/\n( {2,}|\t+)<(?!\/)[^>]+>[ \t]*\n?/)
      const endMatch = headContent.match(/\n([ \t]*)(<\/>)/)
      const linkTag = `<link rel="manifest" href="/manifest.webmanifest" />`
      if (match && endMatch) {
        const indentStr = match[1]
        headContent = headContent.replace(/(\n)([ \t]*)(<\/>)/, `\n${indentStr}${linkTag}$1$2$3`)
      } else {
        const fallbackIndentMatch = headContent.match(/\n([ \t]*)(<\/>)/)
        const fallbackSpace = (fallbackIndentMatch && fallbackIndentMatch[1].includes('\t')) ? '\t' : '  '
        headContent = headContent.replace(/(\n)([ \t]*)(<\/>)/, `$1$2${fallbackSpace}${linkTag}$1$2$3`)
      }
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
