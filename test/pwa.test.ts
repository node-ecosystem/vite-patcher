import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const execAsync = promisify(exec)
const __dirname = dirname(fileURLToPath(import.meta.url))
const PWA_SCRIPT = join(__dirname, '../src/bin/vite-patcher.ts')

describe('pwa.ts patch script', () => {
  const runScriptInDir = async (cwd: string) => {
    return execAsync(`node "${PWA_SCRIPT}" pwa`, {
      env: { ...process.env, VITE_PATCHER_CWD: cwd }
    })
  }

  const testConfig = async (fileName: string, initialContent: string, expectedContains: string[]) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vite-patcher-test-'))
    try {
      const configPath = join(tempDir, fileName)
      await writeFile(configPath, initialContent, 'utf-8')

      await runScriptInDir(tempDir)

      const updatedContent = await readFile(configPath, 'utf-8')

      expectedContains.forEach((str) => {
        assert.ok(updatedContent.includes(str), `Expected ${fileName} to contain "${str}"`)
      })

    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  }

  test('patches vite.config.ts successfully', async () => {
    const initialTS = `import { defineConfig } from 'vite'\n\nexport default defineConfig({\n  plugins: []\n})\n`
    await testConfig('vite.config.ts', initialTS, [
      'vite-plugin-pwa',
      'VitePWA',
      'applyToEnvironment(environment: { name: string })'
    ])
  })

  test('patches vite.config.js successfully', async () => {
    const initialJS = `export default {\n  plugins: []\n}\n`
    await testConfig('vite.config.js', initialJS, [
      'vite-plugin-pwa',
      'VitePWA',
      'applyToEnvironment(environment)'
    ])
  })

  test('patches vite.config.mjs successfully', async () => {
    const initialMJS = `import { defineConfig } from 'vite'\n\nexport default defineConfig({\n  plugins: []\n})\n`
    await testConfig('vite.config.mjs', initialMJS, [
      'vite-plugin-pwa',
      'VitePWA',
      'applyToEnvironment(environment)'
    ])
  })
})
