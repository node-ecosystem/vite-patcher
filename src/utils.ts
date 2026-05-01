import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import type { SgNode } from '@ast-grep/napi'
import type { Kinds, TypesMap } from '@ast-grep/napi/types/staticTypes'

export const getPath = (basepath: string, filename: string, extensions = ['ts', 'js', 'mjs']) => {
  const configFiles = extensions.map((ext) => `${filename}.${ext}`)
  for (const file of configFiles) {
    const fullPath = resolve(basepath, file)
    if (existsSync(fullPath)) {
      return fullPath
    }
  }
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

// Find the configuration object literal and its plugins array
export const getPluginsData = (rootAST: SgNode<TypesMap, Kinds<TypesMap>>) => {
  const obj = rootAST.find({ rule: { kind: 'export_statement' } })?.find({ rule: { kind: 'object' } }) || rootAST.find({ rule: { kind: 'object' } })
  const arr = obj?.find({ rule: { kind: 'property_identifier', regex: '^plugins$' } })?.parent()?.find({ rule: { kind: 'array' } })
  return { obj, arr }
}

// Check vike in vite.config dependencies (import statement = import vike from 'vike/plugin')
export const isVikePluginUsed = (rootAST: SgNode<TypesMap, Kinds<TypesMap>>) => {
  let isVikePluginUsed = false
  const vikeImportMatch = rootAST.find({ rule: { pattern: 'import $V from \'vike/plugin\'' } })
  const vikeIdentifier = vikeImportMatch?.getMatch('V')?.text()
  if (vikeIdentifier) {
    const { arr: pluginsArr } = getPluginsData(rootAST)
    if (pluginsArr) {
      // Find a call_expression where the function name matches the vike identifier
      const calls = pluginsArr.findAll({ rule: { kind: 'call_expression' } })
      isVikePluginUsed = calls.some(call => {
        const identifier = call.find({ rule: { kind: 'identifier' } })
        return identifier?.text() === vikeIdentifier
      })
    }
  }
  return isVikePluginUsed
}
