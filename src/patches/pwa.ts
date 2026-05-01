#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse, Lang } from '@ast-grep/napi'

import { createFolder, getPath, getPluginsData, getProjectRoot, getViteConfigPath, isVikePluginUsed } from '../utils.ts'

let isTypescript: boolean
let lang: Lang

export default async function pwa() {
  const cwd = process.env.VITE_PATCHER_CWD || process.cwd()
  const viteConfigPath = getViteConfigPath(cwd)
  isTypescript = viteConfigPath.endsWith('.ts')
  lang = isTypescript ? Lang.TypeScript : Lang.JavaScript

  await patchViteConfig(viteConfigPath)
  await patchVikeHeadManifest(cwd, viteConfigPath)
}

const patchViteConfig = async (viteConfigPath: string) => {
  console.log(`⏳ Patching file ${viteConfigPath} …`)

  try {
    let generatedCode = readFileSync(viteConfigPath, 'utf8')

    const eol = generatedCode.includes('\r\n') ? '\r\n' : '\n'

    let rootAST = parse(lang, generatedCode).root()

    const isAlreadyPatched = rootAST
      .findAll({ rule: { kind: 'call_expression' } })
      .some(call => call.find({ rule: { kind: 'identifier' } })?.text() === 'VitePWA')
    if (isAlreadyPatched) {
      console.log(`ℹ️  vite-plugin-pwa is already configured in ${viteConfigPath}`)
      return
    }

    // Add import statement
    const imports = rootAST.findAll({ rule: { kind: 'import_statement' } })
    const hasPWAImport = imports.some(imp => imp.text().includes('vite-plugin-pwa') && imp.text().includes('VitePWA'))
    if (!hasPWAImport) {
      const vitePWAImport = `import { VitePWA } from 'vite-plugin-pwa'`
      if (imports.length > 0) {
        const lastImport = imports.at(-1)!
        const pos = lastImport.range().end.index
        generatedCode = `${generatedCode.slice(0, pos)}${eol}${vitePWAImport}${generatedCode.slice(pos)}`
      } else {
        generatedCode = `${vitePWAImport}${eol}${generatedCode}`
      }
      rootAST = parse(lang, generatedCode).root()
    }

    const pluginData = getPluginsData(rootAST)

    const targetObj = pluginData.obj
    if (!targetObj) {
      throw new Error(`Could not find a valid Vite configuration object in ${viteConfigPath}; please fix it and retry`)
    }

    if (pluginData.error) {
      throw new Error(`The "plugins" property in ${viteConfigPath} is not an array literal. Please add vite-plugin-pwa manually.`)
    }

    let pluginsArray = pluginData.arr
    if (!pluginsArray) {
      const objStartPos = targetObj.range().start.index
      let objIndent = ''
      const objLineStart = generatedCode.lastIndexOf('\n', objStartPos)
      if (objLineStart !== -1) {
        const linePrefix = generatedCode.slice(objLineStart + 1, objStartPos)
        const indentMatch = linePrefix.match(/^[ \t]*/)
        if (indentMatch) objIndent = indentMatch[0]
      }
      // Determine basic indentation unit and add to object indentation for the new "plugins" property
      let newPropIndent = `${objIndent}${generatedCode.includes('\t') ? '\t' : '  '}`

      // If object has properties, try to copy the first property's indentation
      const firstProp = targetObj.children().find(c => c.kind() === 'pair')
      if (firstProp) {
        const propStartPos = firstProp.range().start.index
        const propLineStart = generatedCode.lastIndexOf('\n', propStartPos)
        if (propLineStart !== -1) {
          const propIndentMatch = generatedCode.slice(propLineStart + 1, propStartPos).match(/^[ \t]*/)
          if (propIndentMatch) newPropIndent = propIndentMatch[0]
        }
      }

      const insertPos = objStartPos + 1
      generatedCode = `${generatedCode.slice(0, insertPos)}${eol}${newPropIndent}plugins: [],${generatedCode.slice(insertPos)}`
      rootAST = parse(lang, generatedCode).root()
      pluginsArray = getPluginsData(rootAST).arr!
    }

    const pluginsPos = pluginsArray!.range().start.index // '[' pos
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

    // Generate our VitePWA code as a literal string to insert manually
    const pluginCode = `...(process.env.NODE_ENV === 'production' ? [VitePWA({
  registerType: 'autoUpdate',
  devOptions: { type: 'module' },
  manifest: {
    name: 'My App',
    short_name: 'MyApp',
    theme_color: '#3F51B5',
    background_color: '#3367D6',
    icons: [{ src: '/icons/logo-192.png', sizes: '192x192', type: 'image/png' }]
  }
}).map((plugin) => ({
  ...plugin,
  // Prevent from generating registerSW.js inside /dist/server
  applyToEnvironment(environment${isTypescript ? ': { name: string }' : ''}) {
    return environment.name === 'client'
  }
}))] : [])`

    // Extract raw code inside brackets
    const arrayEndPos = pluginsArray!.range().end.index - 1
    let before = generatedCode.slice(0, arrayEndPos)
    const after = generatedCode.slice(arrayEndPos)

    const arrChildren = pluginsArray!.children()
    const validChildren = arrChildren.filter(c => !['[', ']', ',', 'comment'].includes(c.kind() as string))
    const lastElem = validChildren.length > 0 ? validChildren.at(-1) : null
    if (lastElem) {
      const lastElemEnd = lastElem.range().end.index
      const charAfterLastElem = generatedCode.slice(lastElemEnd, arrayEndPos).trim()
      if (!charAfterLastElem.startsWith(',')) {
        before = `${generatedCode.slice(0, lastElemEnd)},${generatedCode.slice(lastElemEnd, arrayEndPos)}`
      }
    }

    const formattedPluginCode = pluginCode.split('\n').map((line, idx) => {
      if (idx === 0) return `${innerIndent}${line}`
      // pluginCode is hardcoded to use 2 spaces per indentation level.
      return innerIndent + line.replaceAll(/^(  )+/g, match => indentUnit.repeat(match.length / 2))
    }).join(eol)

    generatedCode = `${before.trimEnd()}${eol}${formattedPluginCode}${eol}${baseIndent}${after}`

    // Save the patched file
    writeFileSync(viteConfigPath, generatedCode)

    console.log('✅ vite-plugin-pwa added to vite.config')
  } catch (error) {
    console.error('❌ Error while patching the file:', error)
    throw error
  }
}

const patchVikeHeadManifest = async (cwd: string, viteConfigPath: string) => {
  const SKIP_MESSAGE = 'Skipping "manifest" integration:'
  // Check if package.json exists
  const pkgPath = resolve(cwd, 'package.json')
  if (!existsSync(pkgPath)) {
    console.warn(`⚠️ ${SKIP_MESSAGE} Could not find package.json in ${cwd}`)
    return
  }
  // Check vike in package.json dependencies
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
  if (!pkg.dependencies?.vike && !pkg.devDependencies?.vike) {
    console.warn(`⚠️ ${SKIP_MESSAGE} Vike not detected in package.json dependencies`)
    return
  }

  // Parse vite.config to find vike plugins and root instead of executing it
  const viteConfigCode = readFileSync(viteConfigPath, 'utf8')
  const rootAST = parse(lang, viteConfigCode).root()

  if (!isVikePluginUsed(rootAST)) {
    console.warn(`⚠️ ${SKIP_MESSAGE} Vike not detected in vite.config plugins`)
    return
  }

  const projectRoot = getProjectRoot(rootAST, cwd)

  // Check if +Head file exists in pages directory
  let headPath = getPath(join(projectRoot, 'pages'), '+Head', ['tsx', 'jsx'])
  if (headPath) {
    // Add manifest link in +Head file if it doesn't exist
    let headContent = readFileSync(headPath, 'utf8')
    if (headContent.includes('manifest.webmanifest')) {
      console.log(`ℹ️  ${SKIP_MESSAGE} ${headPath} already includes a manifest link`)
    } else {
      const headEol = headContent.includes('\r\n') ? '\r\n' : '\n'
      const endMatch = headContent.match(/\r?\n([ \t]*)(<\/>)/)
      if (!endMatch) {
        console.warn(`⚠️ Could not patch ${headPath} because a closing JSX Fragment (</>) was not found. Please add the manifest link manually.`)
        return
      }

      // Try to deduce the indentation from a sibling tag, or fallback to closing tag indentation + 1 level
      let headIndentUnit = '  '
      if (headContent.includes('\t')) {
        headIndentUnit = '\t'
      } else {
        const spaceMatch = headContent.match(/\r?\n( +)\S/)
        if (spaceMatch) {
          headIndentUnit = spaceMatch[1]
        }
      }

      const match = headContent.match(/\r?\n( {2,}|\t+)<(?!\/)[^>]+>[ \t]*\r?\n?/)
      const indentStr = match ? match[1] : `${endMatch[1]}${headIndentUnit}`

      headContent = headContent.replace(/(\r?\n)([ \t]*)(<\/>)/, `${headEol}${indentStr}<link rel="manifest" href="/manifest.webmanifest" />$1$2$3`)
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
