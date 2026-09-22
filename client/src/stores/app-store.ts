/** 应用全局状态（zustand） */
import { create } from 'zustand'
import type { DiagramRecord } from '../types'
import * as storage from '../lib/storage'

export interface CreateDiagramInit {
  name?: string
  xml?: string
  graph?: unknown
  themeId?: string
  sourceDoc?: string
}

interface AppState {
  /** 图纸列表（按 updatedAt 倒序） */
  diagrams: DiagramRecord[]
  /** 当前打开图纸 id */
  currentId: string | null
  /** drawio 编辑器是否完成握手 */
  canvasReady: boolean
  /** 全局状态栏提示 */
  statusMessage: string | null
  /** 是否正在 AI 生成 */
  generating: boolean
  /** 请求把指定 XML 加载进画布（AI 生成/导入后使用），nonce 保证重复调用也生效 */
  pendingLoad: { xml: string; nonce: number } | null
  /** 应用是否处于浏览器全屏（隐藏全部面板，画布铺满页面） */
  isFullscreen: boolean

  init: () => Promise<void>
  createDiagram: (init?: CreateDiagramInit) => Promise<string>
  /** 请求将 XML 加载进当前画布 */
  requestLoad: (xml: string) => void
  selectDiagram: (id: string) => void
  renameDiagram: (id: string, name: string) => Promise<void>
  removeDiagram: (id: string) => Promise<void>
  /** autosave 写入 xml（含可选缩略图） */
  saveXml: (id: string, xml: string, options?: { thumbnail?: string }) => Promise<void>
  /** AI 生成结果整体保存（xml + 结构化数据 + 主题 + 源文档） */
  saveGeneration: (
    id: string,
    data: { xml: string; graph: unknown; themeId: string; sourceDoc: string; title?: string },
  ) => Promise<void>
  setCanvasReady: (ready: boolean) => void
  setStatusMessage: (message: string | null) => void
  setGenerating: (generating: boolean) => void
  setFullscreen: (fullscreen: boolean) => void
  /** 当前图纸记录 */
  getCurrent: () => DiagramRecord | undefined
}

export const useAppStore = create<AppState>((set, get) => ({
  diagrams: [],
  currentId: null,
  canvasReady: false,
  statusMessage: null,
  generating: false,
  pendingLoad: null,
  isFullscreen: false,

  init: async () => {
    let records = await storage.listDiagrams()
    if (records.length === 0) {
      const first = storage.createDiagramRecord('示例画布')
      await storage.putDiagram(first)
      records = [first]
    }
    const lastId = storage.getLastDiagramId()
    const currentId = lastId && records.some((r) => r.id === lastId) ? lastId : records[0].id
    storage.setLastDiagramId(currentId)
    set({ diagrams: records, currentId })
  },

  createDiagram: async (init) => {
    const record = storage.createDiagramRecord(init?.name ?? `画布 ${get().diagrams.length + 1}`)
    if (init) {
      if (init.xml != null) record.xml = init.xml
      if (init.graph != null) record.graph = init.graph
      if (init.themeId != null) record.themeId = init.themeId
      if (init.sourceDoc != null) record.sourceDoc = init.sourceDoc
    }
    await storage.putDiagram(record)
    storage.setLastDiagramId(record.id)
    set((s) => ({ diagrams: [record, ...s.diagrams], currentId: record.id }))
    return record.id
  },

  requestLoad: (xml) => {
    set({ pendingLoad: { xml, nonce: Date.now() } })
  },

  selectDiagram: (id) => {
    storage.setLastDiagramId(id)
    set({ currentId: id })
  },

  renameDiagram: async (id, name) => {
    const record = get().diagrams.find((d) => d.id === id)
    if (!record) return
    const updated = { ...record, name: name.trim() || record.name, updatedAt: Date.now() }
    await storage.putDiagram(updated)
    set((s) => ({
      diagrams: s.diagrams
        .map((d) => (d.id === id ? updated : d))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }))
  },

  removeDiagram: async (id) => {
    await storage.deleteDiagram(id)
    let { diagrams, currentId } = get()
    diagrams = diagrams.filter((d) => d.id !== id)
    if (diagrams.length === 0) {
      const record = storage.createDiagramRecord('画布 1')
      await storage.putDiagram(record)
      diagrams = [record]
    }
    if (currentId === id) {
      currentId = diagrams[0].id
      storage.setLastDiagramId(currentId)
    }
    set({ diagrams, currentId })
  },

  saveXml: async (id, xml, options) => {
    const record = get().diagrams.find((d) => d.id === id)
    if (!record || record.xml === xml) return
    const updated: DiagramRecord = {
      ...record,
      xml,
      thumbnail: options?.thumbnail ?? record.thumbnail,
      updatedAt: Date.now(),
    }
    await storage.putDiagram(updated)
    set((s) => ({
      diagrams: s.diagrams
        .map((d) => (d.id === id ? updated : d))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }))
  },

  saveGeneration: async (id, data) => {
    const record = get().diagrams.find((d) => d.id === id)
    if (!record) return
    const updated: DiagramRecord = {
      ...record,
      xml: data.xml,
      graph: data.graph,
      themeId: data.themeId,
      sourceDoc: data.sourceDoc,
      name: data.title?.trim() ? data.title.trim() : record.name,
      updatedAt: Date.now(),
    }
    await storage.putDiagram(updated)
    set((s) => ({
      diagrams: s.diagrams
        .map((d) => (d.id === id ? updated : d))
        .sort((a, b) => b.updatedAt - a.updatedAt),
    }))
  },

  setCanvasReady: (ready) => set({ canvasReady: ready }),
  setStatusMessage: (message) => set({ statusMessage: message }),
  setGenerating: (generating) => set({ generating }),
  setFullscreen: (fullscreen) => set({ isFullscreen: fullscreen }),

  getCurrent: () => {
    const { diagrams, currentId } = get()
    return diagrams.find((d) => d.id === currentId)
  },
}))
