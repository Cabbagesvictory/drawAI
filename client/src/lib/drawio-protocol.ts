/**
 * drawio embed 协议客户端（postMessage JSON 协议）
 *
 * 编辑器以 iframe 形式加载自托管 webapp：/drawio/index.html?embed=1&proto=json...
 * 协议参考: https://www.drawio.com/doc/faq/embed-mode
 */

export interface DrawioBounds {
  x: number
  y: number
  width: number
  height: number
}

export interface DrawioState {
  bounds?: DrawioBounds
  modelBounds?: DrawioBounds
  scale?: number
}

export type ExportFormat = 'xml' | 'svg' | 'xmlsvg' | 'png' | 'xmlpng' | 'json' | 'html2'

export interface ExportParams {
  format: ExportFormat
  scale?: number
  border?: number
  background?: string
  transparent?: boolean
  shadow?: boolean
  size?: 'page' | 'diagram'
  currentPage?: boolean
}

export interface DrawioExportResult extends DrawioState {
  format?: string
  data?: string
  xml?: string
  filename?: string
}

export interface LoadOptions {
  title?: string
  /** 加载后自动适应视口（仅宽度适配，默认 true）；viewbox 存在时忽略 */
  fit?: boolean
  /** 开启修改自动推送（autosave 事件），默认 true */
  autosave?: boolean
  /**
   * 模型坐标包围盒：加载后双向适配显示（居中）。
   * 优先于 fit——drawio 的 fit 仅按宽度适配（ignoreHeight），高图会溢出视口
   */
  viewbox?: DrawioBounds & { border?: number }
}

export interface DrawioEmbedHandlers {
  /** 编辑器内任何修改（load 时启用 autosave 后生效），回调最新 XML */
  onAutosave?: (xml: string) => void
  /** 用户在编辑器 UI 中触发的导出（exportProtocol），由宿主完成下载 */
  onUiExport?: (result: DrawioExportResult) => void
  /** 编辑器协议握手完成 */
  onReady?: () => void
}

interface PendingRequest {
  event: string
  resolve: (msg: Record<string, unknown>) => void
  reject: (err: Error) => void
}

/** 注入编辑器的配置：中文字体优先，保证图表中文渲染效果 */
const CONFIGURE_PAYLOAD = {
  defaultFonts: ['Helvetica', 'Microsoft YaHei', 'PingFang SC', 'Noto Sans SC'],
}

/** 未知消息的协议错误响应（形如 {error: 'unknownMessage'}），静默忽略 */
function isUnknownMessageError(msg: Record<string, unknown>): boolean {
  return msg.error === 'unknownMessage'
}

export class DrawioEmbedClient {
  private iframe: HTMLIFrameElement | null = null
  private handlers: DrawioEmbedHandlers
  private pending: PendingRequest[] = []
  private readyResolve!: () => void
  private readyReject!: (err: Error) => void
  private _ready: Promise<void>
  private destroyed = false

  constructor(handlers: DrawioEmbedHandlers = {}) {
    this.handlers = handlers
    this._ready = new Promise((resolve, reject) => {
      this.readyResolve = resolve
      this.readyReject = reject
    })
    // 避免未处理的 rejection 警告
    this._ready.catch(() => {})
  }

  get ready(): Promise<void> {
    return this._ready
  }

  get element(): HTMLIFrameElement | null {
    return this.iframe
  }

  /** 在容器中创建 iframe 并加载 drawio 编辑器 */
  mount(container: HTMLElement, src = '/drawio/index.html'): void {
    if (this.iframe || this.destroyed) return
    const params = new URLSearchParams({
      embed: '1',
      proto: 'json',
      spin: '1',
      configure: '1',
      libraries: '1',
      // 默认收起编辑器左右面板（形状库 / 格式面板），画布沉浸式全屏铺满；
      // 用户仍可经编辑器工具栏按钮或快捷键（Ctrl+Shift+K 形状 / Ctrl+Shift+P 格式）唤出
      sidebar: '0',
      format: '0',
      noSaveBtn: '1',
      noExitBtn: '1',
      saveAndExit: '0',
    })
    const iframe = document.createElement('iframe')
    iframe.src = `${src}?${params.toString()}`
    iframe.title = 'drawio editor'
    iframe.style.cssText = 'width:100%;height:100%;border:0;display:block;'
    container.appendChild(iframe)
    this.iframe = iframe
    window.addEventListener('message', this.handleMessage)
  }

  destroy(): void {
    this.destroyed = true
    window.removeEventListener('message', this.handleMessage)
    this.iframe?.remove()
    this.iframe = null
    this.pending = []
    this.readyReject(new Error('editor destroyed'))
  }

  private post(message: Record<string, unknown>): void {
    this.iframe?.contentWindow?.postMessage(JSON.stringify(message), '*')
  }

  private handleMessage = (ev: MessageEvent): void => {
    if (!this.iframe || ev.source !== this.iframe.contentWindow) return
    let msg: Record<string, unknown>
    try {
      msg = typeof ev.data === 'string' ? JSON.parse(ev.data) : ev.data
    } catch {
      return
    }
    if (!msg || typeof msg !== 'object') return
    if (isUnknownMessageError(msg)) {
      console.warn('[drawio] 编辑器无法识别的消息', msg)
      return
    }

    const event = msg.event as string | undefined

    // 握手：编辑器请求配置
    if (event === 'configure') {
      this.post({ action: 'configure', config: CONFIGURE_PAYLOAD })
      return
    }
    // 握手：编辑器就绪，等待 load
    if (event === 'init') {
      this.readyResolve()
      this.handlers.onReady?.()
      return
    }
    if (event === 'autosave') {
      if (typeof msg.xml === 'string') this.handlers.onAutosave?.(msg.xml)
      return
    }
    // export 事件：可能是等待中的 export 动作响应，也可能是编辑器 UI 触发的导出
    if (event === 'export') {
      const head = this.pending[0]
      if (head && head.event === 'export') {
        this.pending.shift()
        if (msg.error != null) head.reject(new Error(String(msg.error)))
        else head.resolve(msg)
      } else {
        this.handlers.onUiExport?.(msg as unknown as DrawioExportResult)
      }
      return
    }

    // 通用响应匹配（串行请求队列，协议没有请求 id，按事件类型顺序匹配）
    const head = this.pending[0]
    if (head && head.event === event) {
      this.pending.shift()
      if (msg.error != null) head.reject(new Error(String(msg.error)))
      else head.resolve(msg)
    }
  }

  private request<T extends Record<string, unknown>>(
    message: Record<string, unknown>,
    expectedEvent: string,
    timeoutMs = 15000,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      let settled = false
      const item: PendingRequest = {
        event: expectedEvent,
        resolve: (msg) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          resolve(msg as T)
        },
        reject: (err) => {
          if (settled) return
          settled = true
          clearTimeout(timer)
          reject(err)
        },
      }
      const timer = setTimeout(() => {
        const idx = this.pending.indexOf(item)
        if (idx >= 0) this.pending.splice(idx, 1)
        item.reject(new Error(`drawio 请求超时: ${expectedEvent}`))
      }, timeoutMs)
      this.pending.push(item)
      this.post(message)
    })
  }

  /** 加载图数据（XML / data URI / mermaid descriptor 等由调用方组装） */
  async load(xml: string, options: LoadOptions = {}): Promise<DrawioState> {
    await this.ready
    const message: Record<string, unknown> = {
      action: 'load',
      xml,
      autosave: options.autosave === false ? 0 : 1,
      title: options.title,
      exportProtocol: true,
    }
    if (options.viewbox) {
      // viewbox 双向适配（原生 fit 仅宽度适配，纵向长图会溢出被裁）
      message.viewbox = options.viewbox
    } else {
      message.fit = options.fit === false ? 0 : 1
    }
    return this.request<DrawioState & Record<string, unknown>>(message, 'load', 30000)
  }

  /** 合并 XML 到当前图（用于增量更新） */
  async merge(xml: string): Promise<void> {
    await this.ready
    const msg = await this.request<{ error?: string | null } & Record<string, unknown>>(
      { action: 'merge', xml },
      'merge',
      30000,
    )
    if (msg.error) throw new Error(String(msg.error))
  }

  /** 请求导出，返回 data URI / xml 内容 */
  async exportDiagram(params: ExportParams): Promise<DrawioExportResult> {
    await this.ready
    return this.request<DrawioExportResult & Record<string, unknown>>(
      { action: 'export', ...params },
      'export',
      60000,
    )
  }

  /** 快捷获取当前图 XML */
  async getXml(): Promise<string> {
    const res = await this.exportDiagram({ format: 'xml' })
    return res.xml ?? ''
  }

  /** 适应视口（drawio 原生 fit：仅宽度适配） */
  async fit(border = 16, maxScale = 1.25): Promise<void> {
    await this.ready
    await this.request({ action: 'fit', border, maxScale }, 'fit')
  }

  /** 将视图双向适配到指定模型坐标区域（居中显示，优于 fit） */
  async viewbox(bounds: DrawioBounds, border = 20): Promise<DrawioState> {
    await this.ready
    return this.request<DrawioState & Record<string, unknown>>(
      { action: 'viewbox', viewbox: { ...bounds, border } },
      'viewbox',
      15000,
    )
  }

  /** 调用编辑器内置动作（zoomIn/zoomOut/undo/redo 等），无响应 */
  invokeAction(actionName: string): void {
    this.post({ action: 'invokeAction', actionName })
  }

  /** 显示/隐藏编辑器内加载转圈 */
  showSpinner(message: string | null): void {
    this.post({ action: 'spinner', show: message != null, message: message ?? undefined })
  }
}
