/**
 * ELK layered 自动布局（drawio 同款布局引擎，支持分组容器与跨组连线）
 *
 * 选择 ELK 而非 dagre 的原因：dagre 的 compound（cluster）支持存在已知缺陷，
 * 实测组间纵向错位可达数百像素（分组被垂直拉开、图呈阶梯状）；
 * ELK layered + INCLUDE_CHILDREN 对层级分组图的对齐与紧凑度表现稳定。
 *
 * 同时提取 ELK 的正交边路由（起止锚点 + 折点），由 xml.ts 写入 mxGeometry 的
 * exit/entry 锚点与 waypoints：作为初始避障路径（也是旧版 drawio 的兜底），
 * 新版 drawio 则按 libavoidRouting 在拖动节点时自动重算路由，避免折点留在原地。
 */
import ElkConstructor from 'elkjs/lib/elk.bundled.js'
import type { ELK, ElkNode } from 'elkjs/lib/elk-api.js'
import type { GraphData, NodeType } from './schema.js'

/** 布局输出节点：x/y 为相对父容器（或画布原点）的左上角坐标 */
export interface LayoutNode {
  id: string
  x: number
  y: number
  width: number
  height: number
  groupId: string | null
}

export interface LayoutGroup {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutEdgePoint {
  x: number
  y: number
}

/** 边路由：start/end 为源/目标节点边框上的锚点，bends 为中间折点（均为画布绝对坐标） */
export interface LayoutEdgeRoute {
  id: string
  sourceId: string
  targetId: string
  start: LayoutEdgePoint
  bends: LayoutEdgePoint[]
  end: LayoutEdgePoint
}

export interface LayoutResult {
  nodes: LayoutNode[]
  groups: LayoutGroup[]
  edges: LayoutEdgeRoute[]
  width: number
  height: number
}

/** 布局方向：FREE 不限定方向，由系统选择更贴合画布的一种 */
export type LayoutDirection = 'LR' | 'TB' | 'FREE'

const FONT_SIZE = 13
const NODE_HEIGHT = 46
const CYLINDER_HEIGHT = 58
/** 分组容器内边距（左右/底部）与标题栏高度 */
const GROUP_PAD_X = 26
const GROUP_PAD_BOTTOM = 22
const GROUP_TITLE_H = 40
/** 画布四周留白 */
const CANVAS_PAD = 56

const CLUSTER_PREFIX = 'cluster::'
/** 自由布局选向的基准视口（16:10，接近编辑器画布区域） */
const FREE_VIEWPORT = { width: 1600, height: 1000 }

const CJK_RE = /[\u2e80-\u9fff\uf900-\ufaff\uff00-\uffef]/

/** 依据文本估算节点宽度（中文字符按字号全宽，其余按 0.62 倍） */
function measureWidth(label: string): number {
  let w = 0
  for (const ch of label) {
    w += CJK_RE.test(ch) ? FONT_SIZE : FONT_SIZE * 0.62
  }
  return Math.min(300, Math.max(110, Math.round(w) + 44))
}

function nodeSize(label: string, type: NodeType): { width: number; height: number } {
  const width = measureWidth(label)
  const height =
    type === 'database' || type === 'queue' || type === 'storage' ? CYLINDER_HEIGHT : NODE_HEIGHT
  return { width, height }
}

function round(value: number | undefined): number {
  return Math.round(value ?? 0)
}

function roundPoint(p: LayoutEdgePoint): LayoutEdgePoint {
  return { x: round(p.x), y: round(p.y) }
}

/** 去除相邻重复点与共线冗余折点（保持路径形状不变） */
function simplifyPath(points: LayoutEdgePoint[]): LayoutEdgePoint[] {
  const EPS = 0.5
  const dedup: LayoutEdgePoint[] = []
  for (const p of points) {
    const last = dedup[dedup.length - 1]
    if (!last || Math.abs(p.x - last.x) > EPS || Math.abs(p.y - last.y) > EPS) dedup.push(p)
  }
  if (dedup.length <= 2) return dedup
  const out: LayoutEdgePoint[] = [dedup[0]]
  for (let i = 1; i < dedup.length - 1; i += 1) {
    const a = out[out.length - 1]
    const b = dedup[i]
    const c = dedup[i + 1]
    const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)
    const dot = (b.x - a.x) * (c.x - a.x) + (b.y - a.y) * (c.y - a.y)
    // 共线且同向的中间点可省略；回头点保留
    if (Math.abs(cross) < EPS && dot > 0) continue
    out.push(b)
  }
  out.push(dedup[dedup.length - 1])
  return out
}

// elk.bundled.js 为 UMD 模块（module.exports 即构造器），TS 对 CJS default
// import 的类型推断与运行时形状不一致，按运行时真实形状断言
const elk = new (ElkConstructor as unknown as new () => ELK)()

export async function layoutGraph(data: GraphData, direction: 'TB' | 'LR'): Promise<LayoutResult> {
  // 注：ELK layered 必须指定方向，所谓「自由布局」是在横向/纵向中自动选优，见 layoutGraphAuto
  const nodeById = new Map(data.nodes.map((n) => [n.id, n]))

  // 节点只归属第一个声明且有效的组
  const groupOf = new Map<string, string>()
  for (const group of data.groups) {
    for (const nodeId of group.nodes) {
      if (nodeById.has(nodeId) && !groupOf.has(nodeId)) groupOf.set(nodeId, group.id)
    }
  }

  const toElkNode = (id: string): ElkNode => {
    const node = nodeById.get(id)
    const size = node ? nodeSize(node.label, node.type) : { width: 120, height: NODE_HEIGHT }
    return { id, width: size.width, height: size.height }
  }

  // 分组作为层级节点（padding.top 为容器标题预留空间）
  const children: ElkNode[] = []
  for (const group of data.groups) {
    const members = group.nodes.filter((id) => groupOf.get(id) === group.id)
    if (members.length === 0) continue
    children.push({
      id: `${CLUSTER_PREFIX}${group.id}`,
      layoutOptions: {
        'elk.padding': `[top=${GROUP_TITLE_H},left=${GROUP_PAD_X},bottom=${GROUP_PAD_BOTTOM},right=${GROUP_PAD_X}]`,
      },
      children: members.map(toElkNode),
    })
  }
  // 未分组节点作为根层级节点
  for (const node of data.nodes) {
    if (!groupOf.has(node.id)) children.push(toElkNode(node.id))
  }

  // 保留原始下标作为 id（xml.ts 据此把路由对回边）
  const edges = data.edges
    .map((edge, index) => ({ edge, index }))
    .filter(({ edge }) => nodeById.has(edge.from) && nodeById.has(edge.to))
    .map(({ edge, index }) => ({ id: `edge-${index}`, sources: [edge.from], targets: [edge.to] }))

  const graph: ElkNode = {
    id: 'root',
    layoutOptions: {
      'elk.algorithm': 'layered',
      'elk.direction': direction === 'LR' ? 'RIGHT' : 'DOWN',
      'elk.hierarchyHandling': 'INCLUDE_CHILDREN',
      'elk.edgeRouting': 'ORTHOGONAL',
      'elk.spacing.nodeNode': '42',
      'elk.spacing.edgeNode': '24',
      'elk.spacing.edgeEdge': '12',
      'elk.layered.spacing.nodeNodeBetweenLayers': '76',
      'elk.layered.spacing.edgeNodeBetweenLayers': '26',
      'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      'elk.padding': `[top=${CANVAS_PAD},left=${CANVAS_PAD},bottom=${CANVAS_PAD},right=${CANVAS_PAD}]`,
    },
    children,
    edges,
  }

  const result = await elk.layout(graph)

  const groups: LayoutGroup[] = []
  const nodes: LayoutNode[] = []
  const groupById = new Map(data.groups.map((g) => [g.id, g]))
  // 组内边的 section 坐标以组容器为原点（edge.container 指向 LCA），记录组框位置用于平移
  const containerOffset = new Map<string, { x: number; y: number }>()

  for (const child of result.children ?? []) {
    if (child.id.startsWith(CLUSTER_PREFIX)) {
      const groupId = child.id.slice(CLUSTER_PREFIX.length)
      const group = groupById.get(groupId)
      if (!group) continue
      groups.push({
        id: groupId,
        label: group.label,
        x: round(child.x),
        y: round(child.y),
        width: round(child.width),
        height: round(child.height),
      })
      containerOffset.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 })
      // 组内节点坐标相对组框左上角（含 padding 偏移），可直接用于 mxGeometry
      for (const member of child.children ?? []) {
        nodes.push({
          id: member.id,
          x: round(member.x),
          y: round(member.y),
          width: round(member.width),
          height: round(member.height),
          groupId,
        })
      }
    } else {
      nodes.push({
        id: child.id,
        x: round(child.x),
        y: round(child.y),
        width: round(child.width),
        height: round(child.height),
        groupId: null,
      })
    }
  }

  // ---- 边路由提取（sections 可能因跨组被拆成多段，按序拼接） ----
  const routes: LayoutEdgeRoute[] = []
  for (const elkEdge of result.edges ?? []) {
    const sourceId = elkEdge.sources?.[0]
    const targetId = elkEdge.targets?.[0]
    if (!sourceId || !targetId) continue
    // 坐标平移：组内边以组容器为原点，跨组边（container=root）已是绝对坐标
    const offset = elkEdge.container ? containerOffset.get(elkEdge.container) : undefined
    const ox = offset?.x ?? 0
    const oy = offset?.y ?? 0
    const raw: LayoutEdgePoint[] = []
    for (const section of elkEdge.sections ?? []) {
      raw.push(section.startPoint, ...(section.bendPoints ?? []), section.endPoint)
    }
    const points = simplifyPath(raw)
    if (points.length < 2) continue
    const shift = (p: LayoutEdgePoint): LayoutEdgePoint => ({ x: p.x + ox, y: p.y + oy })
    routes.push({
      id: elkEdge.id,
      sourceId,
      targetId,
      start: roundPoint(shift(points[0])),
      bends: points.slice(1, -1).map((p) => roundPoint(shift(p))),
      end: roundPoint(shift(points[points.length - 1])),
    })
  }

  return {
    nodes,
    groups,
    edges: routes,
    width: round(result.width),
    height: round(result.height),
  }
}

/** 评分：按基准视口等比缩放，值越小说明越贴合画布；折点略多则稍作惩罚 */
function layoutScore(result: LayoutResult): number {
  const scale = Math.max(result.width / FREE_VIEWPORT.width, result.height / FREE_VIEWPORT.height)
  const bends = result.edges.reduce((sum, edge) => sum + edge.bends.length, 0)
  return scale * (1 + bends * 0.002)
}

/**
 * 自由布局：不限定方向，分别按横向与纵向布局，选更贴合画布的一种。
 * 两种结果都保留 ELK 的正交路由与分组容器，画面质量与手动选向一致。
 */
export async function layoutGraphAuto(data: GraphData): Promise<LayoutResult> {
  const lr = await layoutGraph(data, 'LR')
  const tb = await layoutGraph(data, 'TB')
  return layoutScore(lr) <= layoutScore(tb) ? lr : tb
}
