#!/usr/bin/env node

import patches from '../patches/index.ts'

const command = process.argv[2]

const patchFunction = patches[command]

if (patchFunction) {
  try {
    await patchFunction()
    process.exit(0)
  } catch (error) {
    console.error(`❌ Error during the execution of the command: "vite-patcher ${command}"`, error)
    process.exit(1)
  }
} else {
  console.warn(`⚠️ Supported commands: "vite-patcher ${Object.keys(patches).join(', ')}"`)
  process.exit(1)
}

