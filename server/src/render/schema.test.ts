import { describe, expect, it } from 'vitest'
import { graphDataSchema, sanitizeGraphData } from './schema.js'

const validInput = {
  title: '订单服务',
  nodes: [
    { id: 'a', label: '网关', type: 'gateway' },
    { id: 'b', label: '订单服务', type: 'service' },
    { id: 'c', label: '订单库', type: 'database' },
  ],
  edges: [
    { from: 'a', to: 'b', label: '路由' },
    { from: 'b', to: 'c' },
  ],
  groups: [{ id: 'g1', label: '应用层', nodes: ['b', 'c'] }],
}

describe('graphDataSchema', () => {
  it('接受合法的图数据并解析', () => {
    const parsed = graphDataSchema.parse(validInput)
    expect(parsed.nodes).toHaveLength(3)
    expect(parsed.edges).toHaveLength(2)
    expect(parsed.groups).toHaveLength(1)
  })

  it('edges / groups 缺省时默认为空数组', () => {
    const parsed = graphDataSchema.parse({
      nodes: [{ id: 'a', label: 'A', type: 'service' }],
    })
    expect(parsed.edges).toEqual([])
    expect(parsed.groups).toEqual([])
  })

  it('拒绝未定义的节点类型', () => {
    const res = graphDataSchema.safeParse({
      nodes: [{ id: 'a', label: 'A', type: 'microservice' }],
    })
    expect(res.success).toBe(false)
  })

  it('拒绝空节点列表', () => {
    const res = graphDataSchema.safeParse({ nodes: [] })
    expect(res.success).toBe(false)
  })

  it('拒绝缺少 label 的节点', () => {
    const res = graphDataSchema.safeParse({ nodes: [{ id: 'a', type: 'service' }] })
    expect(res.success).toBe(false)
  })
})

describe('sanitizeGraphData', () => {
  it('节点 id 去重（保留首个声明）', () => {
    const data = graphDataSchema.parse({
      nodes: [
        { id: 'a', label: '第一个', type: 'service' },
        { id: 'a', label: '重复', type: 'database' },
        { id: 'b', label: 'B', type: 'service' },
      ],
    })
    const clean = sanitizeGraphData(data)
    expect(clean.nodes).toHaveLength(2)
    expect(clean.nodes[0]?.label).toBe('第一个')
  })

  it('丢弃引用缺失节点与自环的边', () => {
    const data = graphDataSchema.parse({
      nodes: [{ id: 'a', label: 'A', type: 'service' }],
      edges: [
        { from: 'a', to: 'a' },
        { from: 'a', to: 'missing' },
        { from: 'missing', to: 'a' },
      ],
    })
    const clean = sanitizeGraphData(data)
    expect(clean.edges).toHaveLength(0)
  })

  it('组内引用过滤：缺失节点剔除、节点只归属第一个组、空组删除', () => {
    const data = graphDataSchema.parse({
      nodes: [
        { id: 'a', label: 'A', type: 'service' },
        { id: 'b', label: 'B', type: 'service' },
      ],
      groups: [
        { id: 'g1', label: '第一组', nodes: ['a', 'missing'] },
        { id: 'g2', label: '第二组', nodes: ['a', 'b'] },
        { id: 'g3', label: '空组', nodes: ['missing'] },
      ],
    })
    const clean = sanitizeGraphData(data)
    expect(clean.groups).toHaveLength(2)
    expect(clean.groups[0]?.nodes).toEqual(['a'])
    // a 已归属 g1，不再出现在 g2；g3 因无有效成员被删除
    expect(clean.groups[1]?.nodes).toEqual(['b'])
  })

  it('title 缺省归一为 null', () => {
    const data = graphDataSchema.parse({
      nodes: [{ id: 'a', label: 'A', type: 'service' }],
    })
    expect(sanitizeGraphData(data).title).toBeNull()
  })
})
