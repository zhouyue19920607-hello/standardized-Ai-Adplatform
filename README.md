# Standardized AI Aid Platform

React + Node.js/Express 的标准化 AI 广告素材生成工具。

## 本地开发

```bash
npm install
npm run dev
```

本地后端：

```bash
npm run server
```

默认后端端口为 `4000`，前端会在本地优先请求 `http://localhost:4000/api`。

## 美图谷仓 / Matrix 部署配置

这个仓库以 GitHub 为主要代码源，美图谷仓作为 Matrix 部署仓库。为了避免从 GitHub 同步到美图谷仓后覆盖部署配置，以下文件必须保留并随 GitHub 一起管理：

- `.gitlab-ci.yml`：Matrix CI 构建与部署流程，当前使用 `release` 环境。
- `matrix.conf`：Matrix 项目与服务名，当前为 `NAMESPACE=ai-saap`、`PROJECT=ai-saap`。
- `Dockerfile`：Matrix 构建镜像入口，服务端启动命令为 `node backend/server.mjs`。
- `.env.example`：环境变量示例，只放变量名和示例值，不放真实密钥。

上线同步建议：

```bash
# 本地改完并提交到 GitHub 后，再同步到美图谷仓
# 美图谷仓触发 Matrix CI 时，按 .gitlab-ci.yml 和 matrix.conf 部署
```

## Matrix 环境变量

真实密钥不要提交到 GitHub 或美图谷仓。请在 Matrix 服务的环境变量里配置：

美图谷仓部署时，可按 [美图谷仓环境变量配置说明](docs/meitu-gucang-env.md) 填写。

新人接手、迁移复盘和问题排查可先看 [AI 工具迁移到美图谷仓及服务器交接手册](docs/AI工具迁移到美图谷仓及服务器交接手册.docx)。

```bash
AIGC_AK=你的开放平台AK
AIGC_SK=你的开放平台SK
AIGC_BIZ=ai-saap
AIGC_API_HOST=https://openapi-ali.meitu.com
AIGC_AUTH_MODE=query
AIGC_PROVIDER_API_STYLE=openapi
AIGC_PUBLIC_BASE_URL=https://你的线上站点域名
AIGC_MAX_POLLS=120
AIGC_POLL_INTERVAL_MS=2000
FEISHU_APP_ID=飞书应用App ID
FEISHU_APP_SECRET=飞书应用App Secret
FEISHU_USAGE_WIKI_TOKEN=Z3zTwTAFViAZH4klt9NcsqNFngb
FEISHU_USAGE_TABLE_ID=tblHi5s5LQVZZ66v
```

网站会在后端异步记录已登录用户的访问、生成和下载事件到飞书多维表格。飞书密钥只能配置在 Matrix 服务环境变量中，不能放到前端变量或提交到仓库。

当前标准化素材看板的图片适配优先走广告图适配管线：

```http
POST /api/aigc/adapt-image
```

旧的 AI 图像扩展后端入口仍然保留，会走 `/v1/dispatcher` 的 `outpainting` 参数：

```http
POST /api/aigc/image-expand
```

示例请求：

```json
{
  "imageUrl": "https://example.com/input.jpg",
  "targetWidth": 1440,
  "targetHeight": 2340
}
```
