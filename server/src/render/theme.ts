/** 配色主题（单一事实来源，前后端共享结构） */
import type { NodeType } from './schema.js'

export interface NodeStyle {
  fill: string
  stroke: string
  text: string
}

export interface ThemePalette {
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

/** 深海蓝：蓝主调的经典架构图配色 */
const ocean: ThemePalette = {
  id: 'ocean',
  name: '深海蓝',
  background: '#ffffff',
  group: { fill: '#f0f7ff', stroke: '#b6d4fe', title: '#1e40af' },
  edge: { color: '#6d8fb3', labelColor: '#44546b', labelBg: '#ffffff' },
  nodes: {
    client: { fill: '#e0f2fe', stroke: '#38bdf8', text: '#075985' },
    gateway: { fill: '#ede9fe', stroke: '#8b5cf6', text: '#4c1d95' },
    service: { fill: '#dbeafe', stroke: '#3b82f6', text: '#1e40af' },
    compute: { fill: '#cffafe', stroke: '#06b6d4', text: '#155e75' },
    storage: { fill: '#fef3c7', stroke: '#f59e0b', text: '#78350f' },
    database: { fill: '#dcfce7', stroke: '#22c55e', text: '#14532d' },
    cache: { fill: '#ffe4e6', stroke: '#f43f5e', text: '#881337' },
    queue: { fill: '#ffedd5', stroke: '#f97316', text: '#7c2d12' },
    observability: { fill: '#f3e8ff', stroke: '#a855f7', text: '#581c87' },
    external: { fill: '#f1f5f9', stroke: '#94a3b8', text: '#334155' },
  },
}

/** 石墨商务：低饱和灰调 + 少量强调色，稳重专业 */
const graphite: ThemePalette = {
  id: 'graphite',
  name: '石墨商务',
  background: '#ffffff',
  group: { fill: '#f8fafc', stroke: '#cbd5e1', title: '#334155' },
  edge: { color: '#94a3b8', labelColor: '#475569', labelBg: '#ffffff' },
  nodes: {
    client: { fill: '#f1f5f9', stroke: '#94a3b8', text: '#334155' },
    gateway: { fill: '#eef2ff', stroke: '#818cf8', text: '#3730a3' },
    service: { fill: '#ffffff', stroke: '#475569', text: '#0f172a' },
    compute: { fill: '#f8fafc', stroke: '#64748b', text: '#1e293b' },
    storage: { fill: '#fafaf9', stroke: '#a8a29e', text: '#44403c' },
    database: { fill: '#f5f5f4', stroke: '#78716c', text: '#292524' },
    cache: { fill: '#fefce8', stroke: '#eab308', text: '#713f12' },
    queue: { fill: '#fff7ed', stroke: '#fb923c', text: '#7c2d12' },
    observability: { fill: '#faf5ff', stroke: '#c084fc', text: '#6b21a8' },
    external: { fill: '#f1f5f9', stroke: '#cbd5e1', text: '#475569' },
  },
}

/** 森野绿：清新自然的绿色系 */
const forest: ThemePalette = {
  id: 'forest',
  name: '森野绿',
  background: '#ffffff',
  group: { fill: '#f0fdf4', stroke: '#bbf7d0', title: '#166534' },
  edge: { color: '#7c9a83', labelColor: '#365314', labelBg: '#ffffff' },
  nodes: {
    client: { fill: '#dcfce7', stroke: '#4ade80', text: '#14532d' },
    gateway: { fill: '#d1fae5', stroke: '#10b981', text: '#064e3b' },
    service: { fill: '#ecfccb', stroke: '#84cc16', text: '#365314' },
    compute: { fill: '#ccfbf1', stroke: '#14b8a6', text: '#134e4a' },
    storage: { fill: '#fef9c3', stroke: '#facc15', text: '#713f12' },
    database: { fill: '#bbf7d0', stroke: '#22c55e', text: '#052e16' },
    cache: { fill: '#fee2e2', stroke: '#f87171', text: '#7f1d1d' },
    queue: { fill: '#ffedd5', stroke: '#fb923c', text: '#7c2d12' },
    observability: { fill: '#e0e7ff', stroke: '#818cf8', text: '#3730a3' },
    external: { fill: '#f1f5f9', stroke: '#94a3b8', text: '#334155' },
  },
}

/** 星夜紫：科技感紫色系 */
const violet: ThemePalette = {
  id: 'violet',
  name: '星夜紫',
  background: '#ffffff',
  group: { fill: '#faf5ff', stroke: '#e9d5ff', title: '#6b21a8' },
  edge: { color: '#8b7ab8', labelColor: '#581c87', labelBg: '#ffffff' },
  nodes: {
    client: { fill: '#f3e8ff', stroke: '#c084fc', text: '#581c87' },
    gateway: { fill: '#e0e7ff', stroke: '#818cf8', text: '#3730a3' },
    service: { fill: '#ede9fe', stroke: '#a78bfa', text: '#4c1d95' },
    compute: { fill: '#dbeafe', stroke: '#60a5fa', text: '#1e3a8a' },
    storage: { fill: '#fef3c7', stroke: '#fbbf24', text: '#78350f' },
    database: { fill: '#dcfce7', stroke: '#4ade80', text: '#14532d' },
    cache: { fill: '#ffe4e6', stroke: '#fb7185', text: '#881337' },
    queue: { fill: '#ffedd5', stroke: '#fb923c', text: '#7c2d12' },
    observability: { fill: '#fae8ff', stroke: '#e879f9', text: '#701a75' },
    external: { fill: '#f1f5f9', stroke: '#94a3b8', text: '#334155' },
  },
}

/** 极简灰：单色线框风格，适合评审与打印 */
const minimal: ThemePalette = {
  id: 'minimal',
  name: '极简灰',
  background: '#ffffff',
  group: { fill: '#fafafa', stroke: '#e5e5e5', title: '#525252' },
  edge: { color: '#a3a3a3', labelColor: '#525252', labelBg: '#ffffff' },
  nodes: {
    client: { fill: '#fafafa', stroke: '#a3a3a3', text: '#262626' },
    gateway: { fill: '#f5f5f5', stroke: '#8a8a8a', text: '#171717' },
    service: { fill: '#ffffff', stroke: '#737373', text: '#171717' },
    compute: { fill: '#fafafa', stroke: '#a3a3a3', text: '#262626' },
    storage: { fill: '#f5f5f5', stroke: '#d4d4d4', text: '#404040' },
    database: { fill: '#ededed', stroke: '#a3a3a3', text: '#171717' },
    cache: { fill: '#f5f5f5', stroke: '#bdbdbd', text: '#404040' },
    queue: { fill: '#fafafa', stroke: '#bdbdbd', text: '#404040' },
    observability: { fill: '#f0f0f0', stroke: '#a3a3a3', text: '#262626' },
    external: { fill: '#fafafa', stroke: '#d4d4d4', text: '#525252' },
  },
}

export const themes: ThemePalette[] = [ocean, graphite, forest, violet, minimal]

export const DEFAULT_THEME_ID = ocean.id

export function getTheme(id?: string | null): ThemePalette {
  return themes.find((t) => t.id === id) ?? ocean
}
