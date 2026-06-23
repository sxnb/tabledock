#!/usr/bin/env node
/**
 * Release script for TableDock.
 *
 * Usage:
 *   node scripts/release.mjs            # preview title + notes only
 *   node scripts/release.mjs --publish  # tag + create draft GitHub release
 *
 * Requires GITHUB_TOKEN env var when --publish is used.
 * Create one at: GitHub → Settings → Developer settings → Personal access tokens
 * Scopes needed: Contents (read + write) on the tabledock repo.
 */

import { execSync } from 'child_process'
import { readFileSync, writeFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { tmpdir } from 'os'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const publish = process.argv.includes('--publish')

// ── Version ──────────────────────────────────────────────────────────────────

const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'))
const version = pkg.version
const tag = `v${version}`
const title = `TableDock ${tag}`

// ── Safety checks ─────────────────────────────────────────────────────────────

// Only check tracked files — untracked files don't affect the release.
const dirty = execSync('git status --porcelain', { encoding: 'utf-8', cwd: root })
  .split('\n')
  .filter((line) => line.length > 0 && !line.startsWith('??'))
  .join('\n')
  .trim()
if (dirty) {
  console.error('❌  Uncommitted changes detected. Commit or stash them first.\n')
  console.error(dirty)
  process.exit(1)
}

const currentBranch = execSync('git branch --show-current', { encoding: 'utf-8', cwd: root }).trim()
if (currentBranch !== 'master' && currentBranch !== 'main') {
  console.error(`❌  Not on master/main (currently on "${currentBranch}").`)
  process.exit(1)
}

const localHead = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd: root }).trim()
const remoteHead = execSync(`git rev-parse origin/${currentBranch}`, { encoding: 'utf-8', cwd: root }).trim()
if (localHead !== remoteHead) {
  console.error(`❌  Local HEAD is ahead of or behind origin/${currentBranch}. Push first.`)
  process.exit(1)
}

const existingTag = execSync('git tag --list', { encoding: 'utf-8', cwd: root })
  .split('\n')
  .find((t) => t.trim() === tag)
if (existingTag) {
  console.error(`❌  Tag ${tag} already exists. Bump the version in package.json first.`)
  process.exit(1)
}

// ── Commits since last tag ────────────────────────────────────────────────────

let prevTag
try {
  prevTag = execSync('git describe --tags --abbrev=0', { encoding: 'utf-8', cwd: root }).trim()
} catch {
  prevTag = null
}

const range = prevTag ? `${prevTag}..HEAD` : 'HEAD'
const rawLog = execSync(`git log ${range} --pretty=format:"%s"`, { encoding: 'utf-8', cwd: root })
const commits = rawLog.trim().split('\n').filter(Boolean)

if (commits.length === 0) {
  console.error(`❌  No commits since ${prevTag ?? 'the beginning'}. Nothing to release.`)
  process.exit(1)
}

// ── Categorise ────────────────────────────────────────────────────────────────

const categories = {
  '✨ New': [],
  '🐛 Fixes': [],
  '🔧 Improvements': [],
  '📦 Other': [],
}

const NEW_RE = /^(add|new|implement|introduce|support)/i
const FIX_RE = /^(fix|correct|resolve|repair|revert)/i
const IMP_RE = /^(update|improve|refine|polish|tidy|simplify|refactor|enhance|optimise|optimize|clean|reduce|rename|remove|split|migrate|bump|move)/i

for (const msg of commits) {
  if (NEW_RE.test(msg)) categories['✨ New'].push(msg)
  else if (FIX_RE.test(msg)) categories['🐛 Fixes'].push(msg)
  else if (IMP_RE.test(msg)) categories['🔧 Improvements'].push(msg)
  else categories['📦 Other'].push(msg)
}

// ── Build markdown ────────────────────────────────────────────────────────────

let notes = ''
for (const [heading, items] of Object.entries(categories)) {
  if (items.length === 0) continue
  notes += `### ${heading}\n\n`
  for (const item of items) notes += `- ${item}\n`
  notes += '\n'
}
notes = notes.trimEnd()

// ── Preview ───────────────────────────────────────────────────────────────────

console.log('─'.repeat(60))
console.log(`  Title: ${title}`)
console.log('─'.repeat(60))
console.log(notes)
console.log('─'.repeat(60))

if (!publish) {
  console.log('\nRun with --publish to tag and create a draft GitHub release.')
  process.exit(0)
}

// ── Publish ───────────────────────────────────────────────────────────────────

const token = process.env.GITHUB_TOKEN
if (!token) {
  console.error('\n❌  GITHUB_TOKEN is not set. Export it and try again.')
  process.exit(1)
}

// Derive owner/repo from the remote URL.
const remoteUrl = execSync('git remote get-url origin', { encoding: 'utf-8', cwd: root }).trim()
const repoMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)(\.git)?$/)
if (!repoMatch) {
  console.error(`❌  Could not parse GitHub repo from remote URL: ${remoteUrl}`)
  process.exit(1)
}
const [, owner, repo] = repoMatch

// Create and push the tag.
console.log(`\nTagging ${tag}…`)
execSync(`git tag -a ${tag} -m "Release ${tag}"`, { cwd: root, stdio: 'inherit' })
execSync(`git push origin ${tag}`, { cwd: root, stdio: 'inherit' })

// Write payload to a temp file to avoid shell-escaping issues.
const payload = JSON.stringify({
  tag_name: tag,
  name: title,
  body: notes,
  draft: true,
  prerelease: version.startsWith('0.'),
})
const tmpFile = join(tmpdir(), `tabledock-release-${Date.now()}.json`)
writeFileSync(tmpFile, payload, 'utf-8')

console.log('\nCreating draft GitHub release…')
const response = execSync(
  `curl -s -X POST https://api.github.com/repos/${owner}/${repo}/releases \
    -H "Authorization: Bearer ${token}" \
    -H "Content-Type: application/json" \
    --data-binary @${tmpFile}`,
  { encoding: 'utf-8', cwd: root }
)

let parsed
try {
  parsed = JSON.parse(response)
} catch {
  console.error('❌  Unexpected response from GitHub API:\n', response)
  process.exit(1)
}

if (parsed.html_url) {
  console.log(`\n✅  Draft release created: ${parsed.html_url}`)
  console.log('\nNext steps:')
  console.log('  1. Run `npm run build` to produce the signed + notarized DMG')
  console.log('  2. Upload the .dmg from dist/ to the draft release')
  console.log('  3. Publish the release on GitHub')
} else {
  console.error('❌  GitHub API error:')
  console.error(JSON.stringify(parsed, null, 2))
  process.exit(1)
}
