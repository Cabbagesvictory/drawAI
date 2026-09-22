/** 应用主布局：图纸列表 | 画布（工具栏） | AI 面板 */
import { useEffect, useState } from 'react'
import { PenTool, Settings } from 'lucide-react'
import { useAppStore } from './stores/app-store'
import type { DrawioEmbedClient } from './lib/drawio-protocol'
import { DrawioCanvas } from './components/DrawioCanvas'
import { DiagramList } from './components/DiagramList'
import { Toolbar } from './components/Toolbar'
import { AIPanel } from './components/AIPanel'
import { SettingsDialog } from './components/SettingsDialog'

function StatusToast() {
  const statusMessage = useAppStore((s) => s.statusMessage)
  const setStatusMessage = useAppStore((s) => s.setStatusMessage)

  useEffect(() => {
    if (!statusMessage) return
    const timer = setTimeout(() => setStatusMessage(null), 2800)
    return () => clearTimeout(timer)
  }, [statusMessage, setStatusMessage])

  if (!statusMessage) return null
  return (
    <div className="pointer-events-none fixed bottom-5 left-1/2 z-50 -translate-x-1/2">
      <div className="rounded-lg bg-slate-800/95 px-4 py-2 text-sm text-white shadow-lg">
        {statusMessage}
      </div>
    </div>
  )
}

export default function App() {
  const [client, setClient] = useState<DrawioEmbedClient | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const init = useAppStore((s) => s.init)
  const isFullscreen = useAppStore((s) => s.isFullscreen)

  useEffect(() => {
    void init()
  }, [init])

  // 同步浏览器全屏状态（覆盖用户按 Esc 退出等所有进出路径）
  useEffect(() => {
    const onChange = () => useAppStore.getState().setFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  return (
    <div className="flex h-full flex-col">
      {/* 顶栏（全屏时隐藏） */}
      {!isFullscreen && (
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 text-white">
              <PenTool size={15} />
            </div>
            <span className="text-base font-semibold tracking-tight text-slate-800">drawAI</span>
            <span className="ml-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-600">
              基于 drawio 的 AI 架构图画布
            </span>
          </div>
          <button
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => setSettingsOpen(true)}
          >
            <Settings size={15} /> 设置
          </button>
        </header>
      )}

      {/* 主体（全屏时隐藏两侧面板与工具栏，画布铺满页面） */}
      <div className="flex min-h-0 flex-1">
        {!isFullscreen && <DiagramList />}
        <main className="flex min-w-0 flex-1 flex-col">
          {!isFullscreen && <Toolbar client={client} />}
          <div className="min-h-0 flex-1 bg-slate-100">
            <DrawioCanvas onClientReady={setClient} />
          </div>
        </main>
        {!isFullscreen && <AIPanel onOpenSettings={() => setSettingsOpen(true)} />}
      </div>

      <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <StatusToast />
    </div>
  )
}
