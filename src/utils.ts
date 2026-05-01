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
