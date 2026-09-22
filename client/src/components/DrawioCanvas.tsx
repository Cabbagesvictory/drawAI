/**
 * drawio 画布容器：负责 iframe 生命周期、协议握手、图纸加载与 autosave 持久化
 */
import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/app-store'
import { DrawioEmbedClient } from '../lib/drawio-protocol'
import { computeXmlBounds } from '../lib/xml-bounds'
import { downloadDataUri } from '../lib/download'

interface Props {
  /** 客户端实例就绪（卸载时为 null），供工具栏等组件调用 */
  onClientReady: (client: DrawioEmbedClient | null) => void
}

export function DrawioCanvas({ onClientReady }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const clientRef = useRef<DrawioEmbedClient | null>(null)
  /** 加载期间禁止接收 autosave，避免旧图内容写入新图 */
  const acceptingAutosaveRef = useRef(false)
  /** 当前已加载的图纸 id（autosave 写入目标） */
  const loadedIdRef = useRef<string | null>(null)

  const currentId = useAppStore((s) => s.currentId)
  const canvasReady = useAppStore((s) => s.canvasReady)
  const pendingLoad = useAppStore((s) => s.pendingLoad)

  // 初始化编辑器（仅一次）
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const client = new DrawioEmbedClient({
      onReady: () => {
        useAppStore.getState().setCanvasReady(true)
      },
      onAutosave: (xml) => {
        if (!acceptingAutosaveRef.current) return
        const id = loadedIdRef.current
        if (!id) return
        void useAppStore.getState().saveXml(id, xml)
      },
      onUiExport: (result) => {
        // 编辑器内部 UI 触发的导出（exportProtocol）统一由宿主下载
        if (result.data) {
          downloadDataUri(result.data, result.filename)
        } else if (result.xml && (result.format === 'xml' || result.format == null)) {
          downloadDataUri(
            `data:application/xml;charset=utf-8,${encodeURIComponent(result.xml)}`,
            result.filename || 'diagram.drawio',
          )
        }
      },
    })
    client.mount(container)
    clientRef.current = client
    onClientReady(client)

    return () => {
      client.destroy()
      clientRef.current = null
      onClientReady(null)
      useAppStore.getState().setCanvasReady(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /** 将 XML 载入画布（统一入口，管理 autosave 开关） */
  const loadXml = async (xml: string, title: string, targetId: string | null) => {
    const client = clientRef.current
    if (!client || !xml) return
    acceptingAutosaveRef.current = false
    loadedIdRef.current = targetId
    try {
      // 预先计算图形包围盒：用 viewbox 双向适配（drawio 的 fit 仅宽度适配）
      const bounds = computeXmlBounds(xml)
      await client.load(xml, {
        title,
        viewbox: bounds ? { ...bounds, border: 24 } : undefined,
        fit: !bounds,
      })
      if (loadedIdRef.current === targetId) {
        acceptingAutosaveRef.current = true
      }
    } catch (e) {
      useAppStore.getState().setStatusMessage(`加载画布失败: ${(e as Error).message}`)
    }
  }

  // 编辑器就绪或切换图纸时加载
  useEffect(() => {
    if (!canvasReady || !currentId) return
    const record = useAppStore.getState().diagrams.find((d) => d.id === currentId)
    if (!record) return
    if (loadedIdRef.current === currentId) return
    void loadXml(record.xml, record.name, currentId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canvasReady, currentId])

  // 响应外部加载请求（AI 生成 / 导入）
  useEffect(() => {
    if (!pendingLoad || !canvasReady) return
    void loadXml(pendingLoad.xml, useAppStore.getState().getCurrent()?.name ?? '', loadedIdRef.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingLoad, canvasReady])

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />
      {!canvasReady && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-50">
          <div className="flex flex-col items-center gap-3 text-slate-500">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-blue-500" />
            <div className="text-sm">正在加载 drawio 编辑器...</div>
          </div>
        </div>
      )}
    </div>
  )
}
