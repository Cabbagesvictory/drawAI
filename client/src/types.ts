/** 前端共享类型定义 */

/** 图纸记录（IndexedDB 存储结构） */
export interface DiagramRecord {
  id: string
  name: string
  /** drawio 图 XML */
  xml: string
  /** AI 生成时的结构化图数据（用于换肤/再生成） */
  graph?: unknown
  /** AI 生成时使用的主题 */
  themeId?: string
  /** AI 生成时的源技术文档 */
  sourceDoc?: string
  /** 缩略图 data URL */
  thumbnail?: string
  createdAt: number
  updatedAt: number
}

/** 主题中的节点语义类型 */
export type NodeType =
  | 'client'
  | 'gateway'
  | 'service'
  | 'compute'
  | 'storage'
  | 'database'
  | 'cache'
  | 'queue'
  | 'observability'
  | 'external'

/** 单类节点的配色 */
export interface NodeStyle {
  fill: string
  stroke: string
  text: string
}

/** 主题完整定义（与 server/src/render/theme.ts 结构一致） */
export interface ThemeInfo {
  id: string
  name: string
  background: string
  group: {
    fill: string
    stroke: string
    title: string
  }
  edge: {
    color: string
    labelColor: string
    labelBg: string
  }
  nodes: Record<NodeType, NodeStyle>
}

/** SSE 生成阶段 */
export type GenerateStage = 'analyzing' | 'generating' | 'layout' | 'render' | 'done'

export interface GenerateResultPayload {
  xml: string
  graph: unknown
  title: string
  themeId: string
}

export interface GenerateParams {
  document: string
  themeId: string
  direction: 'TB' | 'LR'
  mock?: boolean
}
