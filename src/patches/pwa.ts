#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse, Lang } from '@ast-grep/napi'

import { createFolder, getPath, getPluginsData, getProjectRoot, getTrivia, getViteConfigPath, isVikePluginUsed } from '../utils.ts'

let isTypescript: boolean
let lang: Lang
let quote: string = "'"
let indent: string = '  '
let eol: string

export default async function pwa() {
  const cwd = process.env.VITE_PATCHER_CWD || process.cwd()
  const viteConfigPath = getViteConfigPath(cwd)
  isTypescript = viteConfigPath.endsWith('.ts')
  lang = isTypescript ? Lang.TypeScript : Lang.JavaScript

  const viteConfigCode = readFileSync(viteConfigPath, 'utf8')

    ; ({ quote, indent, eol } = getTrivia(viteConfigCode))

  const viteConfigCodeUpdated = await patchViteConfig(viteConfigPath, viteConfigCode)
  await patchVikeHeadManifest(cwd, viteConfigCodeUpdated)
}

const patchViteConfig = async (viteConfigPath: string, viteConfigCode: string) => {
  console.log(`⏳ Patching file ${viteConfigPath} …`)

  try {
    let rootAST = parse(lang, viteConfigCode).root()

    // eslint-disable-next-line unicorn/prefer-array-some
    const isAlreadyPatched = !!rootAST.find({ rule: { pattern: 'VitePWA($$$)' } })
    if (isAlreadyPatched) {
      console.log(`ℹ️  vite-plugin-pwa is already configured in ${viteConfigPath}`)
      return viteConfigCode
    }

    // Add import statement
    const imports = rootAST.findAll({ rule: { kind: 'import_statement' } })
    const hasPWAImport = viteConfigCode.includes('vite-plugin-pwa') && imports.some((imp) => {
      const sourceString = imp.children().find(c => c.kind() === 'string')?.text()
      const isPwaImport = sourceString === "'vite-plugin-pwa'" || sourceString === '"vite-plugin-pwa"'
      return isPwaImport && imp.text().includes('VitePWA')
    })
    if (!hasPWAImport) {
      const vitePWAImport = `import { VitePWA } from ${quote}vite-plugin-pwa${quote}`
      if (imports.length > 0) {
        const lastImport = imports.at(-1)!
        const pos = lastImport.range().end.index
        viteConfigCode = `${viteConfigCode.slice(0, pos)}${eol}${vitePWAImport}${viteConfigCode.slice(pos)}`
      } else {
        viteConfigCode = `${vitePWAImport}${eol}${viteConfigCode}`
      }
      rootAST = parse(lang, viteConfigCode).root()
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
      const objLineStart = viteConfigCode.lastIndexOf('\n', objStartPos)
      if (objLineStart !== -1) {
        const linePrefix = viteConfigCode.slice(objLineStart + 1, objStartPos)
        const indentMatch = linePrefix.match(/^[ \t]*/)
        if (indentMatch) objIndent = indentMatch[0]
      }
      // Determine basic indentation unit and add to object indentation for the new "plugins" property
      let newPropIndent = `${objIndent}${indent}`

      // If object has properties, try to copy the first property's indentation
      const firstProp = targetObj.children().find(c => c.kind() === 'pair')
      if (firstProp) {
        const propStartPos = firstProp.range().start.index
        const propLineStart = viteConfigCode.lastIndexOf('\n', propStartPos)
        if (propLineStart !== -1) {
          const propIndentMatch = viteConfigCode.slice(propLineStart + 1, propStartPos).match(/^[ \t]*/)
          if (propIndentMatch) newPropIndent = propIndentMatch[0]
        }
      }

      const insertPos = objStartPos + 1
      viteConfigCode = `${viteConfigCode.slice(0, insertPos)}${eol}${newPropIndent}plugins: [],${viteConfigCode.slice(insertPos)}`
      rootAST = parse(lang, viteConfigCode).root()
      pluginsArray = getPluginsData(rootAST).arr!
    }

    const pluginsPos = pluginsArray!.range().start.index // '[' pos
    const pluginsLineStart = viteConfigCode.lastIndexOf('\n', pluginsPos)
    let baseIndent = ''
    if (pluginsLineStart !== -1) {
      const linePrefix = viteConfigCode.slice(pluginsLineStart + 1, pluginsPos)
      const indentMatch = linePrefix.match(/^[ \t]*/)
      if (indentMatch) {
        baseIndent = indentMatch[0]
      }
    }

    const innerIndent = baseIndent + indent

    // Generate our VitePWA code as a literal string to insert manually
    const pluginCode = `...(process.env.NODE_ENV === ${quote}production${quote} ? [VitePWA({
  registerType: ${quote}autoUpdate${quote},
  devOptions: { type: ${quote}module${quote} },
  manifest: {
    name: ${quote}My App${quote},
    short_name: ${quote}MyApp${quote},
    theme_color: ${quote}#3F51B5${quote},
    background_color: ${quote}#3367D6${quote},
    icons: [{ src: ${quote}/icons/logo-192.png${quote}, sizes: ${quote}192x192${quote}, type: ${quote}image/png${quote} }]
  }
}).map((plugin) => ({
  ...plugin,
  // Prevent from generating registerSW.js inside /dist/server
  applyToEnvironment(environment${isTypescript ? ': { name: string }' : ''}) {
    return environment.name === ${quote}client${quote}
  }
}))] : [])`

    // Extract raw code inside brackets
    const arrayEndPos = pluginsArray!.range().end.index - 1
    let before = viteConfigCode.slice(0, arrayEndPos)
    const after = viteConfigCode.slice(arrayEndPos)

    const arrChildren = pluginsArray!.children()
    let lastElemIndex = -1
    for (let i = arrChildren.length - 1; i >= 0; i--) {
      const kind = arrChildren[i].kind() as string
      if (kind !== '[' && kind !== ']' && kind !== ',' && kind !== 'comment') {
        lastElemIndex = i
        break
      }
    }

    const lastElem = lastElemIndex >= 0 ? arrChildren[lastElemIndex] : null
    if (lastElem) {
      const lastElemEnd = lastElem.range().end.index
      let hasCommaAfterLastElem = false
      for (let i = lastElemIndex + 1; i < arrChildren.length; i++) {
        const kind = arrChildren[i].kind() as string
        if (kind === ',') {
          hasCommaAfterLastElem = true
          break
        }
        if (kind !== 'comment' && kind !== ']') break
      }
      if (!hasCommaAfterLastElem) {
        before = `${viteConfigCode.slice(0, lastElemEnd)},${viteConfigCode.slice(lastElemEnd, arrayEndPos)}`
      }
    }

    const formattedPluginCode = pluginCode.split('\n').map((line, idx) => {
      if (idx === 0) return `${innerIndent}${line}`
      // pluginCode is hardcoded to use 2 spaces per indentation level.
      return innerIndent + line.replaceAll(/^(  )+/g, match => indent.repeat(match.length / 2))
    }).join(eol)

    viteConfigCode = `${before.trimEnd()}${eol}${formattedPluginCode}${eol}${baseIndent}${after}`

    // Save the patched file
    writeFileSync(viteConfigPath, viteConfigCode, 'utf8')

    console.log('✅ vite-plugin-pwa added to vite.config')
    return viteConfigCode
  } catch (error) {
    console.error('❌ Error while patching the file:', error)
    throw error
  }
}

const patchVikeHeadManifest = async (cwd: string, viteConfigCode: string) => {
  const SKIP_MESSAGE = 'Skipping "manifest" integration:'
  // Check if package.json exists
  const pkgPath = join(cwd, 'package.json')
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
  const rootAST = parse(lang, viteConfigCode).root()

  if (!isVikePluginUsed(rootAST)) {
    console.warn(`⚠️ ${SKIP_MESSAGE} Vike not detected in vite.config plugins`)
    return
  }

  const projectRoot = getProjectRoot(rootAST, cwd)

  // Check if +Head file exists in pages directory
  let headPath = getPath(join(projectRoot, 'pages'), '+Head', ['tsx', 'jsx'])
  const linkManifest = `<link rel="manifest" href="/manifest.webmanifest" />`
  if (headPath) {
    // Add manifest link in +Head file if it doesn't exist
    let headContent = readFileSync(headPath, 'utf8')
    if (headContent.includes('manifest.webmanifest')) {
      console.log(`ℹ️  ${SKIP_MESSAGE} ${headPath} already includes a manifest link`)
    } else {
      const allMatches = [...headContent.matchAll(/(\r?\n[ \t]*)?(<\/>)/g)]
      const endMatch = allMatches.at(-1)
      if (!endMatch) {
        console.warn(`⚠️ Could not patch ${headPath} because a closing JSX Fragment (</>) was not found. Please add the manifest link manually.`)
        return
      }

      const match = headContent.match(/\r?\n( {2,}|\t+)<(?!\/)[^>]+>[ \t]*\r?\n?/)
      const closingSpace = endMatch[1] || ''

      let indentStr = match?.[1] || ''
      let newIndentClosingSpace = closingSpace

      // If the closing tag was completely inline, calculate indent from the start of its line
      if (closingSpace) {
        if (!indentStr) indentStr = `${closingSpace.replace(/\r?\n/, '')}${indent}`
      } else {
        const leadingSpaceMatch = headContent.match(/^[ \t]*(?=.*<\/>)/m)
        const leadingSpace = leadingSpaceMatch ? leadingSpaceMatch[0] : ''
        if (!indentStr) indentStr = `${leadingSpace}${indent}`
        newIndentClosingSpace = `${eol}${leadingSpace}`
      }

      const matchIndex = endMatch.index!
      headContent = `${headContent.slice(0, matchIndex)}${eol}${indentStr}${linkManifest}${newIndentClosingSpace}${endMatch[2]}${headContent.slice(matchIndex + endMatch[0].length)}`

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
      ${linkManifest}
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
