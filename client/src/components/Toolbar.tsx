/** 画布工具栏：保存 / 导入 / 导出 / 撤销重做 / 缩放 */
import { useRef, useState, useEffect } from 'react'
import {
  Download,
  Maximize,
  Minimize,
  Plus,
  Redo2,
  Save,
  Target,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { DrawioEmbedClient, ExportFormat } from '../lib/drawio-protocol'
import { computeXmlBounds } from '../lib/xml-bounds'
import { useAppStore } from '../stores/app-store'
import { downloadDataUri, downloadText } from '../lib/download'

interface Props {
  client: DrawioEmbedClient | null
}

const EXPORT_ITEMS: { format: ExportFormat; label: string; ext: string }[] = [
  { format: 'png', label: 'PNG 图片 (2x)', ext: '.png' },
  { format: 'svg', label: 'SVG 矢量图', ext: '.svg' },
  { format: 'xmlsvg', label: 'SVG (含可编辑数据)', ext: '.svg' },
  { format: 'xml', label: 'drawio 源文件', ext: '.drawio' },
]

function bytesToBase64(bytes: ArrayBuffer): string {
  const arr = new Uint8Array(bytes)
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < arr.length; i += chunk) {
    binary += String.fromCharCode(...arr.subarray(i, i + chunk))
  }
  return btoa(binary)
}

/** 生成小尺寸缩略图（data URL） */
export async function captureThumbnail(client: DrawioEmbedClient): Promise<string | undefined> {
  try {
    const res = await client.exportDiagram({ format: 'png', scale: 0.25, border: 10 })
    return res.data
  } catch {
    return undefined
  }
}

export function Toolbar({ client }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const exportMenuRef = useRef<HTMLDivElement>(null)
  const isFullscreen = useAppStore((s) => s.isFullscreen)

  // 点击外部关闭导出菜单
  useEffect(() => {
    if (!exportOpen) return
    const onClick = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [exportOpen])

  const btnCls =
    'inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm text-slate-600 hover:bg-slate-200/70 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40'

  async function handleSave() {
    if (!client) return
    const state = useAppStore.getState()
    const id = state.currentId
    if (!id) return
    setBusy(true)
    try {
      const xml = await client.getXml()
      const thumbnail = await captureThumbnail(client)
      await state.saveXml(id, xml, { thumbnail })
      state.setStatusMessage('已保存')
    } catch (e) {
      state.setStatusMessage(`保存失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleExport(format: ExportFormat, ext: string) {
    if (!client) return
    const state = useAppStore.getState()
    const record = state.getCurrent()
    const baseName = record?.name?.trim() || 'diagram'
    setExportOpen(false)
    setBusy(true)
    try {
      if (format === 'xml') {
        const res = await client.exportDiagram({ format: 'xml' })
        downloadText(res.xml ?? '', `${baseName}.drawio`)
      } else {
        const res = await client.exportDiagram({
          format,
          scale: 2,
          border: 12,
        })
        const filename = format === 'svg' ? `${baseName}.svg` : `${baseName}${ext}`
        downloadDataUri(res.data, filename)
      }
      state.setStatusMessage('导出完成')
    } catch (e) {
      state.setStatusMessage(`导出失败: ${(e as Error).message}`)
    } finally {
      setBusy(false)
    }
  }

  async function handleFit() {
    if (!client) return
    try {
      // 基于最新内容计算包围盒，用 viewbox 双向适配（原生 fit 仅宽度适配）
      const xml = await client.getXml()
      const bounds = computeXmlBounds(xml)
      if (bounds) await client.viewbox(bounds, 24)
      else await client.fit()
    } catch (e) {
      useAppStore.getState().setStatusMessage(`适应画布失败: ${(e as Error).message}`)
    }
  }

  /** 切换浏览器全屏（应用面板全部隐藏，画布铺满页面）；退出同时支持 Esc（浏览器原生行为） */
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await document.documentElement.requestFullscreen()
        useAppStore.getState().setStatusMessage('已进入全屏，按 Esc 退出')
      }
    } catch (e) {
      useAppStore.getState().setStatusMessage(`全屏切换失败: ${(e as Error).message}`)
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const name = file.name.replace(/\.[^.]+$/, '')
    const lower = file.name.toLowerCase()
    const state = useAppStore.getState()
    try {
      let xml: string
      if (lower.endsWith('.png')) {
        // PNG（内嵌 XML 的 drawio 导出文件）：转 data URI 交给编辑器解析
        const buf = await file.arrayBuffer()
        xml = `data:image/png;base64,${bytesToBase64(buf)}`
      } else {
        xml = await file.text()
      }
      // createDiagram 已切换到新画布，画布组件会随 currentId 变化自动加载
      await state.createDiagram({ name, xml })
      state.setStatusMessage(`已导入 ${file.name}`)
    } catch (err) {
      state.setStatusMessage(`导入失败: ${(err as Error).message}`)
    }
  }

  return (
    <div className="flex h-11 shrink-0 items-center gap-1 border-b border-slate-200 bg-white px-2">
      <button className={btnCls} title="新建画布" onClick={() => void useAppStore.getState().createDiagram()}>
        <Plus size={16} /> 新建
      </button>
      <button className={btnCls} title="导入 .drawio / .xml / .svg / .png" onClick={() => fileInputRef.current?.click()}>
        <Upload size={16} /> 导入
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".drawio,.xml,.svg,.png"
        className="hidden"
        onChange={(e) => void handleImportFile(e)}
      />

      <div className="mx-1 h-5 w-px bg-slate-200" />

      <button className={btnCls} title="撤销" disabled={!client} onClick={() => client?.invokeAction('undo')}>
        <Undo2 size={16} />
      </button>
      <button className={btnCls} title="重做" disabled={!client} onClick={() => client?.invokeAction('redo')}>
        <Redo2 size={16} />
      </button>

      <div className="mx-1 h-5 w-px bg-slate-200" />

      <button className={btnCls} title="放大" disabled={!client} onClick={() => client?.invokeAction('zoomIn')}>
        <ZoomIn size={16} />
      </button>
      <button className={btnCls} title="缩小" disabled={!client} onClick={() => client?.invokeAction('zoomOut')}>
        <ZoomOut size={16} />
      </button>
      <button className={btnCls} title="适应画布" disabled={!client} onClick={() => void handleFit()}>
        <Target size={16} />
      </button>
      <button
        className={btnCls}
        title={isFullscreen ? '退出全屏（Esc）' : '全屏（画布铺满页面）'}
        onClick={() => void toggleFullscreen()}
      >
        {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
      </button>

      <div className="flex-1" />

      <button className={btnCls} title="保存（含缩略图）" disabled={!client || busy} onClick={() => void handleSave()}>
        <Save size={16} /> 保存
      </button>

      <div className="relative" ref={exportMenuRef}>
        <button
          className="inline-flex h-8 items-center gap-1.5 rounded-md bg-blue-600 px-3 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          disabled={!client || busy}
          onClick={() => setExportOpen((v) => !v)}
        >
          <Download size={16} /> 导出
        </button>
        {exportOpen && (
          <div className="absolute right-0 top-9 z-50 w-52 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {EXPORT_ITEMS.map((item) => (
              <button
                key={item.format}
                className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-100"
                onClick={() => void handleExport(item.format, item.ext)}
              >
                {item.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
