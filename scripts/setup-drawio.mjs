#!/usr/bin/env node
/**
 * 拉取 jgraph/drawio 的 webapp 静态资源到 client/public/drawio
 *
 * 说明：
 * - 只下载 src/main/webapp 目录（sparse checkout），避免完整克隆仓库
 * - webapp 目录包含预构建的 app.min.js，无需 Java/ant 构建即可直接静态托管
 * - 版本选择顺序：环境变量 DRAWIO_TAG > GitHub latest release > dev 分支
 * - 幂等：目标已存在时跳过，加 --force 重新拉取
 */
import { execFileSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const cacheDir = join(root, '.drawio-src')
const targetDir = join(root, 'client', 'public', 'drawio')
const versionFile = join(root, 'client', 'public', 'drawio.version.txt')
const REPO = 'https://github.com/jgraph/drawio.git'
const force = process.argv.includes('--force')

function log(msg) {
  console.log(`[setup-drawio] ${msg}`)
}

async function resolveTag() {
  if (process.env.DRAWIO_TAG) {
    return process.env.DRAWIO_TAG
  }
  // 1) GitHub latest release
  try {
    const res = await fetch('https://api.github.com/repos/jgraph/drawio/releases/latest', {
      headers: { 'User-Agent': 'drawai-setup' },
    })
    if (res.ok) {
      const data = await res.json()
      if (data && typeof data.tag_name === 'string' && data.tag_name) {
        return data.tag_name
      }
    }
  } catch {
    // ignore
  }
  // 2) dev 分支（webapp 中也包含构建产物）
  return 'dev'
}

function run(cmd, args, opts = {}) {
  log(`$ ${cmd} ${args.join(' ')}`)
  return execFileSync(cmd, args, { stdio: 'inherit', ...opts })
}

function isNonEmptyDir(dir) {
  return existsSync(dir) && readdirSync(dir).length > 0
}

const tag = await resolveTag()
log(`使用 drawio 版本: ${tag}`)

// 目标已存在则跳过（幂等）
if (isNonEmptyDir(targetDir) && !force) {
  log(`目标目录已存在，跳过: ${targetDir}`)
  log('如需重新拉取请执行: npm run setup:drawio -- --force')
  process.exit(0)
}

// 准备缓存源码目录
if (existsSync(cacheDir)) {
  rmSync(cacheDir, { recursive: true, force: true })
}
mkdirSync(dirname(cacheDir), { recursive: true })

log('克隆 drawio 仓库（sparse，仅 webapp 目录，需要几分钟）...')
run('git', [
  'clone',
  '--depth', '1',
  '--filter=blob:none',
  '--sparse',
  '--branch', tag,
  REPO,
  cacheDir,
])

log('设置 sparse-checkout 路径为 src/main/webapp ...')
run('git', ['-C', cacheDir, 'sparse-checkout', 'set', 'src/main/webapp'])

const webappDir = join(cacheDir, 'src', 'main', 'webapp')
if (!existsSync(join(webappDir, 'index.html'))) {
  console.error(`[setup-drawio] 错误: 未找到 ${webappDir}/index.html`)
  process.exit(1)
}

// 复制到目标目录
if (existsSync(targetDir)) {
  rmSync(targetDir, { recursive: true, force: true })
}
mkdirSync(dirname(targetDir), { recursive: true })
log(`复制 webapp -> ${targetDir} ...`)
cpSync(webappDir, targetDir, { recursive: true })

// 记录版本，便于服务端/前端展示
let version = tag
try {
  const versionTxt = join(cacheDir, 'VERSION')
  if (existsSync(versionTxt)) {
    const { readFileSync } = await import('node:fs')
    version = readFileSync(versionTxt, 'utf8').trim()
  }
} catch {
  // ignore
}
writeFileSync(versionFile, `${tag}\n`)

log('完成！')
log(`drawio webapp: ${targetDir} (tag: ${tag}, version: ${version})`)
