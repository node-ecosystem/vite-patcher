#!/usr/bin/env node

import patches from '../patches/index.mjs'

const command = process.argv[2]

const patchFunction = patches[command]

if (!patchFunction) {
  console.log('Supported commands:', Object.keys(patches).join(', '));
} else {
  try {
    return patchFunction()
  } catch (error) {
    console.error(`❌ Error during the execution of the command: ${command}`)
    console.error(error)
  }
}

process.exit(1)
