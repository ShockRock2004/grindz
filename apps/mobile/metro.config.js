const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const config = getDefaultConfig(__dirname)

/*
 * Keep the verification fixture out of shipping bundles entirely.
 *
 * verify-fixture.ts carries stub sessions and six weeks of sample sets so the
 * emulator can be screenshotted without network access. Guarding its call sites
 * behind `if (VERIFY)` is not enough — Metro still resolves the module and its
 * sample data ends up in the bundle as unreachable dead code. Redirecting the
 * resolver means a production build never pulls the file in at all.
 */
const REAL = path.resolve(__dirname, 'src/lib/verify-fixture.ts')
const STUB = path.resolve(__dirname, 'src/lib/verify-fixture.stub.ts')

if (process.env.EXPO_PUBLIC_VERIFY !== '1') {
  const upstream = config.resolver.resolveRequest
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    const resolved = (upstream ?? context.resolveRequest)(context, moduleName, platform)
    if (resolved?.type === 'sourceFile' && path.resolve(resolved.filePath) === REAL) {
      return { type: 'sourceFile', filePath: STUB }
    }
    return resolved
  }
}

module.exports = config
