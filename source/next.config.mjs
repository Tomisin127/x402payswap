// @ts-nocheck
import { fileURLToPath } from 'url'
import path from 'path'

// User-level config (was in next.user-config.mjs, which is gitignored).
const userConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

const __v0_turbopack_root = "/vercel/share/v0-project" ?? path.dirname(fileURLToPath(import.meta.url))

export default async function v0NextConfig(phase, { defaultConfig }) {
  return {
    ...userConfig,
    distDir: '.next',
    devIndicators: false,
    images: {
      ...userConfig.images,
      unoptimized: process.env.NODE_ENV === 'development' || userConfig.images?.unoptimized,
    },
    logging: {
      ...userConfig.logging,
      fetches: { fullUrl: true, hmrRefreshes: true },
      browserToTerminal: true,
    },
    turbopack: {
      ...userConfig.turbopack,
      root: __v0_turbopack_root,
    },
    experimental: {
      ...userConfig.experimental,
      transitionIndicator: true,
      turbopackFileSystemCacheForDev:
        process.env.TURBOPACK_PERSISTENT_CACHE !== 'false' &&
        process.env.TURBOPACK_PERSISTENT_CACHE !== '0',
      serverActions: {
        ...userConfig.experimental?.serverActions,
        allowedOrigins: [
          ...(userConfig.experimental?.serverActions?.allowedOrigins || []),
          '*.vusercontent.net',
        ],
      },
    },
    allowedDevOrigins: [
      ...(userConfig.allowedDevOrigins || []),
      '*.vusercontent.net',
      '*.dev-vm.vusercontent.net',
    ],
  }
}
