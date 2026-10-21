/** 将结构化图数据 + 布局 + 主题渲染为 drawio（mxGraphModel）XML */
import type { GraphData, NodeType } from './schema.js'
import type { LayoutEdgePoint, LayoutResult } from './layout.js'
import type { ThemePalette } from './theme.js'

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/\n/g, '&#10;')
}

/** 分组容器：虚线圆角容器 + 顶部标题 */
function groupStyle(theme: ThemePalette): string {
  const g = theme.group
  return [
    'rounded=1',
    'whiteSpace=wrap',
    'html=1',
    'dashed=1',
    'dashPattern=6 4',
    `fillColor=${g.fill}`,
    `strokeColor=${g.stroke}`,
    `fontColor=${g.title}`,
    'fontSize=13',
    'fontStyle=1',
    'verticalAlign=top',
    'align=center',
    'spacingTop=8',
    'container=1',
    'collapsible=0',
    'recursiveResize=0',
    'strokeWidth=1',
    'shadow=0',
  ].join(';')
}

/** 节点样式：基础圆角矩形 + 按语义类型切换形状 */
function nodeStyle(type: NodeType, theme: ThemePalette): string {
  const s = theme.nodes[type]
  const paint = [
    `fillColor=${s.fill}`,
    `strokeColor=${s.stroke}`,
    `fontColor=${s.text}`,
    'fontSize=13',
    'strokeWidth=1.5',
    'shadow=0',
    'whiteSpace=wrap',
    'html=1',
  ]
  switch (type) {
    case 'gateway':
      return ['shape=hexagon', 'perimeter=hexagonPerimeter2', 'fixedSize=1', 'size=16', ...paint].join(';')
    case 'database':
      return ['shape=cylinder3', 'boundedLbl=1', 'backgroundOutline=1', 'size=12', ...paint].join(';')
    case 'storage':
      return ['shape=cylinder3', 'direction=east', 'boundedLbl=1', 'backgroundOutline=1', 'size=12', ...paint].join(';')
    case 'queue':
      return ['shape=process', 'size=0.08', ...paint].join(';')
    case 'external':
      return ['ellipse', 'shape=cloud', ...paint].join(';')
    default:
      return ['rounded=1', 'arcSize=12', ...paint].join(';')
  }
}

function edgeStyle(style: 'solid' | 'dashed' | null | undefined, theme: ThemePalette): string {
  const e = theme.edge
  const parts = [
    'edgeStyle=orthogonalEdgeStyle',
    // drawio 内置 libavoid 动态避障路由：节点被拖动/缩放时自动重算连线，
    // 避免 ELK 折点（waypoints）留在原地把线条“钉住”
    'libavoidRouting=1',
    'rounded=1',
    'orthogonalLoop=1',
    'jettySize=auto',
    'html=1',
    `strokeColor=${e.color}`,
    'strokeWidth=1.5',
    'endArrow=block',
    'endFill=1',
    'fontSize=11',
    `fontColor=${e.labelColor}`,
    `labelBackgroundColor=${e.labelBg}`,
    'shadow=0',
  ]
  if (style === 'dashed') {
    parts.push('dashed=1', 'dashPattern=6 4')
  }
  return parts.join(';')
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value))
}

/** 将路由锚点换算为 drawio 边框连接锚点（exitX/exitY 为相对节点宽高的比例） */
function pinStyle(
  prefix: 'exit' | 'entry',
  point: LayoutEdgePoint,
  rect?: { x: number; y: number; width: number; height: number },
): string {
  if (!rect || rect.width <= 0 || rect.height <= 0) return ''
  const fx = Math.round(clamp01((point.x - rect.x) / rect.width) * 1000) / 1000
  const fy = Math.round(clamp01((point.y - rect.y) / rect.height) * 1000) / 1000
  return `${prefix}X=${fx};${prefix}Y=${fy};${prefix}Dx=0;${prefix}Dy=0`
}

export function renderXml(data: GraphData, layout: LayoutResult, theme: ThemePalette): string {
  // 节点/分组 id 统一重映射，避免模型输出的非法字符
  const nodeIdMap = new Map<string, string>()
  data.nodes.forEach((n, i) => nodeIdMap.set(n.id, `n${i + 1}`))
  const groupIdMap = new Map<string, string>()
  layout.groups.forEach((g, i) => groupIdMap.set(g.id, `g${i + 1}`))

  // 节点绝对坐标（组内节点为相对组框的坐标）与 ELK 路由，用于写出连线锚点与折点
  const groupPos = new Map(layout.groups.map((g) => [g.id, g]))
  const absRect = new Map<string, { x: number; y: number; width: number; height: number }>()
  for (const ln of layout.nodes) {
    const g = ln.groupId ? groupPos.get(ln.groupId) : undefined
    absRect.set(ln.id, {
      x: ln.x + (g?.x ?? 0),
      y: ln.y + (g?.y ?? 0),
      width: ln.width,
      height: ln.height,
    })
  }
  const routeByEdgeId = new Map(layout.edges.map((r) => [r.id, r]))

  const cells: string[] = []

  for (const group of layout.groups) {
    cells.push(
      `<mxCell id="${groupIdMap.get(group.id)}" value="${esc(group.label)}" style="${groupStyle(theme)}" vertex="1" parent="1">` +
        `<mxGeometry x="${group.x}" y="${group.y}" width="${group.width}" height="${group.height}" as="geometry" />` +
        `</mxCell>`,
    )
  }

  const nodeById = new Map(data.nodes.map((n) => [n.id, n]))
  for (const ln of layout.nodes) {
    const node = nodeById.get(ln.id)
    if (!node) continue
    const parent = ln.groupId ? (groupIdMap.get(ln.groupId) ?? '1') : '1'
    cells.push(
      `<mxCell id="${nodeIdMap.get(node.id)}" value="${esc(node.label)}" style="${nodeStyle(node.type, theme)}" vertex="1" parent="${parent}">` +
        `<mxGeometry x="${ln.x}" y="${ln.y}" width="${ln.width}" height="${ln.height}" as="geometry" />` +
        `</mxCell>`,
    )
  }

  let edgeIndex = 0
  data.edges.forEach((edge, index) => {
    const from = nodeIdMap.get(edge.from)
    const to = nodeIdMap.get(edge.to)
    if (!from || !to) return
    edgeIndex += 1
    const route = routeByEdgeId.get(`edge-${index}`)
    const pins = route
      ? [
          pinStyle('exit', route.start, absRect.get(edge.from)),
          pinStyle('entry', route.end, absRect.get(edge.to)),
        ]
          .filter(Boolean)
          .join(';')
      : ''
    const style = pins ? `${edgeStyle(edge.style, theme)};${pins}` : edgeStyle(edge.style, theme)
    const value = edge.label ? ` value="${esc(edge.label)}"` : ''
    // 折点写为 waypoints：作为初始避障路径与旧版 drawio 的兜底；
    // 新版 drawio 会按 libavoidRouting 在拖动时动态重算并覆盖这些折点
    const geometry =
      route && route.bends.length > 0
        ? `<mxGeometry relative="1" as="geometry"><Array as="points">${route.bends
            .map((b) => `<mxPoint x="${b.x}" y="${b.y}" />`)
            .join('')}</Array></mxGeometry>`
        : `<mxGeometry relative="1" as="geometry" />`
    cells.push(
      `<mxCell id="e${edgeIndex}"${value} style="${style}" edge="1" parent="1" source="${from}" target="${to}">` +
        geometry +
        `</mxCell>`,
    )
  })

  const title = data.title?.trim() || '架构图'
  const pageWidth = Math.max(1169, layout.width)
  const pageHeight = Math.max(826, layout.height)

  return [
    '<mxfile host="drawai" agent="drawai" version="1.0" type="device">',
    `  <diagram id="drawai-page-1" name="${esc(title)}">`,
    `    <mxGraphModel dx="1200" dy="800" grid="1" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="${pageWidth}" pageHeight="${pageHeight}" math="0" shadow="0" background="${theme.background}">`,
    '      <root>',
    '        <mxCell id="0" />',
    '        <mxCell id="1" parent="0" />',
    ...cells.map((c) => `        ${c}`),
    '      </root>',
    '    </mxGraphModel>',
    '  </diagram>',
    '</mxfile>',
  ].join('\n')
}
