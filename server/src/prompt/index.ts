/** 架构图生成 prompt：system 提示、few-shot 示例与 mock 数据 */
import type { GraphData } from '../render/schema.js'
import type { LayoutDirection } from '../render/layout.js'

export const SYSTEM_PROMPT = `你是一位资深软件架构师，擅长把技术文档提炼为清晰、分层、配色友好的系统架构图。

## 任务
阅读用户提供的技术文档，设计其系统架构，只输出一个 JSON 对象（第一个字符必须是 {，最后一个字符必须是 }），不要输出任何解释文字或代码块标记。

## JSON 结构
{
  "title": "图标题（不超过 20 字）",
  "nodes": [{ "id": "唯一标识（英文/数字）", "label": "节点名称（不超过 14 字）", "type": "语义类型" }],
  "edges": [{ "from": "源节点id", "to": "目标节点id", "label": "关系说明（可选，尽量简短）", "style": "solid 或 dashed" }],
  "groups": [{ "id": "分组唯一标识", "label": "分组名称", "nodes": ["该组内的节点id"] }]
}

## 节点语义类型（type）
- client：用户端、Web、App、小程序
- gateway：API 网关、负载均衡、反向代理、接入层
- service：业务微服务、应用服务
- compute：Serverless、容器平台、作业、任务调度、计算引擎
- storage：对象存储、文件存储、CDN 静态资源
- database：关系型 / NoSQL 数据库
- cache：缓存（Redis / Memcached 等）
- queue：消息队列、事件总线（Kafka / RabbitMQ 等）
- observability：监控、日志、告警、链路追踪
- external：第三方服务、外部系统（支付 / 短信 / 认证等）

## 设计规则
1. 节点总数控制在 6–28 个，聚焦核心组件与主链路，不要罗列文档中的每个细节。
2. 用 groups 按架构分层组织（2–5 个组，如：接入层 / 应用层 / 数据层 / 基础设施），每个节点最多归属一个组。
3. edges 表示调用与数据流向，from → to 即请求方向；必须连接所有主要组件，避免孤立节点与重复边。
4. 同步调用使用 "solid"，异步消息 / 事件 / 数据回流使用 "dashed"。
5. label 使用文档中的术语并保持简短（如 "HTTPS"、"发布事件"）；节点名称用中文。
6. id 使用小写英文或缩写，全局唯一；分组 id 不要与节点 id 相同。`

/** few-shot 消息（user/assistant 交替，教模型输出格式与分组策略） */
export type FewShotMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string }

export const FEW_SHOT_MESSAGES: FewShotMessage[] = [
  {
    role: 'user',
    content: [
      '请根据以下技术文档设计系统架构图。',
      '',
      '技术文档：',
      '"""',
      '一个电商系统：用户通过 Web 与 App 访问，经 API 网关进入订单、用户、商品等微服务；订单服务通过 Kafka 异步通知库存服务；数据存储在 MySQL，热点数据用 Redis 缓存；商品图片放在对象存储。',
      '"""',
    ].join('\n'),
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      title: '电商微服务架构',
      nodes: [
        { id: 'web', label: '用户 Web', type: 'client' },
        { id: 'app', label: '移动 App', type: 'client' },
        { id: 'gw', label: 'API 网关', type: 'gateway' },
        { id: 'order', label: '订单服务', type: 'service' },
        { id: 'user', label: '用户服务', type: 'service' },
        { id: 'goods', label: '商品服务', type: 'service' },
        { id: 'stock', label: '库存服务', type: 'service' },
        { id: 'kafka', label: 'Kafka', type: 'queue' },
        { id: 'mysql', label: 'MySQL', type: 'database' },
        { id: 'redis', label: 'Redis 缓存', type: 'cache' },
        { id: 'oss', label: '对象存储', type: 'storage' },
      ],
      edges: [
        { from: 'web', to: 'gw', label: 'HTTPS', style: 'solid' },
        { from: 'app', to: 'gw', label: 'HTTPS', style: 'solid' },
        { from: 'gw', to: 'order', style: 'solid' },
        { from: 'gw', to: 'user', style: 'solid' },
        { from: 'gw', to: 'goods', style: 'solid' },
        { from: 'order', to: 'kafka', label: '发布事件', style: 'dashed' },
        { from: 'kafka', to: 'stock', label: '消费', style: 'dashed' },
        { from: 'order', to: 'mysql', style: 'solid' },
        { from: 'goods', to: 'redis', style: 'solid' },
        { from: 'goods', to: 'oss', label: '图片', style: 'solid' },
      ],
      groups: [
        { id: 'layer-access', label: '接入层', nodes: ['web', 'app', 'gw'] },
        { id: 'layer-app', label: '应用层', nodes: ['order', 'user', 'goods', 'stock'] },
        { id: 'layer-data', label: '数据层', nodes: ['kafka', 'mysql', 'redis', 'oss'] },
      ],
    }),
  },
  {
    role: 'user',
    content: [
      '请根据以下技术文档设计系统架构图。',
      '',
      '技术文档：',
      '"""',
      '某 SaaS 产品部署在云上：用户经 CDN 与负载均衡访问容器平台上运行的 SaaS 应用；应用读写托管数据库；日志与指标汇入监控平台；支付能力对接第三方支付服务。',
      '"""',
    ].join('\n'),
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      title: 'SaaS 云部署架构',
      nodes: [
        { id: 'cdn', label: 'CDN', type: 'storage' },
        { id: 'lb', label: '负载均衡', type: 'gateway' },
        { id: 'k8s', label: '容器平台', type: 'compute' },
        { id: 'saas', label: 'SaaS 应用', type: 'service' },
        { id: 'db', label: '托管数据库', type: 'database' },
        { id: 'monitor', label: '监控平台', type: 'observability' },
        { id: 'pay', label: '第三方支付', type: 'external' },
      ],
      edges: [
        { from: 'cdn', to: 'lb', label: '回源', style: 'solid' },
        { from: 'lb', to: 'k8s', style: 'solid' },
        { from: 'k8s', to: 'saas', style: 'solid' },
        { from: 'saas', to: 'db', style: 'solid' },
        { from: 'saas', to: 'pay', label: '支付请求', style: 'solid' },
        { from: 'saas', to: 'monitor', label: '日志/指标', style: 'dashed' },
      ],
      groups: [
        { id: 'layer-edge', label: '流量接入', nodes: ['cdn', 'lb'] },
        { id: 'layer-run', label: '运行环境', nodes: ['k8s', 'saas'] },
        { id: 'layer-dep', label: '数据与依赖', nodes: ['db', 'monitor', 'pay'] },
      ],
    }),
  },
]

export function buildUserPrompt(document: string, direction: LayoutDirection): string {
  const layoutHint =
    direction === 'LR'
      ? '图将按「从左到右」的流向渲染，请让主链路自左向右逐步推进。'
      : direction === 'TB'
        ? '图将按「从上到下」的流向渲染，请让主链路自上而下逐步展开。'
        : '布局方向不限，请按调用关系自然组织主链路（系统会自动选择最合适的排布方向）。'
  return [
    '请根据以下技术文档设计系统架构图。',
    layoutHint,
    '',
    '技术文档：',
    '"""',
    document,
    '"""',
  ].join('\n')
}

/** 无 API Key 时的内置演示数据（保证 mock 模式可完整演示） */
export const MOCK_GRAPH: GraphData = {
  title: '示例：电商订单系统',
  nodes: [
    { id: 'web', label: '用户 Web', type: 'client' },
    { id: 'app', label: '移动 App', type: 'client' },
    { id: 'gw', label: 'API 网关', type: 'gateway' },
    { id: 'order', label: '订单服务', type: 'service' },
    { id: 'user', label: '用户服务', type: 'service' },
    { id: 'goods', label: '商品服务', type: 'service' },
    { id: 'stock', label: '库存服务', type: 'service' },
    { id: 'pay', label: '支付服务', type: 'service' },
    { id: 'kafka', label: 'Kafka', type: 'queue' },
    { id: 'mysql', label: 'MySQL 主库', type: 'database' },
    { id: 'redis', label: 'Redis 缓存', type: 'cache' },
    { id: 'oss', label: '对象存储', type: 'storage' },
    { id: 'prom', label: '监控告警', type: 'observability' },
    { id: 'thirdpay', label: '第三方支付', type: 'external' },
  ],
  edges: [
    { from: 'web', to: 'gw', label: 'HTTPS', style: 'solid' },
    { from: 'app', to: 'gw', label: 'HTTPS', style: 'solid' },
    { from: 'gw', to: 'order', style: 'solid' },
    { from: 'gw', to: 'user', style: 'solid' },
    { from: 'gw', to: 'goods', style: 'solid' },
    { from: 'order', to: 'pay', style: 'solid' },
    { from: 'pay', to: 'thirdpay', label: '支付', style: 'solid' },
    { from: 'order', to: 'kafka', label: '发布事件', style: 'dashed' },
    { from: 'kafka', to: 'stock', label: '消费', style: 'dashed' },
    { from: 'kafka', to: 'prom', label: '指标', style: 'dashed' },
    { from: 'order', to: 'mysql', style: 'solid' },
    { from: 'goods', to: 'mysql', style: 'solid' },
    { from: 'user', to: 'redis', style: 'solid' },
    { from: 'goods', to: 'redis', label: '缓存', style: 'solid' },
    { from: 'stock', to: 'redis', style: 'solid' },
    { from: 'user', to: 'oss', label: '文件', style: 'solid' },
  ],
  groups: [
    { id: 'layer-access', label: '接入层', nodes: ['web', 'app', 'gw'] },
    { id: 'layer-app', label: '应用层', nodes: ['order', 'user', 'goods', 'stock', 'pay'] },
    { id: 'layer-data', label: '数据层', nodes: ['kafka', 'mysql', 'redis', 'oss'] },
    { id: 'layer-infra', label: '基础设施', nodes: ['prom'] },
    { id: 'layer-ext', label: '外部依赖', nodes: ['thirdpay'] },
  ],
}
