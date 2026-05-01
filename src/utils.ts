import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SgNode } from '@ast-grep/napi'
import type { Kinds, TypesMap } from '@ast-grep/napi/types/staticTypes'

export const getPath = (basepath: string, filename: string, extensions = ['ts', 'js', 'mjs']) => {
  for (const ext of extensions) {
    const fullPath = resolve(basepath, `${filename}.${ext}`)
    if (existsSync(fullPath)) return fullPath
  }
  return undefined
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
  if (!obj) {
    return { obj: null, arr: null }
  }
  const arr = obj
    .find({ rule: { kind: 'property_identifier', regex: '^plugins$' } })
    ?.parent()?.find({ rule: { kind: 'array' } })
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
  const rootVal = rootAST.find({ rule: { pattern: 'root: $ROOT' } })?.getMatch('ROOT')?.text()
  if (!rootVal) return cwd

  const match = rootVal.match(/^(['"`])(.*)\1$/s)
  if (match) return resolve(cwd, match[2])

  console.warn(`⚠️ Ignoring non-literal vite.config root (${rootVal}); using ${cwd} as project root`)
  return cwd
}
