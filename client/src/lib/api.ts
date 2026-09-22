/** 服务端 API 客户端（主题列表 / SSE 生成流） */
import type { GenerateParams, GenerateStage, ThemeInfo } from '../types'
import { getAiSettings } from './settings'

export async function fetchThemes(): Promise<ThemeInfo[]> {
  const res = await fetch('/api/themes')
  if (!res.ok) throw new Error(`获取主题失败: HTTP ${res.status}`)
  const data = (await res.json()) as { themes: ThemeInfo[] }
  return data.themes
}

export interface GenerateCallbacks {
  onStage: (stage: GenerateStage, message: string) => void
  onToken?: (chars: number) => void
  onResult: (payload: {
    xml: string
    graph: unknown
    title: string
    themeId: string
  }) => void
  onError: (message: string) => void
}

interface SseMessage {
  type: 'stage' | 'token' | 'result' | 'error'
  stage?: GenerateStage
  message?: string
  chars?: number
  xml?: string
  graph?: unknown
  title?: string
  themeId?: string
}

function handleSseBlock(raw: string, callbacks: GenerateCallbacks): void {
  let data = ''
  for (const line of raw.split('\n')) {
    if (line.startsWith('data:')) data += line.slice(5).trim()
  }
  if (!data) return
  let msg: SseMessage
  try {
    msg = JSON.parse(data) as SseMessage
  } catch {
    return
  }
  switch (msg.type) {
    case 'stage':
      if (msg.stage && msg.message) callbacks.onStage(msg.stage, msg.message)
      break
    case 'token':
      if (typeof msg.chars === 'number') callbacks.onToken?.(msg.chars)
      break
    case 'result':
      if (msg.xml != null) {
        callbacks.onResult({
          xml: msg.xml,
          graph: msg.graph,
          title: msg.title ?? 'AI 生成',
          themeId: msg.themeId ?? '',
        })
      }
      break
    case 'error':
      callbacks.onError(msg.message ?? '生成失败')
      break
  }
}

/** 发起 SSE 生成请求，流式回调各阶段与结果 */
export async function generateDiagramStream(
  params: GenerateParams,
  callbacks: GenerateCallbacks,
  signal?: AbortSignal,
): Promise<void> {
  const settings = getAiSettings()
  let res: Response
  try {
    res = await fetch('/api/generate/stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey ? { 'x-deepseek-key': settings.apiKey } : {}),
      },
      body: JSON.stringify({ ...params, model: settings.model || undefined }),
      signal,
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return
    callbacks.onError('网络请求失败，请确认服务端已启动')
    return
  }

  if (!res.ok) {
    let detail = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { message?: string }
      if (body.message) detail = body.message
    } catch {
      // ignore
    }
    callbacks.onError(`请求失败: ${detail}`)
    return
  }
  if (!res.body) {
    callbacks.onError('服务端未返回数据流')
    return
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, idx)
        buffer = buffer.slice(idx + 2)
        handleSseBlock(block, callbacks)
      }
    }
    // 处理结尾残余
    if (buffer.trim()) handleSseBlock(buffer, callbacks)
  } catch (e) {
    if ((e as Error).name !== 'AbortError') {
      callbacks.onError('数据流中断，请重试')
    }
  }
}
