/** 结构化图数据的 zod 校验与清洗 */
import { z } from 'zod'

/** 节点语义类型（与主题色板一一对应） */
export const NODE_TYPES = [
  'client',
  'gateway',
  'service',
  'compute',
  'storage',
  'database',
  'cache',
  'queue',
  'observability',
  'external',
] as const

export const nodeTypeSchema = z.enum(NODE_TYPES)

export const graphNodeSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(160),
  type: nodeTypeSchema,
})

export const graphEdgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  label: z.string().max(160).nullish(),
  style: z.enum(['solid', 'dashed']).nullish(),
})

export const graphGroupSchema = z.object({
  id: z.string().min(1).max(64),
  label: z.string().min(1).max(160),
  nodes: z.array(z.string()).min(1),
})

export const graphDataSchema = z.object({
  title: z.string().max(160).nullish(),
  nodes: z.array(graphNodeSchema).min(1).max(40),
  edges: z.array(graphEdgeSchema).max(90).default([]),
  groups: z.array(graphGroupSchema).max(12).default([]),
})

export type GraphData = z.infer<typeof graphDataSchema>
export type GraphNode = z.infer<typeof graphNodeSchema>
export type GraphEdge = z.infer<typeof graphEdgeSchema>
export type GraphGroup = z.infer<typeof graphGroupSchema>
export type NodeType = (typeof NODE_TYPES)[number]

/**
 * 清洗模型输出：
 * - 去重节点 id
 * - 丢弃引用不存在节点 / 自环的边
 * - 组内引用过滤，节点只归属第一个声明的组
 */
export function sanitizeGraphData(data: GraphData): GraphData {
  const seen = new Set<string>()
  const nodes = data.nodes.filter((n) => {
    if (seen.has(n.id)) return false
    seen.add(n.id)
    return true
  })
  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = data.edges.filter(
    (e) => nodeIds.has(e.from) && nodeIds.has(e.to) && e.from !== e.to,
  )

  const assigned = new Set<string>()
  const groups = data.groups
    .map((g) => {
      const unique = g.nodes.filter((id) => nodeIds.has(id) && !assigned.has(id))
      unique.forEach((id) => assigned.add(id))
      return { ...g, nodes: unique }
    })
    .filter((g) => g.nodes.length > 0)

  return {
    title: data.title ?? null,
    nodes,
    edges,
    groups,
  }
}
