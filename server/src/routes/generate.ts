/** POST /api/generate/stream：SSE 生成管线（分析 → 生成 → 布局 → 渲染 → 完成） */
import { Router } from 'express'
import type { Request, Response } from 'express'
import {
  GenerationError,
  MissingApiKeyError,
  generateGraphData,
  resolveLlmConfig,
} from '../llm/deepseek.js'
import { MOCK_GRAPH } from '../prompt/index.js'
import { layoutGraph } from '../render/layout.js'
import type { GraphData } from '../render/schema.js'
import { getTheme } from '../render/theme.js'
import { renderXml } from '../render/xml.js'

const MAX_DOC_LENGTH = 24000

interface GenerateBody {
  document?: unknown
  themeId?: unknown
  direction?: unknown
  mock?: unknown
  model?: unknown
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 尽量从 OpenAI SDK 错误中提取可读信息 */
function describeLlmError(error: unknown): string {
  if (error instanceof MissingApiKeyError || error instanceof GenerationError) return error.message
  const status = (error as { status?: number }).status
  const apiMessage = (error as { error?: { message?: string } }).error?.message
  if (status === 401) return 'API Key 无效或已过期，请检查「设置」面板或服务端 .env 配置。'
  if (status === 402) return 'DeepSeek 账户余额不足，请充值后重试。'
  if (status === 429) return '请求过于频繁（429），请稍后重试。'
  if (typeof status === 'number' && status >= 500) return `DeepSeek 服务暂不可用（${status}），请稍后重试。`
  if (apiMessage) return `调用模型失败：${apiMessage}`
  if (error instanceof Error) return `生成失败：${error.message}`
  return '生成失败：未知错误'
}

export const generateRouter = Router()

generateRouter.post('/stream', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as GenerateBody
  const document = typeof body.document === 'string' ? body.document.trim() : ''
  if (!document) {
    res.status(400).json({ message: '缺少技术文档内容（document）' })
    return
  }
  if (document.length > MAX_DOC_LENGTH) {
    res.status(400).json({ message: `技术文档过长（${document.length} 字符），请控制在 ${MAX_DOC_LENGTH} 字符以内` })
    return
  }

  const theme = getTheme(typeof body.themeId === 'string' ? body.themeId : null)
  const direction: 'TB' | 'LR' = body.direction === 'TB' ? 'TB' : 'LR'
  const headerKey = typeof req.headers['x-deepseek-key'] === 'string' ? req.headers['x-deepseek-key'] : undefined
  const config = resolveLlmConfig(headerKey, typeof body.model === 'string' ? body.model : undefined)
  const useMock = body.mock === true || !config.apiKey

  // ---- SSE 基础 ----
  res.status(200)
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const send = (payload: Record<string, unknown>) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(payload)}\n\n`)
  }
  const stage = (s: string, message: string) => send({ type: 'stage', stage: s, message })
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n')
  }, 15000)

  // 客户端断开时中止上游 LLM 请求
  // 注意：不能用 req.on('close')，POST 请求体读完后该事件即触发；
  // 应监听 res 的 close 并用 writableEnded 区分「正常结束」与「连接中断」
  const controller = new AbortController()
  res.on('close', () => {
    if (!res.writableEnded) controller.abort()
  })

  try {
    // ---- 阶段 1：解析（mock 时直接进入演示） ----
    if (useMock) {
      stage('analyzing', '未配置 API Key，使用内置示例数据（演示模式）')
      await delay(500)
      stage('generating', '正在准备示例架构结构…')
      await delay(700)
    } else {
      stage('analyzing', '正在解析技术文档…')
      await delay(200)
      stage('generating', `正在调用 ${config.model} 设计架构结构…`)
    }

    // ---- 阶段 2：生成结构化数据 ----
    let data: GraphData
    if (useMock) {
      data = MOCK_GRAPH
    } else {
      let charCount = 0
      let lastSentAt = 0
      const result = await generateGraphData({
        document,
        direction,
        config,
        signal: controller.signal,
        onDelta: (chunk) => {
          charCount += chunk.length
          const now = Date.now()
          if (now - lastSentAt > 120) {
            lastSentAt = now
            send({ type: 'token', chars: charCount })
          }
        },
      })
      data = result.data
    }

    if (controller.signal.aborted) return

    // ---- 阶段 3：自动布局 ----
    stage('layout', '正在计算自动布局…')
    await delay(useMock ? 400 : 30)
    const layout = await layoutGraph(data, direction)

    // ---- 阶段 4：主题渲染 ----
    stage('render', `正在渲染「${theme.name}」主题…`)
    await delay(useMock ? 400 : 30)
    const xml = renderXml(data, layout, theme)

    // ---- 完成 ----
    stage('done', '生成完成')
    send({
      type: 'result',
      xml,
      graph: data,
      title: data.title ?? 'AI 生成架构图',
      themeId: theme.id,
    })
  } catch (error) {
    if (!controller.signal.aborted) {
      send({ type: 'error', message: describeLlmError(error) })
    }
  } finally {
    clearInterval(heartbeat)
    if (!res.writableEnded) res.end()
  }
})
