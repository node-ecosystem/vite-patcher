import { existsSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

export const getPath = (basepath, filename, extensions = ['ts', 'js', 'mjs']) => {
  const configFiles = extensions.map((ext) => `${filename}.${ext}`)
  for (const file of configFiles) {
    const fullPath = resolve(basepath, file)
    if (existsSync(fullPath)) {
      return fullPath
    }
  }
}

export const createFolder = (path) => {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true })
  }
}
