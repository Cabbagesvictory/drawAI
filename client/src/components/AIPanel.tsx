/** AI 生成面板：技术文档输入、主题选择、生成进度 */
import { useEffect, useRef, useState } from 'react'
import { Check, FileText, Loader2, Sparkles, Wand2 } from 'lucide-react'
import { useAppStore } from '../stores/app-store'
import { fetchThemes, generateDiagramStream } from '../lib/api'
import type { GenerateStage, LayoutDirection, ThemeInfo } from '../types'

interface Props {
  onOpenSettings: () => void
}

const STAGES: { key: GenerateStage; label: string }[] = [
  { key: 'analyzing', label: '解析技术文档' },
  { key: 'generating', label: '设计架构结构' },
  { key: 'layout', label: '计算自动布局' },
  { key: 'render', label: '渲染配色样式' },
]

const EXAMPLE_DOC = `# 订单系统技术方案

## 总体架构
系统采用前后端分离 + 微服务架构。用户通过 Web 前端和移动 App 访问，请求首先经过 Nginx 负载均衡，
再进入 API 网关（Spring Cloud Gateway）完成鉴权与限流。

## 服务划分
- 订单服务：负责订单创建、状态流转，使用 PostgreSQL 存储订单数据
- 库存服务：扣减库存，Redis 缓存热点库存，通过 Kafka 接收订单事件异步扣减
- 支付服务：对接第三方支付渠道
- 用户服务：管理用户信息，MySQL 存储

## 数据与中间件
- 订单库、用户库使用 MySQL 主从
- 缓存层使用 Redis 集群
- 消息队列使用 Kafka 处理订单-库存-积分的异步链路

## 可观测性
使用 Prometheus + Grafana 监控，ELK 收集日志`

const LAYOUT_OPTIONS: { value: LayoutDirection; label: string; hint: string }[] = [
  { value: 'FREE', label: '自由布局', hint: '不限定方向，自动选择更贴合画布的排布' },
  { value: 'LR', label: '横向', hint: '主链路从左向右展开' },
  { value: 'TB', label: '纵向', hint: '主链路从上向下展开' },
]

function ThemeCard({
  theme,
  active,
  onClick,
}: {
  theme: ThemeInfo
  active: boolean
  onClick: () => void
}) {
  const previewTypes = ['client', 'gateway', 'service', 'database', 'queue'] as const
  return (
    <button
      onClick={onClick}
      title={theme.name}
      className={`flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
        active ? 'border-blue-400 bg-blue-50 ring-1 ring-blue-300' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <div className="flex items-center gap-1">
        {previewTypes.map((t) => (
          <span
            key={t}
            className="h-4 w-4 rounded-full border"
            style={{
              backgroundColor: theme.nodes[t]?.fill,
              borderColor: theme.nodes[t]?.stroke,
            }}
          />
        ))}
      </div>
      <span className={`text-xs ${active ? 'font-medium text-blue-700' : 'text-slate-600'}`}>
        {theme.name}
      </span>
    </button>
  )
}

export function AIPanel({ onOpenSettings }: Props) {
  const [doc, setDoc] = useState('')
  const [themes, setThemes] = useState<ThemeInfo[]>([])
  const [themeId, setThemeId] = useState('')
  const [direction, setDirection] = useState<LayoutDirection>('FREE')
  const [progress, setProgress] = useState<{ stage: GenerateStage; message: string }[]>([])
  const [tokenChars, setTokenChars] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const generating = useAppStore((s) => s.generating)
  const abortRef = useRef<AbortController | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchThemes()
      .then((ts) => {
        setThemes(ts)
        setThemeId((cur) => (cur && ts.some((t) => t.id === cur) ? cur : (ts[0]?.id ?? '')))
      })
      .catch(() => {
        // 主题服务不可用时保持为空，生成时由服务端使用默认主题
      })
  }, [])

  // 进度面板在生成按钮下方：面板内容较长时会被挤出视野，开始时自动滚入
  useEffect(() => {
    if (!generating) return
    progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [generating])

  // 错误信息在进度下方，出现时同样滚入视野
  useEffect(() => {
    if (error) errorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [error])

  const currentStage = progress.length > 0 ? progress[progress.length - 1].stage : null
  const directionHint = LAYOUT_OPTIONS.find((item) => item.value === direction)?.hint

  function stageStatus(stage: GenerateStage): 'pending' | 'active' | 'done' {
    if (currentStage == null) return 'pending'
    const order = STAGES.map((s) => s.key)
    const cur = order.indexOf(currentStage)
    const idx = order.indexOf(stage)
    if (cur < 0) return 'pending'
    if (idx < cur) return 'done'
    if (idx === cur) return 'active'
    return 'pending'
  }

  async function handleGenerate() {
    const text = doc.trim()
    if (!text || generating) return
    setError(null)
    setProgress([])
    setTokenChars(0)
    useAppStore.getState().setGenerating(true)
    const controller = new AbortController()
    abortRef.current = controller
    let succeeded = false
    let errorMessage: string | null = null

    await generateDiagramStream(
      { document: text, themeId, direction },
      {
        onStage: (stage, message) => {
          setProgress((prev) => {
            const next = [...prev]
            const existing = next.findIndex((p) => p.stage === stage)
            if (existing >= 0) next[existing] = { stage, message }
            else next.push({ stage, message })
            return next
          })
        },
        onToken: (chars) => setTokenChars(chars),
        onResult: (payload) => {
          succeeded = true
          const state = useAppStore.getState()
          void state
            .createDiagram({
              name: payload.title || 'AI 生成架构图',
              xml: payload.xml,
              graph: payload.graph,
              themeId: payload.themeId || themeId,
              sourceDoc: text,
            })
            .then(() => {
              useAppStore.getState().setStatusMessage('架构图已生成，可直接编辑或导出')
            })
        },
        onError: (message) => {
          errorMessage = message
          setError(message)
        },
      },
      controller.signal,
    )

    useAppStore.getState().setGenerating(false)
    abortRef.current = null
    if (!succeeded && !errorMessage) {
      setError('生成未完成，请重试')
    }
  }

  async function handleDocFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const text = await file.text()
    setDoc(text)
  }

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-slate-200 bg-white">
      <div className="flex h-11 items-center gap-2 border-b border-slate-200 px-3">
        <Sparkles size={16} className="text-blue-600" />
        <span className="text-sm font-semibold text-slate-700">AI 生成架构图</span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-3">
        {/* 文档输入 */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-500">技术文档</label>
            <div className="flex items-center gap-2">
              <button
                className="text-xs text-blue-600 hover:text-blue-700 hover:underline"
                onClick={() => setDoc(EXAMPLE_DOC)}
              >
                填入示例
              </button>
              <button
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                onClick={() => fileRef.current?.click()}
              >
                <FileText size={12} /> 上传文件
              </button>
            </div>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".md,.txt,.markdown"
            className="hidden"
            onChange={(e) => void handleDocFile(e)}
          />
          <textarea
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
            placeholder="粘贴技术方案 / 设计文档 / 需求描述，AI 将为你生成配色美观的架构图..."
            className="h-52 w-full resize-none rounded-lg border border-slate-200 p-2.5 text-sm leading-relaxed outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
          />
          <div className="mt-1 text-right text-xs text-slate-400">{doc.length} 字符</div>
        </div>

        {/* 主题选择 */}
        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-500">配色主题</label>
          <div className="grid grid-cols-2 gap-2">
            {themes.map((theme) => (
              <ThemeCard
                key={theme.id}
                theme={theme}
                active={theme.id === themeId}
                onClick={() => setThemeId(theme.id)}
              />
            ))}
            {themes.length === 0 && (
              <div className="col-span-2 rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs text-slate-400">
                主题加载中（需启动服务端）
              </div>
            )}
          </div>
        </div>

        {/* 布局方向（可不选，自由布局由服务端自动选向） */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-500">布局方向</label>
            <span className="text-[11px] text-slate-400">默认自由</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {LAYOUT_OPTIONS.map((item) => (
              <button
                key={item.value}
                onClick={() => setDirection(item.value)}
                className={`rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                  direction === item.value
                    ? 'border-blue-400 bg-blue-50 font-medium text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] leading-relaxed text-slate-400">{directionHint}</p>
        </div>

        {/* 生成按钮 */}
        <button
          onClick={() => void handleGenerate()}
          disabled={!doc.trim() || generating}
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {generating ? (
            <>
              <Loader2 size={16} className="animate-spin" /> 生成中...
            </>
          ) : (
            <>
              <Wand2 size={16} /> 生成架构图
            </>
          )}
        </button>

        {/* 进度 */}
        {(generating || progress.length > 0) && (
          <div ref={progressRef} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="space-y-2">
              {STAGES.map((s) => {
                const status = stageStatus(s.key)
                const message = progress.find((p) => p.stage === s.key)?.message
                return (
                  <div key={s.key} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center">
                      {status === 'done' ? (
                        <Check size={13} className="text-emerald-500" />
                      ) : status === 'active' ? (
                        <Loader2 size={13} className="animate-spin text-blue-500" />
                      ) : (
                        <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                      )}
                    </span>
                    <div className="min-w-0">
                      <span
                        className={
                          status === 'active'
                            ? 'font-medium text-blue-700'
                            : status === 'done'
                              ? 'text-slate-500'
                              : 'text-slate-400'
                        }
                      >
                        {s.label}
                      </span>
                      {status === 'active' && message && (
                        <div className="mt-0.5 truncate text-slate-400">{message}</div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
            {generating && tokenChars > 0 && (
              <div className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-400">
                已输出 {tokenChars} 字符...
              </div>
            )}
          </div>
        )}

        {/* 错误 */}
        {error && (
          <div ref={errorRef} className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
            <div className="font-medium">生成失败</div>
            <div className="mt-1 break-all">{error}</div>
            <button
              className="mt-2 text-blue-600 hover:underline"
              onClick={onOpenSettings}
            >
              检查 API Key 设置
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
