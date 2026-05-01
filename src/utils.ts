import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SgNode } from '@ast-grep/napi'
import type { Kinds, TypesMap } from '@ast-grep/napi/types/staticTypes'

export const getPath = (basepath: string, filename: string, extensions = ['ts', 'js', 'mjs']) => {
  for (const ext of extensions) {
    const fullPath = resolve(basepath, `${filename}.${ext}`)
    if (existsSync(fullPath)) return fullPath
  }
  return
}

export const createFolder = (path: string) => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}

export const getViteConfigPath = (basepath: string) => {
  const targetPath = getPath(basepath, 'vite.config')
  if (!targetPath) {
    throw new Error('❌ vite.config not found')
  }
  return targetPath
}

// Find the exported configuration object literal and its plugins array.
// Do not fall back to the first object literal in the file, as that may be unrelated.
export const getPluginsData = (rootAST: SgNode<TypesMap, Kinds<TypesMap>>) => {
  const exportedConfig = rootAST.find({ rule: { pattern: 'export default $CONFIG' } })?.getMatch('CONFIG')
  const obj = exportedConfig?.kind() === 'object'
    ? exportedConfig
    : exportedConfig?.find({ rule: { kind: 'object' } })
  if (!obj) return { obj: null, arr: null }

  // Check top-level properties directly to avoid matching nested object properties
  let pluginsPair: SgNode<TypesMap, Kinds<TypesMap>> | null = null
  const children = obj.children()
  for (let i = children.length - 1; i >= 0; i--) {
    const c = children[i]
    const kind = c.kind()
    if (kind === 'shorthand_property_identifier' && c.text() === 'plugins') {
      return { obj, arr: null, error: true }
    }
    if (kind === 'pair') {
      const keyText = c.children()[0]?.text()
      if (keyText === 'plugins' || keyText === "'plugins'" || keyText === '"plugins"') {
        pluginsPair = c
        break
      }
    }
  }

  if (!pluginsPair) return { obj, arr: null }

  // The value must be directly an array literal
  const arr = pluginsPair.children().find(c => c.kind() === 'array')
  if (!arr) return { obj, arr: null, error: true }

  return { obj, arr }
}

// Check vike in vite.config dependencies (import statement = import vike from 'vike/plugin')
export const isVikePluginUsed = (rootAST: SgNode<TypesMap, Kinds<TypesMap>>) => {
  const imports = rootAST.findAll({ rule: { kind: 'import_statement' } })
  const vikePluginImport = imports.find(imp => imp.text().includes('vike/plugin'))
  if (!vikePluginImport) return false

  const vikeIdentifier = vikePluginImport.find({ rule: { kind: 'identifier' } })?.text()
  if (!vikeIdentifier) return false

  const { arr: pluginsArr } = getPluginsData(rootAST)
  if (!pluginsArr) return false

  return pluginsArr
    .findAll({ rule: { kind: 'call_expression' } })
    .some(call => call.find({ rule: { kind: 'identifier' } })?.text() === vikeIdentifier)
}

// Try to find vite config "root" property
export const getProjectRoot = (rootAST: SgNode<TypesMap, Kinds<TypesMap>>, cwd: string) => {
  const { obj } = getPluginsData(rootAST)
  if (!obj) return cwd

  let rootPair: SgNode<TypesMap, Kinds<TypesMap>> | null = null
  const children = obj.children()
  for (let i = children.length - 1; i >= 0; i--) {
    const c = children[i]
    if (c.kind() === 'pair') {
      const keyText = c.children()[0]?.text()
      if (keyText === 'root' || keyText === "'root'" || keyText === '"root"') {
        rootPair = c
        break
      }
    }
  }

  if (!rootPair) return cwd

  const rootValNode = rootPair.children().at(-1)
  if (!rootValNode || rootValNode.kind() !== 'string') {
    if (rootValNode) {
      console.warn(`⚠️ Ignoring non-literal vite.config root (${rootValNode.text()}); using ${cwd} as project root`)
    }
    return cwd
  }

  const rootVal = rootValNode.text()
  const match = rootVal.match(/^(['"`])(.*)\1$/s)
  if (match) return resolve(cwd, match[2])

  return cwd
}

export const getTrivia = (code: string) => {
  let singleQuotesCount = 0
  let doubleQuotesCount = 0
  for (const char of code) {
    if (char === "'") singleQuotesCount++
    else if (char === '"') doubleQuotesCount++
  }

  const quote = singleQuotesCount >= doubleQuotesCount ? "'" : '"'
  const indent = code.includes('\t') ? '\t' : (code.match(/\r?\n( +)\S/)?.[1] || '  ')
  const eol = code.includes('\r\n') ? '\r\n' : '\n'

  return {
    quote,
    indent,
    eol
  }
}
