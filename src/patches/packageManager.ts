import { exec } from 'node:child_process'

const INSTALL = {
  npm: (vitePlugin: string) => `npm install -D ${vitePlugin}`,
  yarn: (vitePlugin: string) => `yarn add -D ${vitePlugin}`,
  pnpm: (vitePlugin: string) => `pnpm add -D ${vitePlugin}`
}

export const installVitePlugin = async (vitePlugin: string) => {
  const installCommand = getInstallCommand(vitePlugin)
  if (!installCommand) return false

  try {
    await new Promise((resolve, reject) => {
      exec(installCommand, (error, stdout) => {
        if (error) {
          console.error(`Error installing ${vitePlugin}:`, error)
          reject(error)
        } else {
          console.log(stdout)
          resolve(true)
        }
      })
    })
  } catch (error) {
    console.error(`Failed to install ${vitePlugin}:`, error)
    throw error
  }
}

const getInstallCommand = (vitePlugin: string) => {
  const packageManager = process.argv[0]
  const installer = INSTALL[packageManager as keyof typeof INSTALL]
  if (!installer) {
    console.warn(`⚠️ Unsupported package manager "${packageManager}". Supported package managers are: ${Object.keys(INSTALL).join(', ')}. Please install ${vitePlugin} manually.`)
    return null
  }
  return installer(vitePlugin)
}
