/**
 * 让旧图也获得 drawio 的动态避障连线
 *
 * 早期版本把 ELK 计算出的折点（画布绝对坐标）写进 XML：拖动节点时折点不会跟着走，
 * 拖远后看起来像把线条“钉”在原地。drawio 的 libavoid 自动路由会在节点移动/缩放时
 * 重算整条连线，但只处理样式里带 libavoidRouting=1 的边。这里在加载时给 drawai
 * 生成的旧图补上该标记（保留原折点作为初始路径），无需用户重新生成。
 *
 * 手动拖动折点后 drawio 会自行清除该标记，不会覆盖用户的手工调整。
 */

const AUTO_ROUTING_KEY = 'libavoidRouting'

/** 为 drawai 生成的图中的正交连线补上 libavoidRouting=1；无改动时原样返回 */
export function enableAutoRouting(xml: string): string {
  if (!xml.includes('edge="1"')) return xml

  let doc: Document
  try {
    doc = new DOMParser().parseFromString(xml, 'text/xml')
  } catch {
    return xml
  }
  if (doc.getElementsByTagName('parsererror').length > 0) return xml
  // 只处理 drawai 自己生成的图，避免改动用户导入的外部图纸
  if (doc.documentElement.getAttribute('host') !== 'drawai') return xml

  let changed = 0
  for (const cell of Array.from(doc.getElementsByTagName('mxCell'))) {
    if (cell.getAttribute('edge') !== '1') continue
    const style = cell.getAttribute('style') ?? ''
    if (!style.includes('orthogonalEdgeStyle')) continue
    if (new RegExp(`(?:^|;)${AUTO_ROUTING_KEY}=`).test(style)) continue
    cell.setAttribute('style', `${style.replace(/;+$/, '')};${AUTO_ROUTING_KEY}=1;`)
    changed += 1
  }
  if (changed === 0) return xml

  return new XMLSerializer().serializeToString(doc)
}
