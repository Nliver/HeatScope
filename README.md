# HeatScope

HeatScope 是页面增长诊断与改版工作台。当前正式应用位于 `apps/web`，使用 Next.js 提供诊断 Wizard、运营知识库、模型配置、历史快照和模型生成 HTML 结果。

## 本地运行

```bash
npm install
npm --prefix apps/web install
npm run dev
```

Next.js 默认监听 `http://127.0.0.1:3000`。主要路由：

- `/diagnosis`：诊断任务
- `/knowledge`：运营知识库
- `/models`：模型配置
- `/history`：历史记录

## 构建与启动

```bash
npm run build
npm run start
```

## Vercel 部署

```bash
npm run deploy
```

部署命令以 `apps/web` 为项目根目录，使用该目录中的 Next.js 与 Vercel 配置。

## 仓库结构

- `apps/web`：正式 Next.js 工作台与同源 API Route
- `apps/api`：生产后端服务骨架
- `ent`、`internal`：生产数据模型与领域服务
- `deploy`：生产后端本地拓扑
- `docs/product`：当前产品与架构文档
- `docs/archive`：历史方案归档

模型 API Key 只允许保存在用户本地工作区或受控 Secret 服务中，禁止提交到仓库。
