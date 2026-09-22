/** 从 drawio XML 计算图形在模型坐标系中的包围盒（供 viewbox 双向适配使用） */
import type { DrawioBounds } from './drawio-protocol'

interface CellGeom {
  parent: string
  geom: { x: number; y: number; w: number; h: number } | null
}

/**
 * 解析 mxfile XML，沿父子链累加坐标得到全图包围盒。
 *
 * 用途：drawio embed 的 fit（load 的 fit 参数与 fit action）`ignoreHeight=true`
 * 仅按宽度适配，纵向长图会溢出视口被裁切；viewbox 走 fitWindow 双向适配，
 * 因此需要宿主侧先算出图的模型边界。
 */
export function computeXmlBounds(xml: string): DrawioBounds | null {
  if (!xml || xml.startsWith('data:')) return null

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xml, 'text/xml')
  } catch {
    return null
  }
  if (doc.getElementsByTagName('parsererror').length > 0) return null

  const root = doc.querySelector('mxGraphModel > root') ?? doc.querySelector('root')
  if (!root) return null

  const cells = new Map<string, CellGeom>()
  for (const cell of Array.from(root.getElementsByTagName('mxCell'))) {
    const id = cell.getAttribute('id')
    if (!id) continue
    const g = cell.querySelector('mxGeometry')
    const rawW = g?.getAttribute('width')
    const rawH = g?.getAttribute('height')
    let geom: CellGeom['geom'] = null
    if (g && rawW != null && rawH != null) {
      let w = parseFloat(rawW) || 0
      let h = parseFloat(rawH) || 0
      // 旋转 90°/270° 的图形包围盒宽高互换
      const rotation = Math.abs(parseFloat(g.getAttribute('rotation') ?? '0') || 0)
      if (Math.round(rotation / 90) % 2 === 1) [w, h] = [h, w]
      geom = {
        x: parseFloat(g.getAttribute('x') ?? '0') || 0,
        y: parseFloat(g.getAttribute('y') ?? '0') || 0,
        w,
        h,
      }
    }
    cells.set(id, { parent: cell.getAttribute('parent') ?? '1', geom })
  }

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const cell of cells.values()) {
    if (!cell.geom || cell.geom.w <= 0 || cell.geom.h <= 0) continue
    let x = cell.geom.x
    let y = cell.geom.y
    let parentId = cell.parent
    for (let depth = 0; parentId && parentId !== '0' && depth < 64; depth += 1) {
      const parent = cells.get(parentId)
      if (!parent) break
      if (parent.geom) {
        x += parent.geom.x
        y += parent.geom.y
      }
      parentId = parent.parent
    }
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x + cell.geom.w)
    maxY = Math.max(maxY, y + cell.geom.h)
  }

  if (!Number.isFinite(minX) || maxX <= minX || maxY <= minY) return null
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}
