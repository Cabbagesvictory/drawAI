import { describe, expect, it } from 'vitest'
import { renderXml } from './xml.js'
import { graphDataSchema, sanitizeGraphData, type GraphData } from './schema.js'
import { layoutGraph, type LayoutResult } from './layout.js'
import { getTheme } from './theme.js'
import { MOCK_GRAPH } from '../prompt/index.js'

const theme = getTheme('ocean')

const data: GraphData = {
  title: '测试图',
  nodes: [
    { id: 'user-web', label: '用户 Web', type: 'client' },
    { id: 'order-svc', label: '订单服务', type: 'service' },
    { id: 'order-db', label: '订单库', type: 'database' },
  ],
  edges: [
    { from: 'user-web', to: 'order-svc', label: 'HTTPS' },
    { from: 'order-svc', to: 'order-db', style: 'dashed' },
  ],
  groups: [{ id: 'core', label: '核心服务', nodes: ['order-svc', 'order-db'] }],
}

const layout: LayoutResult = {
  nodes: [
    { id: 'user-web', x: 56, y: 120, width: 110, height: 46, groupId: null },
    { id: 'order-svc', x: 26, y: 40, width: 110, height: 46, groupId: 'core' },
    { id: 'order-db', x: 26, y: 128, width: 110, height: 58, groupId: 'core' },
  ],
  groups: [{ id: 'core', label: '核心服务', x: 220, y: 56, width: 162, height: 208 }],
  edges: [],
  width: 440,
  height: 320,
}

describe('renderXml', () => {
  const xml = renderXml(data, layout, theme)

  it('生成 mxfile / diagram / mxGraphModel 骨架与主题背景色', () => {
    expect(xml.startsWith('<mxfile')).toBe(true)
    expect(xml).toContain('<diagram id="drawai-page-1" name="测试图">')
    expect(xml).toContain(`background="${theme.background}"`)
    // 根节点
    expect(xml).toContain('<mxCell id="0" />')
    expect(xml).toContain('<mxCell id="1" parent="0" />')
  })

  it('页面尺寸不小于 A4 基准（1169x826）', () => {
    expect(xml).toContain('pageWidth="1169"')
    expect(xml).toContain('pageHeight="826"')
  })

  it('id 重映射：节点 n1.. / 分组 g1..，分组节点 parent 指向组 id', () => {
    // 分组容器
    expect(xml).toContain('id="g1" value="核心服务"')
    expect(xml).toContain('container=1')
    // 组内节点 parent=g1，未分组节点 parent=1
    expect(xml).toMatch(/id="n2" value="订单服务"[^>]*parent="g1"/)
    expect(xml).toMatch(/id="n3" value="订单库"[^>]*parent="g1"/)
    expect(xml).toMatch(/id="n1" value="用户 Web"[^>]*parent="1"/)
    // 模型输出的原始 id 不出现在 XML 中
    expect(xml).not.toContain('user-web')
    expect(xml).not.toContain('order-svc')
  })

  it('节点坐标与尺寸来自布局结果', () => {
    expect(xml).toContain('<mxGeometry x="56" y="120" width="110" height="46" as="geometry" />')
    expect(xml).toContain('<mxGeometry x="26" y="128" width="110" height="58" as="geometry" />')
  })

  it('边重映射 source/target，虚线样式带 dashed=1', () => {
    expect(xml).toMatch(/id="e1" value="HTTPS"[^>]*source="n1" target="n2"/)
    expect(xml).toMatch(/id="e2"[^>]*source="n2" target="n3"/)
    const solidLine = xml.split('\n').find((l) => l.includes('id="e1"'))
    const dashedLine = xml.split('\n').find((l) => l.includes('id="e2"'))
    expect(solidLine).not.toContain('dashed=1')
    expect(dashedLine).toContain('dashed=1')
  })

  it('标签特殊字符被转义', () => {
    const tricky: GraphData = {
      title: 'A&B',
      nodes: [{ id: 'n', label: 'a < b & "c" \'d\'', type: 'service' }],
      edges: [],
      groups: [],
    }
    const out = renderXml(
      tricky,
      {
        nodes: [{ id: 'n', x: 0, y: 0, width: 100, height: 40, groupId: null }],
        groups: [],
        edges: [],
        width: 100,
        height: 40,
      },
      theme,
    )
    expect(out).toContain('name="A&amp;B"')
    expect(out).toContain('value="a &lt; b &amp; &quot;c&quot; &#39;d&#39;"')
    expect(out).not.toContain('a < b & "c"')
  })

  it('与 MOCK_GRAPH 全管线组合：cell 数量与数据一致', async () => {
    const clean = sanitizeGraphData(graphDataSchema.parse(MOCK_GRAPH))
    const fullLayout = await layoutGraph(clean, 'LR')
    const full = renderXml(clean, fullLayout, theme)
    const vertexCount = (full.match(/ vertex="1"/g) ?? []).length
    const edgeCount = (full.match(/ edge="1"/g) ?? []).length
    expect(vertexCount).toBe(clean.nodes.length + clean.groups.length)
    expect(edgeCount).toBe(clean.edges.length)
  })

  it('带路由的边：写入 exit/entry 边框锚点与折点 waypoints', () => {
    const routedLayout: LayoutResult = {
      ...layout,
      edges: [
        {
          id: 'edge-0',
          sourceId: 'user-web',
          targetId: 'order-svc',
          start: { x: 166, y: 143 },
          bends: [
            { x: 206, y: 143 },
            { x: 206, y: 119 },
          ],
          end: { x: 246, y: 119 },
        },
      ],
    }
    const out = renderXml(data, routedLayout, theme)
    // user-web 绝对矩形 (56,120,110x46)：start(166,143) → 右边中点 (1, 0.5)
    // order-svc 绝对矩形 (246,96,110x46)：end(246,119) → 左边中点 (0, 0.5)
    expect(out).toContain('exitX=1;exitY=0.5;exitDx=0;exitDy=0')
    expect(out).toContain('entryX=0;entryY=0.5;entryDx=0;entryDy=0')
    expect(out).toContain(
      '<Array as="points"><mxPoint x="206" y="143" /><mxPoint x="206" y="119" /></Array>',
    )
    // 未提供路由的边保持回退样式（无锚点）
    const e2 = out.split('\n').find((l) => l.includes('id="e2"'))
    expect(e2).not.toContain('exitX')
  })

  it('快照', () => {
    expect(xml).toMatchSnapshot()
  })
})
