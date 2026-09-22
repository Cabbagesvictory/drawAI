/** DeepSeek（OpenAI 兼容）客户端封装：流式生成 + zod 校验 + 失败重试 */
import OpenAI from 'openai'
import type { ZodError } from 'zod'
import { graphDataSchema, sanitizeGraphData, type GraphData } from '../render/schema.js'
import { FEW_SHOT_MESSAGES, SYSTEM_PROMPT, buildUserPrompt } from '../prompt/index.js'

/** 未配置 API Key */
export class MissingApiKeyError extends Error {
  constructor() {
    super('未配置 DeepSeek API Key：请在服务端 .env 设置 DEEPSEEK_API_KEY，或在前端「设置」面板中填写。')
    this.name = 'MissingApiKeyError'
  }
}

/** 模型输出校验失败（保留原始输出供排查） */
export class GenerationError extends Error {
  readonly raw: string
  constructor(message: string, raw = '') {
    super(message)
    this.name = 'GenerationError'
    this.raw = raw
  }
}

export interface LlmConfig {
  apiKey: string
  model: string
  baseURL: string
}

const DEFAULT_MODEL = 'deepseek-flash'
const DEFAULT_BASE_URL = 'https://api.deepseek.com'

/** key / model 读取顺序：请求头（前端设置面板）> 服务端 `.env` > 默认值 */
export function resolveLlmConfig(headerKey?: string, bodyModel?: string): LlmConfig {
  return {
    apiKey: (headerKey ?? '').trim() || (process.env.DEEPSEEK_API_KEY ?? '').trim(),
    model: (bodyModel ?? '').trim() || (process.env.DEEPSEEK_MODEL ?? '').trim() || DEFAULT_MODEL,
    baseURL: (process.env.DEEPSEEK_BASE_URL ?? '').trim() || DEFAULT_BASE_URL,
  }
}

/** 从模型输出中提取 JSON 本体（容忍 markdown 代码块与多余文字） */
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const body = (fenced ? fenced[1] : text).trim()
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  return start >= 0 && end > start ? body.slice(start, end + 1) : body
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function formatZodError(error: ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('; ')
}

/** 流式调用 chat completions，累积完整文本并回调增量 */
async function streamCompletion(
  client: OpenAI,
  model: string,
  messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[],
  signal: AbortSignal | undefined,
  onDelta?: (chunk: string) => void,
): Promise<string> {
  const stream = await client.chat.completions.create(
    {
      model,
      messages,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      stream: true,
    },
    { signal },
  )
  let text = ''
  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content
    if (delta) {
      text += delta
      onDelta?.(delta)
    }
  }
  return text
}

export interface GenerateGraphOptions {
  document: string
  direction: 'TB' | 'LR'
  config: LlmConfig
  signal?: AbortSignal
  /** 流式增量回调（用于向前端推送进度） */
  onDelta?: (chunk: string) => void
}

export interface GenerateGraphResult {
  data: GraphData
  raw: string
}

const MAX_ATTEMPTS = 2

/**
 * 调用 DeepSeek 生成结构化图数据：
 * 校验失败时携带错误信息自动重试一次（第二次仍失败则抛 GenerationError）。
 */
export async function generateGraphData(options: GenerateGraphOptions): Promise<GenerateGraphResult> {
  const { document, direction, config, signal, onDelta } = options
  if (!config.apiKey) throw new MissingApiKeyError()

  const client = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseURL })
  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...FEW_SHOT_MESSAGES,
    { role: 'user', content: buildUserPrompt(document, direction) },
  ]

  let lastRaw = ''
  let lastError = ''
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const raw = await streamCompletion(client, config.model, messages, signal, onDelta)
    lastRaw = raw
    const parsed = graphDataSchema.safeParse(safeJsonParse(extractJson(raw)))
    if (parsed.success) {
      return { data: sanitizeGraphData(parsed.data), raw }
    }
    lastError = formatZodError(parsed.error)
    if (attempt < MAX_ATTEMPTS) {
      messages.push({ role: 'assistant', content: raw })
      messages.push({
        role: 'user',
        content: `你上一次的输出未通过结构校验：${lastError}。请修正后重新输出完整 JSON 对象，不要包含任何解释或代码块标记。`,
      })
    }
  }
  throw new GenerationError(
    `模型输出未通过结构校验（已自动重试 ${MAX_ATTEMPTS - 1} 次）：${lastError}`,
    lastRaw,
  )
}
