/** Express 入口：API 路由 + 生产静态托管（SPA 与 drawio 资源） */
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import { themes } from './render/theme.js'
import { generateRouter } from './routes/generate.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// 依次尝试项目根与 server 目录下的 .env（兼容 tsx 运行 src/ 与编译后运行 dist/）
dotenv.config({
  path: [path.resolve(__dirname, '../../.env'), path.resolve(__dirname, '../.env')],
  quiet: true,
})

const app = express()
app.disable('x-powered-by')
app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    model: (process.env.DEEPSEEK_MODEL ?? '').trim() || 'deepseek-flash',
    hasServerKey: Boolean((process.env.DEEPSEEK_API_KEY ?? '').trim()),
  })
})

app.get('/api/themes', (_req, res) => {
  res.json({ themes })
})

app.use('/api/generate', generateRouter)

// 其余 /api 路径统一 404（避免落到 SPA fallback）
app.use('/api', (_req, res) => {
  res.status(404).json({ message: '接口不存在' })
})

// ---- 生产：托管 client/dist（Vite 构建产物，client/public/drawio 会被拷贝进其中） ----
const clientDist = path.resolve(__dirname, '../../client/dist')
if (existsSync(clientDist)) {
  app.use('/drawio', express.static(path.join(clientDist, 'drawio'), { maxAge: '7d', immutable: true }))
  app.use(express.static(clientDist, { maxAge: '1h', index: 'index.html' }))
  // SPA 兜底：非 /api 的 GET 请求回退到 index.html
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) return next()
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

const port = Number(process.env.PORT ?? 3000)
app.listen(port, () => {
  const hasKey = Boolean((process.env.DEEPSEEK_API_KEY ?? '').trim())
  console.log(`[drawAI] 服务端已启动: http://localhost:${port}`)
  if (!hasKey) {
    console.log('[drawAI] 未检测到 DEEPSEEK_API_KEY：生成接口将返回内置演示数据（mock），可在前端「设置」面板填入 Key')
  }
  if (!existsSync(clientDist)) {
    console.log('[drawAI] 未找到 client/dist（生产托管已关闭）：开发模式请另开终端运行 npm run dev:client')
  }
})
