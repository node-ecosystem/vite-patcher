import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile, readFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const execAsync = promisify(exec)
const __dirname = dirname(fileURLToPath(import.meta.url))
const PWA_SCRIPT = join(__dirname, '../src/bin/vite-patcher.ts')

const runScriptInDir = async (cwd: string) => {
  return execAsync(`node "${PWA_SCRIPT}" pwa`, {
    env: { ...process.env, VITE_PATCHER_CWD: cwd }
  })
}

const mockVikeProject = async (cwd: string, headContent: string) => {
  await writeFile(join(cwd, 'package.json'), JSON.stringify({
    dependencies: { vike: '^0.4.0' }
  }), 'utf8')

  const pagesDir = join(cwd, 'pages')
  await mkdir(pagesDir, { recursive: true })
  await writeFile(join(pagesDir, '+Head.tsx'), headContent, 'utf8')
}

describe('pwa.ts patch script', () => {

  const testConfig = async (fileName: string, initialContent: string, expectedContains: string[]) => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vite-patcher-test-'))
    try {
      const configPath = join(tempDir, fileName)
      await writeFile(configPath, initialContent, 'utf8')

      await runScriptInDir(tempDir)

      const updatedContent = await readFile(configPath, 'utf8')

      for (const str of expectedContains) {
        assert.ok(updatedContent.includes(str), `Expected ${fileName} to contain "${str}"`)
      }

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

  test('patches correctly when plugins array is missing', async () => {
    const initial = `import { defineConfig } from 'vite'\n\nexport default defineConfig({\n  build: { outDir: 'dist' }\n})\n`
    await testConfig('vite.config.ts', initial, [
      'vite-plugin-pwa',
      'plugins: [',
      'VitePWA'
    ])
  })

  test('patches correctly when plugins array already has items (inserted at the end)', async () => {
    const initial = `import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [\n    react()\n  ]\n})\n`
    await testConfig('vite.config.ts', initial, [
      'vite-plugin-pwa',
      'VitePWA',
      "react(),\n    ...(process.env.NODE_ENV === 'production' ? [VitePWA({"
    ])
  })

  test('respects tab indentation in vite.config and vike +Head (patchViteConfig & patchVikeHeadManifest)', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vite-patcher-test-'))
    try {
      const configPath = join(tempDir, 'vite.config.ts')
      const initialTS = `import { defineConfig } from 'vite'\nimport vike from 'vike/plugin'\n\nexport default defineConfig({\n\tplugins: [\n\t\tvike()\n\t]\n})\n`
      await writeFile(configPath, initialTS, 'utf8')

      const initialHead = `export function Head() {\n\treturn (\n\t\t<>\n\t\t\t<title>My App</title>\n\t\t</>\n\t)\n}\n`
      await mockVikeProject(tempDir, initialHead)

      await runScriptInDir(tempDir)

      const updatedConfig = await readFile(configPath, 'utf8')
      const updatedHead = await readFile(join(tempDir, 'pages', '+Head.tsx'), 'utf8')

      // Verify that tabs were respected in vite.config.ts
      assert.ok(updatedConfig.includes('\t\tvike(),\n\t\t...(process.env.NODE_ENV'), `vite.config.ts should use tab indentation. Got:\n${updatedConfig}`)
      assert.ok(updatedConfig.includes('\t\t\tregisterType: \'autoUpdate\','), `deep vite.config.ts should use double tab indentation. Got:\n${updatedConfig}`)

      // Verify that tabs were respected in +Head.tsx
      assert.ok(updatedHead.includes('\t\t\t<link rel="manifest" href="/manifest.webmanifest" />\n\t\t</>'), `+Head.tsx should use tab indentation. Got:\n${updatedHead}`)

    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })

  test('respects spaces indentation in vite.config and vike +Head (patchViteConfig & patchVikeHeadManifest)', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'vite-patcher-test-'))
    try {
      const configPath = join(tempDir, 'vite.config.ts')
      const initialTS = `import { defineConfig } from 'vite'\nimport vike from 'vike/plugin'\n\nexport default defineConfig({\n    plugins: [\n        vike()\n    ]\n})\n`
      await writeFile(configPath, initialTS, 'utf8')

      const initialHead = `export function Head() {\n    return (\n        <>\n            <title>My App</title>\n        </>\n    )\n}\n`
      await mockVikeProject(tempDir, initialHead)

      await runScriptInDir(tempDir)

      const updatedConfig = await readFile(configPath, 'utf8')
      const updatedHead = await readFile(join(tempDir, 'pages', '+Head.tsx'), 'utf8')

      // Verify that spaces were respected in vite.config.ts (4 spaces base + 4 spaces inner = 8 spaces)
      assert.ok(updatedConfig.includes('        vike(),\n        ...(process.env.NODE_ENV'), `vite.config.ts should use space indentation. Formatted code:\n${updatedConfig}`)
      assert.ok(updatedConfig.includes('            registerType: \'autoUpdate\','), 'deep vite.config.ts should use 12 space indentation')

      // Verify that spaces were respected in +Head.tsx
      assert.ok(updatedHead.includes('            <link rel="manifest" href="/manifest.webmanifest" />\n        </>'), `+Head.tsx should use space indentation. Formatted code:\n${updatedHead}`)

    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
