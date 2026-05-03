import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { createFolder, getProjectRoot, getTrivia, getViteConfigPath } from '../utils.ts'
import { parse } from '@ast-grep/napi'

export default async function vikeVercel() {
  const cwd = process.env.VITE_PATCHER_CWD || process.cwd()
  const viteConfigPath = getViteConfigPath(cwd)

  const viteConfigCode = readFileSync(viteConfigPath, 'utf8')

  const trivia = getTrivia(viteConfigPath, viteConfigCode)

  patchVercel(trivia, cwd, viteConfigCode)
}

const patchVercel = ({ indent, eol, quote, lang }: Trivia, cwd: string, viteConfigCode: string) => {
  // Create vercel.json file with default configuration
  const vercelJsonCode = `{${eol}`
    + `${indent}"outputDirectory": "dist/client",${eol}`
    + `${indent}"installCommand": "yarn install --immutable",${eol}`
    + `${indent}"rewrites": [${eol}`
    + `${indent}${indent}{${eol}`
    + `${indent}${indent}${indent}"source": "/((?!assets/).*)",${eol}`
    + `${indent}${indent}${indent}"destination": "/api/ssr.js"${eol}`
    + `${indent}${indent}}${eol}`
    + `${indent}]${eol}`
    + `}${eol}`
  const vercelJsonPath = join(cwd, 'vercel.json')
  writeFileSync(vercelJsonPath, vercelJsonCode, 'utf8')
  console.log(`✅ Created ${vercelJsonPath} with default configuration`)

  // Create api/ssr.js file with default serverless function code
  const apiDir = join(cwd, 'api')
  createFolder(apiDir)

  const ssrCode = `import { app } from ${quote}../dist/server/index.mjs${quote}${eol}`
    + `export const GET = app.fetch${eol}`
    + `export const POST = app.fetch${eol}`
  const ssrPath = join(apiDir, 'ssr.js')
  writeFileSync(ssrPath, ssrCode, 'utf8')
  console.log(`✅ Created ${ssrPath} with default serverless function code`)

  // TODO
  // Parse vite.config to find vike plugins and root instead of executing it
  // const rootAST = parse(lang, viteConfigCode).root()
  // const projectRoot = getProjectRoot(rootAST, cwd)
}
