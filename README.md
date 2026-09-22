# drawAI — 基于 drawio 的 AI 架构图画布

输入一段技术文档，AI 自动生成**配色统一、分层清晰**的架构图；底层是自托管的 [drawio](https://github.com/jgraph/drawio) 编辑器，保留完整的画图、导入导出能力。

## 功能特性

- **AI 生成架构图**：粘贴技术文档（或上传 `.md` / `.txt`）→ DeepSeek 输出结构化图数据 → ELK 自动布局 → 主题引擎渲染 → 一键载入画布继续编辑
- **完整的 drawio 编辑器**：自托管 jgraph/drawio webapp（官方 embed 协议），形状库、右键菜单、格式面板等原生能力全部可用
- **多画布管理**：浏览器本地图纸库（IndexedDB），支持新建 / 切换 / 重命名 / 删除 / 缩略图，编辑自动保存（约 800ms 防抖），刷新自动恢复
- **5 套配色主题**：深海蓝 / 石墨商务 / 森野绿 / 星夜紫 / 极简灰（服务端统一色板，前后端共享）
- **导入导出**：导入 `.drawio` / `.xml` / `.svg` / `.png`（含内嵌 XML）；导出 PNG(2x) / SVG / SVG(含可编辑数据) / drawio XML
- **API Key 双通道**：服务端 `.env`（推荐）或前端「设置」面板（仅存浏览器 localStorage）
- **演示模式**：未配置 API Key 时自动使用内置示例数据，保证开箱可体验完整流程

## 技术栈

| 模块 | 技术 |
|---|---|
| 画布引擎 | 自托管 drawio webapp（v31.4.6）+ 官方 embed postMessage 协议 |
| 前端 | React 19 + TypeScript + Vite + TailwindCSS 4 + Zustand + idb |
| 后端 | Node.js + Express 5 + tsx（SSE 流式推送） |
| LLM | DeepSeek（OpenAI 兼容；`deepseek-flash`，可配置） |
| 校验与布局 | zod（结构化校验 + 自动重试）+ elkjs（ELK layered 分层布局） |

## 快速开始

要求：Node.js ≥ 20、git。

```bash
npm install            # 安装全部依赖（npm workspaces）
npm run setup:drawio   # 一次性拉取 drawio webapp 静态资源（约 80MB，存入 client/public/drawio）
npm run dev            # 同时启动前端(5173) 与后端(3000)
```

打开 http://localhost:5173 即可使用。开发环境下 Vite 将 `/api` 代理到 Express，`/drawio` 直接由 Vite 提供静态资源。

## 配置 DeepSeek

```bash
cp .env.example .env
```

| 变量 | 说明 | 默认值 |
|---|---|---|
| `DEEPSEEK_API_KEY` | DeepSeek API Key（也可在前端「设置」面板填写） | 空（此时为演示模式） |
| `DEEPSEEK_MODEL` | 模型名（官方改名为兼容保留为环境变量） | `deepseek-flash` |
| `DEEPSEEK_BASE_URL` | API 地址 | `https://api.deepseek.com` |
| `PORT` | 服务端端口 | `3000` |

## 使用说明

1. 左侧栏新建或选择画布（首次启动自动创建「示例画布」）
2. 右侧「AI 生成架构图」：粘贴文档或点「填入示例」→ 选择配色主题与布局方向（横向 / 纵向）→ 生成
3. 生成结果自动创建为一张新画布并载入编辑器，可继续手工修改（改动自动保存）
4. 顶部工具栏：新建 / 导入 / 撤销重做 / 缩放 / 适应画布 / 保存（含缩略图）/ 导出

## 生产构建

```bash
npm run build   # 构建前端（client/dist，含 drawio 静态资源）与服务端（server/dist）
npm start       # Express 托管 client/dist + API，访问 http://localhost:3000
```

## 测试

```bash
npm test        # 服务端 vitest 单测（结构化校验 / XML 渲染 / 布局坐标）
```

## 目录结构

```
drawAI/
├─ scripts/setup-drawio.mjs     # 拉取固定 tag 的 drawio webapp（稀疏检出）
├─ client/
│  ├─ public/drawio/            # drawio 静态资源（setup 脚本生成，gitignore）
│  └─ src/
│     ├─ lib/drawio-protocol.ts # embed 协议客户端（握手/load/viewbox/export/autosave）
│     ├─ lib/xml-bounds.ts      # 解析 XML 计算图形包围盒（viewbox 适配用）
│     ├─ lib/storage.ts         # IndexedDB 图纸库
│     ├─ lib/api.ts             # SSE 生成请求客户端
│     ├─ stores/app-store.ts    # zustand 全局状态
│     └─ components/            # DrawioCanvas / Toolbar / DiagramList / AIPanel / SettingsDialog
└─ server/
   └─ src/
      ├─ index.ts               # Express 入口 + 生产静态托管
      ├─ routes/generate.ts     # SSE 生成管线（分析→生成→布局→渲染）
      ├─ llm/deepseek.ts        # DeepSeek 客户端（流式 + 校验重试）
      ├─ prompt/index.ts        # system prompt + few-shot + mock 数据
      └─ render/                # schema(zod) / theme(色板) / layout(ELK) / xml(mxGraphModel)
```

## 常见问题

- **`/drawio` 404 或画布空白**：尚未拉取 drawio 资源，执行 `npm run setup:drawio`；需要重拉时加 `--force`。
- **生成提示"未配置 API Key"**：当前是演示模式；在 `.env` 配置 `DEEPSEEK_API_KEY` 或在前端「设置」面板填写。
- **模型改名**：官方模型名可能变更，改 `.env` 的 `DEEPSEEK_MODEL` 即可，无需改代码。
- **生成结果不理想**：可在提示词中增强对节点粒度与分组的约束（`server/src/prompt/index.ts`），或在画布中手工微调后保存。

## 设计说明

完整的架构设计见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。以下为关键决策摘要：

- **AI 只输出结构化 JSON**（节点/关系/分组），配色与形状由服务端主题引擎 100% 控制，避免 AI 直出 XML 的解析错误与配色不可控
- **布局使用 ELK layered**（drawio 同款引擎）：dagre 的 compound 分组布局存在组间错位缺陷，ELK 对层级分组图的对齐与紧凑度更稳定
- **连线使用 ELK 正交路由并写入 XML**：路由的起止锚点（exit/entry）与折点（waypoints）由服务端计算后固化，避免 drawio 客户端重路由时连线穿过图形块遮挡节点；组内边坐标按容器平移为画布绝对坐标
- **视图适配使用 viewbox**：drawio embed 原生 fit 仅按宽度适配（`ignoreHeight`），纵向长图会溢出被裁，宿主侧解析 XML 计算包围盒后走 `viewbox` action 双向适配
