#!/usr/bin/env node
/**
 * Check that every native module packaged into an app build was compiled for
 * the build's target platform and CPU.
 *
 * electron-builder packages node_modules as they are (npmRebuild is off), so a
 * build made on another OS silently ships the host's binaries — v0.0.2's
 * Windows and Linux builds carried the macOS copy of better-sqlite3.
 *
 * Usage:
 *   node scripts/check-native-modules.mjs <unpacked-app-dir> <darwin|win32|linux> <x64|arm64>
 */

import { closeSync, openSync, readSync, readdirSync } from 'fs'
import { join } from 'path'

const [dir, platform, arch] = process.argv.slice(2)
if (!dir || !['darwin', 'win32', 'linux'].includes(platform) || !['x64', 'arm64'].includes(arch)) {
  console.error(
    'Usage: node scripts/check-native-modules.mjs <unpacked-app-dir> <darwin|win32|linux> <x64|arm64>'
  )
  process.exit(2)
}

// CPU codes from each executable format's header.
const MACHO_CPU = { 0x0100000c: 'arm64', 0x01000007: 'x64' }
const ELF_MACHINE = { 0xb7: 'arm64', 0x3e: 'x64' }
const PE_MACHINE = { 0xaa64: 'arm64', 0x8664: 'x64' }

/** The platform and CPU a native binary was built for, read from its header. */
function identify(file) {
  const head = Buffer.alloc(4096)
  const fd = openSync(file, 'r')
  const length = readSync(fd, head, 0, head.length, 0)
  closeSync(fd)
  if (length >= 8 && head.readUInt32LE(0) === 0xfeedfacf) {
    return `darwin-${MACHO_CPU[head.readUInt32LE(4)] ?? 'unknown'}`
  }
  if (length >= 20 && head.readUInt32BE(0) === 0x7f454c46) {
    return `linux-${ELF_MACHINE[head.readUInt16LE(18)] ?? 'unknown'}`
  }
  if (length >= 0x40 && head.toString('latin1', 0, 2) === 'MZ') {
    const pe = head.readUInt32LE(0x3c)
    if (pe + 6 <= length) return `win32-${PE_MACHINE[head.readUInt16LE(pe + 4)] ?? 'unknown'}`
  }
  return 'unrecognised'
}

const expected = `${platform}-${arch}`
const modules = readdirSync(dir, { recursive: true })
  .map(String)
  .filter((path) => path.endsWith('.node'))

if (modules.length === 0) {
  console.error(`❌  No native modules found under ${dir} — is that an unpacked app directory?`)
  process.exit(1)
}

const wrong = modules
  .map((path) => ({ path, found: identify(join(dir, path)) }))
  .filter(({ found }) => found !== expected)

if (wrong.length > 0) {
  console.error(`❌  Native modules not built for ${expected}:`)
  for (const { path, found } of wrong) console.error(`  ${path}: ${found}`)
  process.exit(1)
}

console.log(`✅  All ${modules.length} native modules are built for ${expected}.`)
