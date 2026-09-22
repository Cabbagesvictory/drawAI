/** AI 设置（API Key / 模型名），存储于浏览器 local storage，请求时经服务端转发 */

export interface AiSettings {
  apiKey: string
  model: string
}

const STORAGE_KEY = 'drawai.aiSettings'
export const DEFAULT_MODEL = 'deepseek-flash'

export function getAiSettings(): AiSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AiSettings>
      return {
        apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
        model: typeof parsed.model === 'string' && parsed.model ? parsed.model : DEFAULT_MODEL,
      }
    }
  } catch {
    // ignore
  }
  return { apiKey: '', model: DEFAULT_MODEL }
}

export function saveAiSettings(settings: AiSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
