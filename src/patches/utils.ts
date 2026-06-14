import { existsSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { findAll, getCallFunctionName, getDefaultExportValue, Lang, type SyntaxNode } from './codegraft.ts'

export const getPath = (basepath: string, filename: string, extensions = ['ts', 'js', 'mjs']) => {
  for (const ext of extensions) {
    const fullPath = join(basepath, `${filename}.${ext}`)
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
export const getPluginsData = (rootAST: SyntaxNode) => {
  const exportedConfig = getDefaultExportValue(rootAST)
  let obj: SyntaxNode | null | undefined = null
  if (exportedConfig?.type === 'object') {
    obj = exportedConfig
  } else if (exportedConfig) {
    obj = findAll(exportedConfig, 'object').at(0)
  }
  if (!obj) return { obj: null, arr: null }

  // Check top-level properties directly to avoid matching nested object properties
  let pluginsPair: SyntaxNode | null = null
  const children = obj.children
  for (let i = children.length - 1; i >= 0; i--) {
    const c = children[i]
    const kind = c.type
    if (kind === 'shorthand_property_identifier' && c.text === 'plugins') {
      return { obj, arr: null, error: true }
    }
    if (kind === 'pair') {
      const keyText = c.children[0]?.text
      if (keyText === 'plugins' || keyText === "'plugins'" || keyText === '"plugins"') {
        pluginsPair = c
        break
      }
    }
  }

  if (!pluginsPair) return { obj, arr: null }

  // The value must be directly an array literal
  const arr = pluginsPair.children.find(c => c.type === 'array')
  if (!arr) return { obj, arr: null, error: true }

  return { obj, arr }
}

// Check vike in vite.config dependencies (import statement = import vike from 'vike/plugin')
export const isVikePluginUsed = (rootAST: SyntaxNode) => {
  const imports = findAll(rootAST, 'import_statement')
  const vikePluginImport = imports.find(imp => imp.text.includes('vike/plugin'))
  if (!vikePluginImport) return false

  const vikeIdentifier = findAll(vikePluginImport, 'identifier').at(0)?.text
  if (!vikeIdentifier) return false

  const { arr: pluginsArr } = getPluginsData(rootAST)
  if (!pluginsArr) return false

  return findAll(pluginsArr, 'call_expression')
    .some(call => getCallFunctionName(call) === vikeIdentifier)
}

// Try to find vite config "root" property
export const getProjectRoot = (rootAST: SyntaxNode, cwd: string) => {
  const { obj } = getPluginsData(rootAST)
  if (!obj) return cwd

  let rootPair: SyntaxNode | null = null
  const children = obj.children
  for (let i = children.length - 1; i >= 0; i--) {
    const c = children[i]
    if (c.type === 'pair') {
      const keyText = c.children[0]?.text
      if (keyText === 'root' || keyText === "'root'" || keyText === '"root"') {
        rootPair = c
        break
      }
    }
  }

  if (!rootPair) return cwd

  const rootValNode = rootPair.children.at(-1)
  if (!rootValNode) return cwd

  if (rootValNode.type !== 'string') {
    console.warn(`⚠️ Ignoring non-literal vite.config root (${rootValNode.text}); using ${cwd} as project root`)
    return cwd
  }

  const rootVal = rootValNode.text
  const match = rootVal.match(/^(['"`])(.*)\1$/s)
  if (match) return join(cwd, match[2])

  return cwd
}

export const getTrivia = (path: string, code: string): Trivia => {
  let singleQuotesCount = 0
  let doubleQuotesCount = 0
  for (const char of code) {
    if (char === "'") singleQuotesCount++
    else if (char === '"') doubleQuotesCount++
  }

  const quote = singleQuotesCount >= doubleQuotesCount ? "'" : '"'
  const indent = code.includes('\t') ? '\t' : (code.match(/\r?\n( +)\S/)?.[1] || '  ')
  const eol = code.includes('\r\n') ? '\r\n' : '\n'
  const isTypescript = path.endsWith('.ts')
  const lang = isTypescript ? Lang.TypeScript : Lang.JavaScript

  return {
    quote,
    indent,
    eol,
    lang,
    isTypescript
  }
}
