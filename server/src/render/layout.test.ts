import { describe, expect, it } from 'vitest'
import { layoutGraph, type LayoutResult } from './layout.js'
import { graphDataSchema, sanitizeGraphData, type GraphData } from './schema.js'
import { MOCK_GRAPH } from '../prompt/index.js'

/** 三层链路：接入层(web,gw) → 应用层(svc) → 数据层(db) */
const layered: GraphData = {
  title: '分层链路',
  nodes: [
    { id: 'web', label: '用户 Web', type: 'client' },
    { id: 'gw', label: 'API 网关', type: 'gateway' },
    { id: 'svc', label: '订单服务', type: 'service' },
    { id: 'db', label: '订单库', type: 'database' },
  ],
  edges: [
    { from: 'web', to: 'gw' },
    { from: 'gw', to: 'svc' },
    { from: 'svc', to: 'db' },
  ],
  groups: [
    { id: 'g-access', label: '接入层', nodes: ['web', 'gw'] },
    { id: 'g-app', label: '应用层', nodes: ['svc'] },
    { id: 'g-data', label: '数据层', nodes: ['db'] },
  ],
}

function byId(result: LayoutResult, id: string) {
  const node = result.nodes.find((n) => n.id === id)
  if (!node) throw new Error(`布局结果缺少节点 ${id}`)
  return node
}

function groupById(result: LayoutResult, id: string) {
  const group = result.groups.find((g) => g.id === id)
  if (!group) throw new Error(`布局结果缺少分组 ${id}`)
  return group
}

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** 节点绝对坐标（组内节点需叠加组框偏移） */
function absRects(result: LayoutResult): Map<string, Rect> {
  const groupPos = new Map(result.groups.map((g) => [g.id, g]))
  const map = new Map<string, Rect>()
  for (const n of result.nodes) {
    const g = n.groupId ? groupPos.get(n.groupId) : undefined
    map.set(n.id, {
      x: n.x + (g?.x ?? 0),
      y: n.y + (g?.y ?? 0),
      width: n.width,
      height: n.height,
    })
  }
  return map
}

/** 点是否落在节点矩形边框附近（允许 tolerance 内的舍入误差） */
function onNodeBorder(p: { x: number; y: number }, r: Rect, tolerance = 2): boolean {
  if (p.x < r.x - tolerance || p.x > r.x + r.width + tolerance) return false
  if (p.y < r.y - tolerance || p.y > r.y + r.height + tolerance) return false
  return (
    Math.abs(p.x - r.x) <= tolerance ||
    Math.abs(p.x - (r.x + r.width)) <= tolerance ||
    Math.abs(p.y - r.y) <= tolerance ||
    Math.abs(p.y - (r.y + r.height)) <= tolerance
  )
}

/** Liang-Barsky：线段是否穿过矩形内部（矩形按 tol 收缩，边界擦过不算） */
function segmentHitsRect(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  rect: Rect,
  tol: number,
): boolean {
  const x1 = rect.x + tol
  const y1 = rect.y + tol
  const x2 = rect.x + rect.width - tol
  const y2 = rect.y + rect.height - tol
  if (x2 <= x1 || y2 <= y1) return false
  const dx = p2.x - p1.x
  const dy = p2.y - p1.y
  let t0 = 0
  let t1 = 1
  const clip = (p: number, q: number): boolean => {
    if (Math.abs(p) < 1e-9) return q >= 0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  if (!clip(-dx, p1.x - x1) || !clip(dx, x2 - p1.x) || !clip(-dy, p1.y - y1) || !clip(dy, y2 - p1.y)) {
    return false
  }
  return t1 - t0 > 1e-6
}

describe('layoutGraph（ELK layered）', () => {
  it('LR：无分组链路的 x 沿流向严格递增', async () => {
    const chain: GraphData = {
      title: null,
      nodes: [
        { id: 'a', label: 'A', type: 'client' },
        { id: 'b', label: 'B', type: 'service' },
        { id: 'c', label: 'C', type: 'database' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
      groups: [],
    }
    const res = await layoutGraph(chain, 'LR')
    expect(byId(res, 'a').x).toBeLessThan(byId(res, 'b').x)
    expect(byId(res, 'b').x).toBeLessThan(byId(res, 'c').x)
    expect(res.nodes.every((n) => n.groupId === null)).toBe(true)
  })

  it('TB：无分组链路的 y 沿流向严格递增', async () => {
    const chain: GraphData = {
      title: null,
      nodes: [
        { id: 'a', label: 'A', type: 'client' },
        { id: 'b', label: 'B', type: 'service' },
        { id: 'c', label: 'C', type: 'database' },
      ],
      edges: [
        { from: 'a', to: 'b' },
        { from: 'b', to: 'c' },
      ],
      groups: [],
    }
    const res = await layoutGraph(chain, 'TB')
    expect(byId(res, 'a').y).toBeLessThan(byId(res, 'b').y)
    expect(byId(res, 'b').y).toBeLessThan(byId(res, 'c').y)
  })

  it('LR：分组沿流向水平排开且不重叠（回归：dagre 组间错位缺陷）', async () => {
    const res = await layoutGraph(layered, 'LR')
    const g1 = groupById(res, 'g-access')
    const g2 = groupById(res, 'g-app')
    const g3 = groupById(res, 'g-data')
    expect(g1.x).toBeLessThan(g2.x)
    expect(g2.x).toBeLessThan(g3.x)
    // 相邻分组在 x 轴上不重叠
    expect(g1.x + g1.width).toBeLessThanOrEqual(g2.x)
    expect(g2.x + g2.width).toBeLessThanOrEqual(g3.x)
  })

  it('TB：分组沿流向垂直排开且不重叠', async () => {
    const res = await layoutGraph(layered, 'TB')
    const g1 = groupById(res, 'g-access')
    const g2 = groupById(res, 'g-app')
    const g3 = groupById(res, 'g-data')
    expect(g1.y).toBeLessThan(g2.y)
    expect(g2.y).toBeLessThan(g3.y)
    expect(g1.y + g1.height).toBeLessThanOrEqual(g2.y)
    expect(g2.y + g2.height).toBeLessThanOrEqual(g3.y)
  })

  it('组内节点坐标相对组框：在标题栏以下且不越出容器', async () => {
    const res = await layoutGraph(layered, 'LR')
    for (const group of res.groups) {
      const members = res.nodes.filter((n) => n.groupId === group.id)
      expect(members.length).toBeGreaterThan(0)
      for (const m of members) {
        expect(m.x).toBeGreaterThanOrEqual(0)
        expect(m.y).toBeGreaterThanOrEqual(40) // 分组标题栏高度
        expect(m.x + m.width).toBeLessThanOrEqual(group.width)
        expect(m.y + m.height).toBeLessThanOrEqual(group.height)
      }
    }
  })

  it('所有节点恰好出现一次，groupId 与分组声明一致', async () => {
    const res = await layoutGraph(layered, 'LR')
    expect(res.nodes).toHaveLength(layered.nodes.length)
    const ids = res.nodes.map((n) => n.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(byId(res, 'web').groupId).toBe('g-access')
    expect(byId(res, 'gw').groupId).toBe('g-access')
    expect(byId(res, 'svc').groupId).toBe('g-app')
    expect(byId(res, 'db').groupId).toBe('g-data')
  })

  it('画布尺寸覆盖所有分组与节点', async () => {
    const res = await layoutGraph(layered, 'LR')
    for (const g of res.groups) {
      expect(g.x).toBeGreaterThanOrEqual(0)
      expect(g.y).toBeGreaterThanOrEqual(0)
      expect(g.x + g.width).toBeLessThanOrEqual(res.width)
      expect(g.y + g.height).toBeLessThanOrEqual(res.height)
    }
    expect(res.width).toBeGreaterThan(0)
    expect(res.height).toBeGreaterThan(0)
  })

  it('节点归属第一个声明的有效分组', async () => {
    const overlap: GraphData = {
      title: null,
      nodes: [
        { id: 'a', label: 'A', type: 'service' },
        { id: 'b', label: 'B', type: 'service' },
        { id: 'c', label: 'C', type: 'service' },
      ],
      edges: [{ from: 'a', to: 'c' }],
      groups: [
        { id: 'first', label: '第一组', nodes: ['a', 'b'] },
        { id: 'second', label: '第二组', nodes: ['b', 'c'] },
        { id: 'ghost', label: '无效组', nodes: ['missing'] },
      ],
    }
    const res = await layoutGraph(overlap, 'LR')
    expect(byId(res, 'a').groupId).toBe('first')
    expect(byId(res, 'b').groupId).toBe('first')
    expect(byId(res, 'c').groupId).toBe('second')
    // 无有效成员的分组不产生容器
    expect(res.groups.map((g) => g.id)).toEqual(['first', 'second'])
  })

  it('无分组无连线的单节点也可布局', async () => {
    const single: GraphData = {
      title: null,
      nodes: [{ id: 'only', label: '单节点', type: 'service' }],
      edges: [],
      groups: [],
    }
    const res = await layoutGraph(single, 'TB')
    expect(res.nodes).toHaveLength(1)
    expect(byId(res, 'only').width).toBeGreaterThan(0)
    expect(res.width).toBeGreaterThan(0)
  })

  it('坐标均为整数（直接用于 mxGeometry）', async () => {
    const res = await layoutGraph(layered, 'TB')
    for (const n of [...res.nodes, ...res.groups]) {
      expect(Number.isInteger(n.x)).toBe(true)
      expect(Number.isInteger(n.y)).toBe(true)
      expect(Number.isInteger(n.width)).toBe(true)
      expect(Number.isInteger(n.height)).toBe(true)
    }
  })
})

describe('边路由（ELK 正交路由，避免连线穿过图形块）', () => {
  it('为每条边输出路由，起止点位于源/目标节点边框上', async () => {
    const res = await layoutGraph(layered, 'LR')
    expect(res.edges).toHaveLength(layered.edges.length)
    const rects = absRects(res)
    for (const route of res.edges) {
      const s = rects.get(route.sourceId)
      const t = rects.get(route.targetId)
      if (!s || !t) throw new Error(`缺少节点矩形: ${route.sourceId}/${route.targetId}`)
      expect(onNodeBorder(route.start, s), `${route.id} 起点不在源节点边框`).toBe(true)
      expect(onNodeBorder(route.end, t), `${route.id} 终点不在目标节点边框`).toBe(true)
    }
  })

  it('线段为水平或垂直（正交折线）', async () => {
    const res = await layoutGraph(layered, 'LR')
    for (const route of res.edges) {
      const pts = [route.start, ...route.bends, route.end]
      for (let i = 0; i < pts.length - 1; i += 1) {
        const dx = Math.abs(pts[i].x - pts[i + 1].x)
        const dy = Math.abs(pts[i].y - pts[i + 1].y)
        expect(
          dx <= 1 || dy <= 1,
          `${route.id} 线段 (${pts[i].x},${pts[i].y})-(${pts[i + 1].x},${pts[i + 1].y}) 非正交`,
        ).toBe(true)
      }
    }
  })

  it.each([['LR'], ['TB']] as const)('%s：MOCK_GRAPH 全量边不穿过任何第三方节点', async (direction) => {
    const clean = sanitizeGraphData(graphDataSchema.parse(MOCK_GRAPH))
    const res = await layoutGraph(clean, direction)
    const rects = absRects(res)
    const tol = 1
    for (const route of res.edges) {
      const pts = [route.start, ...route.bends, route.end]
      for (let i = 0; i < pts.length - 1; i += 1) {
        for (const [id, rect] of rects) {
          if (id === route.sourceId || id === route.targetId) continue
          const hit = segmentHitsRect(pts[i], pts[i + 1], rect, tol)
          expect(
            hit,
            `${direction} 边 ${route.id} 线段 (${pts[i].x},${pts[i].y})-(${pts[i + 1].x},${pts[i + 1].y}) 穿过节点 ${id}`,
          ).toBe(false)
        }
      }
    }
  })

  it('复杂图（MOCK_GRAPH LR）也生成成对的正交路径', async () => {
    const clean = sanitizeGraphData(graphDataSchema.parse(MOCK_GRAPH))
    const res = await layoutGraph(clean, 'LR')
    expect(res.edges).toHaveLength(clean.edges.length)
    for (const route of res.edges) {
      expect(route.bends.length + 2).toBeGreaterThanOrEqual(2)
    }
  })
})
