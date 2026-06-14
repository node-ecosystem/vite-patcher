#!/usr/bin/env node

import patches from '../patches/index.ts'

const command = process.argv[2]

const patchFunction = patches[command as keyof typeof patches]

if (patchFunction) {
  try {
    await patchFunction()
  } catch (error) {
    console.error(`❌ Error during the execution of the command: "vite-patcher ${command}"`, error)
    process.exitCode = 1
  }
} else {
  console.warn(`⚠️ Supported commands: "vite-patcher ${Object.keys(patches).join(', ')}"`)
  process.exitCode = 1
}
