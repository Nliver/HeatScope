# CI/CD

`.github/workflows/ci-cd.yml` 是 HeatScope 的统一流水线。

## 触发规则

- Pull Request → `frontend-test`、`secret-scan`、`github-build`
- 合并到 `main` → 先完成上述三个门禁，再执行 `vercel-production`
- 手动运行 → 按当前事件执行；只有从 `main` 手动运行时才会部署生产环境

## GitHub Secrets

在仓库 `Settings → Secrets and variables → Actions` 配置：

| Secret | 值 |
| --- | --- |
| `VERCEL_TOKEN` | Vercel Personal Token |
| `VERCEL_ORG_ID` | 项目绑定的 `orgId` |
| `VERCEL_PROJECT_ID` | 项目绑定的 `projectId` |

当前项目绑定信息位于本地 `.vercel/project.json`，该目录已被 `.gitignore` 排除，不应提交。

## 门禁内容

前端门禁会安装依赖、执行 `git diff --check`、运行 `npm run build`，并上传 `.next` 构建产物。安全门禁使用 Gitleaks 扫描完整 Git 历史，发现疑似 API Key、Token 或其他凭证时阻止后续构建。

Vercel 阶段使用同一份 `VERCEL_TOKEN` 拉取 production 配置，执行 Vercel build，再部署 prebuilt 输出。生产环境建议给 GitHub Environment `production` 配置审批规则。
