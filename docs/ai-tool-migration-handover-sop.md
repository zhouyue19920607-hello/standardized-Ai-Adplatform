# AI 工具迁移到美图谷仓及服务器交接手册

> 适用项目：`standardized-Ai-Adplatform` / 标准化 AI 广告素材生成工具  
> 目标读者：第一次接手该项目的新同学  
> 文档目标：让新人能看懂项目从本地开发、迁移到美图谷仓 / Matrix、部署到服务器、接入公司 AIGC API、排查常见问题的完整链路。

## 1. 先看结论

这个项目的核心链路是：

```text
本地代码
  -> GitHub 仓库
  -> 同步到美图谷仓
  -> Matrix 根据 .gitlab-ci.yml、matrix.conf、Dockerfile 构建部署
  -> 线上服务读取 Matrix / 服务器环境变量
  -> 后端调用公司 AIGC API
  -> 前端看板展示 AI 适配结果
```

新同学接手时，优先确认 5 件事：

1. 代码源在哪里：GitHub 仓库地址、美图谷仓地址、当前线上域名。
2. 部署走哪条链路：美图谷仓 / Matrix，还是独立服务器 PM2 + Nginx。
3. 环境变量是否配置完整：特别是 `AIGC_AK`、`AIGC_SK`、`AIGC_API_HOST`、`AIGC_PUBLIC_BASE_URL`。
4. 公司 AIGC API 权限是否开通：在“品牌广告工具”app 下创建 biz，选择所需算法，再到申请列表获取 AK/SK。
5. 结果素材是否能被算法侧访问：图片 / 视频 URL 必须是公司 AIGC 服务可访问的公网或内网白名单 URL。

## 1.1 2026-06-12 最新接力状态

这一节是给“下一台电脑继续接手的人”看的。先看这里，再决定从哪里继续改。

### 已经完成的代码改动

- 已将标准化素材看板的 OpenAPI 异步主链切到：
  - `POST /api/v1/push`
  - `GET /api/v1/sdk/status?task_id=...`
- 已将 `mtimage_expand_v4_async` 纳入统一任务网关提交流程，不再依赖旧的散乱轮询逻辑。
- 已将原来容易报 `GATEWAY_AUTHORIZED_ERROR` 的裁切链路，替换为：
  - `POST /v1/dispatcher`
  - `extra_pipe_inputs.task_type = smart_crop`
- 已修复 adapt-image 最终落盘阶段，避免错误的 contain/黑边式缩放。
- 已补充 Logo 检测结果兼容：
  - 支持 `detected_boxes`
  - 支持归一化坐标反算回原图像素坐标
- 已给图片补上 Observer URL 中转能力：
  - 当 OpenAPI 同步检测更偏好远程 URL 时，可优先走可访问 URL
- 已给 `textdetect` 增加多候选路由兜底尝试，避免单一路由 404 直接失败。

### 当前已经验证过的事实

1. `expand` 主链已通。
2. `dispatcher smart_crop` 主链已通。
3. `/api/aigc/adapt-image` 能完整跑完并返回结果图。
4. 当前生成效果比早期版本稳定，但还不是最终想要的“智能排版”效果。

### 当前仍然存在的核心问题

#### 1. 焦点视窗前端预览层级问题

- 焦点视窗模板默认底图 / UI / UI底图 文件仍然存在于：
  - `public/focal-window/fixed_bg_1.png`
  - `public/focal-window/fixed_bg_2.png`
  - `public/focal-window/icon_bg.png`
  - `public/focal-window/gradient_layer.png`
- 如果页面上看起来“丢了”，大概率不是资源没了，而是：
  - 预览渲染分支判断错了，没命中 break/jumping 模板分支
  - 或者 AI 结果层把默认模板层覆盖掉了
- 重点检查文件：
  - `components/ConfigWorkspace.tsx`

#### 2. 现在的“智能排版”仍是降级版

当前后端策略本质上还是：

```text
detect
 -> merge_masks
 -> inpaint_copy
 -> expand
 -> ai_crop
 -> qa
```

这还不是“主体 / 文案 / Logo 分层重排”，只是：

- 尽量检测主体
- 尽量扩背景
- 再做智能裁切

所以它能改善出图，但还不能完全保证：

- 文案不丢
- logo 不丢
- 主体永远处在最佳安全区

#### 3. `logo_seg` / `textdetect` 还没有完全稳定

当前真实状态是：

- `logo_seg` 更像偏好可访问 URL 输入，而不是 inline/base64
- `textdetect` 真实可用路由还未最终确认

这会直接影响“保护区驱动的智能排版”能力，因为：

- 如果拿不到 logo/text 的有效检测框
- 后面的 planner 只能靠主体做决策

### 当前版本号与提交信息

- GitHub 远端：`origin`
- 美图谷仓远端：`meitu`
- 当前关键提交：
  - `ad505d7 Improve OpenAPI image adaptation flow`
- 当前发布 tag：
  - `v1.0.57`

### 下一步推荐执行顺序

#### 第一步：修焦点视窗前端预览层

目标：

- 默认底图 / UI / UI底图 永远保留
- AI 图只替换中间的动态内容层
- 不允许 AI 结果覆盖模板固定层

重点文件：

- `components/ConfigWorkspace.tsx`

#### 第二步：把智能排版改造成“保护区驱动”

建议做法：

1. 先保留现有 `analysis`
2. 新增 adapter，把现有 `analysis` 适配成统一的 protected zones
3. 在 zones 基础上加 layout planner
4. planner 先只决定：
   - `crop`
   - `expand`
   - `expand_then_crop`
5. 再单独验证 `position` 参数是否真的生效

#### 第三步：不要把整个方案押在 `position`

即便 OpenAPI 的 `expand` 支持 `position`，也必须先实验验证：

- `top`
- `bottom`
- `center`

如果三张结果没有明显区别，就不要把“智能排版”依赖在它上面，而是降级为：

- `center` 扩图
- `envelope` 驱动裁切

### 下一次接手时建议先读的文件

按优先级看：

1. `backend/server.mjs`
2. `docs/ai-adaptation-backend-adapter-design.md`
3. `docs/ai-tool-migration-handover-sop.md`（就是本文件）
4. `components/ConfigWorkspace.tsx`

### 下一次接手时建议先搜的关键字

```text
adapt-image
runAdaptProvider
submitAigcTask
dispatcher
smart_crop
expandImageV4ForAdapt
suggestCroppingForAdapt
planAdaptStrategy
isBreakFocalTemplate
jumping-focal-window
refresh-ui-bottom-nav
```

## 2. 项目信息登记

后续有人接手时，先把下面信息补全。真实密钥不要写在这里。

| 项目 | 内容 |
| --- | --- |
| 项目名称 | 标准化 AI 广告素材生成工具 |
| 本地目录 | `standardized-Ai-Adplatform` |
| GitHub 仓库 | 待补充 |
| 美图谷仓仓库 | 待补充 |
| 所属 app | 品牌广告工具 |
| 当前 biz | `ai-saap`，以申请平台实际创建的 biz 为准 |
| Matrix namespace | `ai-saap` |
| Matrix project | `ai-saap` |
| 线上域名 | `https://ai-saap.cloud.meitu-int.com`，如有变更请替换 |
| 后端端口 | `4000` |
| Node 版本 | Docker 使用 `node:20-alpine` |
| 主要后端入口 | `backend/server.mjs` |
| 前端构建产物 | `dist` |
| AI 适配接口 | `POST /api/aigc/adapt-image` |

## 3. 关键联系人

联系人要写“角色 + 找谁 + 什么时候找 + 需要给对方什么信息”。这样新人不会只知道一个名字，但不知道该怎么开口。

| 角色 | 找谁 / 群 | 什么时候找 | 需要准备的信息 |
| --- | --- | --- | --- |
| 项目负责人 / 需求 owner | 待补充 | 需求范围、上线优先级、验收标准不清楚 | 页面截图、期望效果、影响范围 |
| 前端 owner | 待补充 | 页面样式、交互、前端接口调用异常 | 浏览器控制台报错、接口返回、复现步骤 |
| 后端 owner | 待补充 | `/api/aigc/*` 报错、日志异常、环境变量读取不到 | 请求参数、返回 body、后端日志、环境变量名 |
| 美图谷仓 / Matrix 对接人 | 待补充 | 仓库权限、CI/CD 失败、部署失败、服务重启 | 谷仓项目链接、tag、CI 日志、Matrix namespace/project |
| app / biz 申请 | 陈宏炎 | 申请 app、创建 biz、确认测试 / 正式环境 AK/SK | 所属 app、biz 名称、算法清单、申请环境 |
| 算法对接 | 张玏 | 算法能力、算法权限、效果问题、算法错误码 | 算法名、输入输出、错误码、request id/task id、样例素材 |
| 模型外采 | 林元健 | 需要外采模型、确认模型资源或供应商能力 | 需求背景、目标效果、预算/周期约束、样例 |
| 美图容问题 | 江善桃 | 美图容相关问题、容器/环境/部署资源异常 | 项目链接、服务名、环境、错误截图、日志片段 |
| RoboHub API Agent | https://robohub.meitu-int.com/workspace/chats/d0181eb6-ec79-4d06-a7a4-101bbc55e070 | API 口径、参数、错误码、接入方案需要先梳理 | 需求描述、接口目标、当前请求参数、错误码、日志片段 |
| Observer / 素材存储对接人 | 待补充 | 图片或视频 URL 算法侧无法访问、CDN 域名问题 | 素材 URL、访问报错、bucket/biz、Access-ID |
| 服务器 / 运维同学 | 待补充 | 独立服务器部署、Nginx、PM2、磁盘、端口、防火墙 | 服务器 IP、域名、端口、日志路径、服务名 |

### 3.1 常用链接

| 链接 | 用途 | 什么时候看 |
| --- | --- | --- |
| https://admin-aigc.meitu.com/biz/apply_create?id=1009&edit=1 | APP / BIZ 申请网站 | 创建“品牌广告工具”app 下的 biz、选择算法、申请或编辑权限 |
| https://admin-aigc.meitu.com/inference/index_mix?page=1&appIDs=8059&biz=ai-saap&mix=new&date_range=1780617155514%2C1780675199000 | API 调用记录 / 问题排查入口 | 查看接口调用问题出在哪里，包括调用记录、错误码、appID、biz 和时间范围 |
| https://robohub.meitu-int.com/docs/open-platform/guides/getting-started | API 接口文档 | 接公司 API 前先读，确认 app/biz、AK/SK、环境、鉴权和调用方式 |
| https://robohub.meitu-int.com/workspace/chats/d0181eb6-ec79-4d06-a7a4-101bbc55e070 | RoboHub API Agent | API 口径、参数、错误码或接入方案不确定时，用来对话梳理方案 |

## 4. 本地开发步骤

### 4.1 安装依赖

```bash
cd standardized-Ai-Adplatform
npm install
```

### 4.2 启动前端

```bash
npm run dev
```

### 4.3 启动后端

```bash
npm run server
```

默认后端端口是 `4000`。本地前端会优先请求：

```text
http://localhost:4000/api
```

### 4.4 本地必须确认的功能

1. 页面可以打开。
2. 模板、配置、上传素材能正常读写。
3. 后端 `/api` 能访问。
4. AI 适配按钮能发起请求。
5. 如果没有配置真实 `AIGC_AK` / `AIGC_SK`，页面应给出清晰错误，而不是白屏。

## 5. 迁移到美图谷仓 / Matrix 的步骤

### 5.1 迁移前检查

迁移前确认这些文件在仓库里，不能只留在本地：

| 文件 | 作用 |
| --- | --- |
| `.gitlab-ci.yml` | Matrix CI 构建与部署流程 |
| `matrix.conf` | Matrix 项目和镜像配置 |
| `Dockerfile` | 构建前端、安装后端依赖、启动 Node 服务 |
| `.env.example` | 环境变量示例，只放变量名和示例值 |
| `backend/server.mjs` | 线上后端入口 |
| `dist` | Docker 构建时生成，不需要手动提交 |

当前 `matrix.conf` 内容：

```text
NAMESPACE=ai-saap
PROJECT=ai-saap
IMAGE_NS=ai-saap
IMAGE_REPO=ai-saap
```

当前 Matrix CI 通过 tag 触发，tag 格式是：

```text
v1.2.3
v1.2.3-1
```

### 5.2 同步代码到谷仓

建议流程：

1. 本地完成开发和自测。
2. 提交到 GitHub。
3. 把 GitHub 代码同步到美图谷仓。
4. 在谷仓确认 `.gitlab-ci.yml`、`matrix.conf`、`Dockerfile` 没被覆盖或漏掉。
5. 打 tag 触发 Matrix CI。
6. 在 Matrix / 谷仓 CI 页面确认 build 和 deploy 都成功。

### 5.3 配置谷仓环境变量

在美图谷仓项目的后端运行环境里配置，不要写到前端页面，也不要提交到 GitHub。

```bash
AIGC_AK=
AIGC_SK=
AIGC_BIZ=ai-saap
AIGC_API_HOST=https://openapi-ali.meitu.com
AIGC_AUTH_MODE=query
AIGC_PROVIDER_API_STYLE=openapi
AIGC_POLL_ENDPOINT_TEMPLATE=/v2/task/{taskId}
AIGC_PUBLIC_BASE_URL=https://ai-saap.cloud.meitu-int.com
AIGC_MAX_POLLS=120
AIGC_POLL_INTERVAL_MS=2000
OBSERVER_ACCESS_ID=
OBSERVER_BIZ=your-bucket/default
OBSERVER_HOST=https://observer.starii-int.com
OBSERVER_CDN_DOMAIN=https://your-cdn.example.com
DATA_DIR=/data/ai-saap
STORAGE_DIR=/data/ai-saap/storage
```

重点：

- `AIGC_AK` / `AIGC_SK` 必须是在“品牌广告工具”app 下申请的正式或测试环境密钥；app / biz 和环境找陈宏炎确认。
- `AIGC_API_HOST` 必须和 AK/SK 所属环境一致。
- `AIGC_PUBLIC_BASE_URL` 必须是算法服务可以访问的线上域名。
- `DATA_DIR`、`STORAGE_DIR` 要挂持久化卷，否则容器重建后后台上传素材可能丢失。

### 5.4 部署后验证

部署成功后，按下面顺序验收：

1. 打开线上首页，确认页面不是白屏。
2. 打开浏览器控制台，确认没有静态资源 404。
3. 上传一张测试素材，确认后端能保存文件。
4. 调用 `POST /api/aigc/adapt-image`。
5. 确认接口返回 `ok: true`。
6. 确认生成结果可以在页面预览。
7. 刷新页面，确认配置和上传内容没有丢失。

测试请求示例：

```bash
curl -X POST "https://ai-saap.cloud.meitu-int.com/api/aigc/adapt-image" \
  -H "Content-Type: application/json" \
  -d '{
    "imageUrl": "https://your-cdn.example.com/ad.jpg",
    "targetWidth": 1440,
    "targetHeight": 2340,
    "templateId": "mt-s-1",
    "templateName": "开屏测试",
    "app": "meitu",
    "allowRelayout": true,
    "prompt": "保持主体、文案、Logo 完整，背景自然延展，最终画面像完整广告设计稿。"
  }'
```

成功响应应包含：

```json
{
  "ok": true,
  "resultUrl": "/static/...",
  "strategy": "crop/outpaint/relayout",
  "qa": {
    "dimensionPassed": true
  }
}
```

## 6. 部署到独立服务器的步骤

如果项目不走美图谷仓 / Matrix，而是部署到独立服务器，可使用当前仓库里的 `deploy.sh` 作为参考。

### 6.1 服务器部署链路

```text
本地构建或打包
  -> 上传部署包到服务器
  -> 解压到 /var/www/ai-platform
  -> 安装后端依赖
  -> PM2 启动 Node 后端
  -> Nginx 代理前端和 API
```

### 6.2 关键目录

| 路径 | 作用 |
| --- | --- |
| `/var/www/ai-platform` | 应用根目录 |
| `/var/www/ai-platform/backend` | 后端目录 |
| `/var/www/ai-platform/dist` | 前端构建产物 |
| `/var/www/ai-platform/backend/data` | 配置数据 |
| `/var/www/ai-platform/backend/storage` | 上传文件、遮罩、生成结果 |
| `/var/log/pm2` | PM2 日志 |

### 6.3 常用命令

```bash
pm2 status
pm2 logs ai-platform-backend
pm2 restart ai-platform-backend
nginx -t
systemctl reload nginx
```

### 6.4 服务器部署最容易漏的点

1. `storage` 目录必须让 Node 服务有写权限。
2. Nginx 要正确代理 `/api` 和 `/static`。
3. 服务器上的环境变量要和谷仓环境变量保持一致。
4. 如果算法侧需要访问上传素材，服务器域名必须能被算法服务访问。
5. 不要把真实 AK/SK 写进 `pm2.json` 后提交到仓库；生产环境应通过服务器环境变量或安全配置注入。

## 7. 接公司 AIGC API 的步骤

### 7.1 先确认 API 口径

公司 AIGC API 当前可能有两种口径。接入前先读 API 接口文档，再用 RoboHub API Agent 梳理方案，最后按分工找陈宏炎或张玏确认。

API 接口文档：

```text
https://robohub.meitu-int.com/docs/open-platform/guides/getting-started
```

| 口径 | 域名示例 | 鉴权方式 | 配置 |
| --- | --- | --- | --- |
| OpenAPI / MTLAB query | `https://openapi-ali.meitu.com` | query 参数鉴权 | `AIGC_AUTH_MODE=query`、`AIGC_PROVIDER_API_STYLE=openapi` |
| AI Platform header | `https://ai-platform-api.meitu.com` | Header 鉴权 | `AIGC_AUTH_MODE=platform_header`、`AIGC_PROVIDER_API_STYLE=ai-platform` |

两种口径只选一种，不要混用。

同时必须确认 AK/SK 所属环境。测试环境和正式环境对应的 API 链接不同，不能用测试 AK/SK 请求正式链接，也不能用正式 AK/SK 请求测试链接。

| 环境 | 链接示例 | 说明 |
| --- | --- | --- |
| 测试环境 | `https://openapi-pre.mtlab.meitu.com` | 仅用于测试环境 AK/SK，具体以申请页或陈宏炎确认为准 |
| 正式环境 | `https://openapi-ali.meitu.com` | 仅用于正式环境 AK/SK，具体以申请页或陈宏炎确认为准 |

### 7.2 申请权限

当前项目所属 app 是：

```text
品牌广告工具
```

在公司 API 平台申请时，先在“品牌广告工具”app 下创建 biz。这里的 biz 可以理解为 app 下面的小分类，用来区分不同业务、项目或能力调用方。

申请顺序：

1. 进入 APP / BIZ 申请网站：`https://admin-aigc.meitu.com/biz/apply_create?id=1009&edit=1`。
2. 选择所属 app：`品牌广告工具`。
3. 在 app 下创建 biz，例如当前项目可使用 `ai-saap`，最终以平台实际创建名称为准。
4. 创建 biz 时选择当前项目需要的算法能力。
5. 创建完成后，去申请列表获取对应环境的 `AIGC_AK` / `AIGC_SK`。
6. 记录 AK/SK 属于测试环境还是正式环境。
7. 按环境配置对应的 `AIGC_API_HOST`。

需要找对应同学确认或申请：

1. `AIGC_AK`
2. `AIGC_SK`
3. 业务标识 `AIGC_BIZ`
4. 所需算法权限
5. 测试环境和正式环境的域名
6. 错误码文档或排查群

分工：

- 申请 app / biz、确认 AK/SK 环境：找陈宏炎。
- 算法能力、算法权限、算法错误码和效果问题：找张玏。
- 需要外采模型或确认模型资源：找林元健。
- 美图容相关问题：找江善桃。

当前项目涉及的能力包括：

| 语义能力 | 用途 |
| --- | --- |
| 主体 / 显著性检测 | 找出商品、人像或主体区域 |
| Logo 检测 | 保护 Logo 或识别 Logo 区域 |
| 文字检测 | 保护广告文案、slogan |
| 图片扩图 | 把非目标比例素材扩成目标比例 |
| 图片消除 / 重绘 | 处理需要重绘的区域 |
| 智能裁剪 | 生成适配目标广告位的裁剪结果 |

### 7.3 用 RoboHub Agent 辅助确认接口方案

API 口径、字段、错误码或接入方案不确定时，先打开 RoboHub Agent：

```text
https://robohub.meitu-int.com/workspace/chats/d0181eb6-ec79-4d06-a7a4-101bbc55e070
```

建议提问时带上这些信息：

1. 当前要接的能力，例如扩图、消除、智能裁剪、文字检测。
2. 期望输入和输出，例如输入图片 URL，输出适配后的图片 URL。
3. 当前项目后端接口，例如 `POST /api/aigc/adapt-image`。
4. 现有环境变量口径，例如 `AIGC_AUTH_MODE=query`、`AIGC_PROVIDER_API_STYLE=openapi`。
5. 实际报错，例如错误码、返回 body、task id、后端日志。

让 Agent 输出这 4 类结果，再进入开发或找对应同学确认：

1. 推荐使用的 API 口径和域名。
2. 请求参数结构和必填字段。
3. 返回结果字段和轮询方式。
4. 错误码原因、排查路径和需要找哪个 owner。

注意：RoboHub Agent 可以先给方案，但 app / biz、AK/SK 环境以陈宏炎确认为准，算法权限和算法效果以张玏确认为准。

### 7.4 后端接入顺序

1. 在环境变量里配置 AK/SK、域名、鉴权模式。
2. 后端启动时读取环境变量。
3. 前端请求统一打到项目后端，不直接请求公司 AIGC API。
4. 后端把前端参数转换成公司 API 需要的参数。
5. 如果是异步任务，后端拿到 `taskId` 后轮询结果。
6. 后端把远端结果持久化到本项目 `/static` 或存储服务。
7. 后端返回稳定格式给前端。

前端只需要关心项目自己的接口：

```http
POST /api/aigc/adapt-image
```

不要让前端直接处理 AK/SK、签名、轮询和算法错误码。

### 7.5 查看接口调用问题

如果后端接口失败，但不确定问题发生在鉴权、参数、算法、素材下载还是轮询阶段，先看 API 调用记录：

```text
https://admin-aigc.meitu.com/inference/index_mix?page=1&appIDs=8059&biz=ai-saap&mix=new&date_range=1780617155514%2C1780675199000
```

排查时重点看：

1. `appID` 是否是当前项目对应的 app。
2. `biz` 是否是当前项目使用的 biz，例如 `ai-saap`。
3. 时间范围是否覆盖刚才的测试请求。
4. 是否有错误码、错误信息、request id 或 task id。
5. 失败发生在网关鉴权、参数校验、算法执行还是结果轮询。

拿到错误码和 task id 后，再按分工处理：

- app / biz、AK/SK、环境链接问题：找陈宏炎。
- 算法权限、算法错误码、算法效果问题：找张玏。
- 后端参数转换、轮询和结果持久化问题：找后端 owner。

## 8. 迁移过程问题记录

每次遇到问题，都按这个格式记录。新人真正需要的是“怎么发现、找谁、怎么解决、以后怎么避免”。

| 日期 | 问题 | 现象 | 原因 | 找谁 | 解决办法 | 后续动作 |
| --- | --- | --- | --- | --- | --- | --- |
| 待补充 | 谷仓没有读到环境变量 | 页面提示缺少 `AIGC_AK` / `AIGC_SK` | 变量填在了错误环境，或填完没有重启 | 谷仓 / Matrix 对接人、后端 owner | 确认变量在后端运行环境，重新部署或重启服务 | 在上线 checklist 加“环境变量截图确认” |
| 待补充 | 算法侧下载不到素材 | 接口提示素材 URL 不可访问 | `AIGC_PUBLIC_BASE_URL` 不是算法可访问域名，或没有配置 Observer | Observer 对接人、后端 owner | 配置公网 / 内网可访问 URL；视频类素材走 Observer 中转 | 接口测试时固定检查素材 URL |
| 待补充 | API 接入方案不确定 | 不确定该用哪个域名、鉴权方式或参数结构 | 接口资料口径不一致，或需求还没翻译成具体 API | RoboHub API Agent、陈宏炎、张玏、后端 owner | 先让 RoboHub Agent 梳理推荐方案，再按分工确认 app/biz、权限和算法口径 | 把最终方案补到本章节 |
| 待补充 | 不确定接口调用失败在哪里 | 后端只看到失败，但不知道是鉴权、参数、算法还是素材问题 | 没有先看公司 API 调用记录 | 张玏、后端 owner | 打开 API 调用记录入口，按 appID、biz、时间范围过滤，查看错误码、请求链路和 task id | 把错误码、task id 和处理结论补回文档 |
| 待补充 | biz 或算法权限没有配置完整 | AK/SK 有了，但某些算法调用失败 | 在“品牌广告工具”app 下没有创建正确 biz，或创建 biz 时漏选算法 | 陈宏炎、张玏 | 回到 app 下确认 biz 和算法权限，补开缺失能力 | 记录当前 biz 和已开通算法清单 |
| 待补充 | 鉴权失败 | 返回 `90002` / `GATEWAY_AUTHORIZED_ERROR` | AK/SK 环境和 `AIGC_API_HOST` 不匹配，或权限未开 | 陈宏炎、张玏 | 换成匹配环境的 host，确认算法权限开通 | 记录 AK/SK 所属环境 |
| 待补充 | 算法拒绝任务 | 返回 `60477` 或算法层错误 | prompt、比例、输入格式或算法限制不满足 | 张玏、后端 owner | 用安全 prompt 和标准比例先验证，再逐步恢复真实参数 | 保留最小可复现请求 |
| 待补充 | 现有算法能力不满足需求 | 内部算法效果或能力覆盖不了目标 | 需要外采模型或新增模型能力 | 林元健、张玏 | 先确认内部算法边界，再评估外采模型方案 | 记录模型来源、成本、周期、效果样例 |
| 待补充 | 美图容相关异常 | 容器、运行环境或资源相关问题无法定位 | 美图容配置、权限或资源异常 | 江善桃 | 带项目链接、服务名、环境和日志找对应 owner 排查 | 记录最终配置和处理方式 |
| 待补充 | 容器重建后后台上传丢失 | 模板、蒙版、视频需要重新上传 | `DATA_DIR` / `STORAGE_DIR` 没有挂持久化卷 | Matrix 对接人、运维 | 配置持久化挂载卷 | 上线前检查卷配置 |

## 9. 常见问题排查表

| 现象 | 优先检查 | 怎么解决 |
| --- | --- | --- |
| 页面白屏 | 前端静态资源是否 404、构建是否成功 | 看浏览器控制台和 Matrix build 日志 |
| 接口 404 | Nginx / Matrix 路由、后端是否启动、接口路径是否正确 | 确认请求是 `/api/aigc/adapt-image` |
| 接口 500 | 后端日志、环境变量、请求参数 | 先用 curl 复现，再看后端日志 |
| 不确定失败发生在哪一层 | API 调用记录里的 appID、biz、时间范围、错误码、task id | 打开 API 调用记录入口查看调用链路，再带错误码和 task id 找张玏 |
| 不知道 API 怎么接 | 能力目标、输入输出、接口口径、现有报错 | 先问 RoboHub API Agent 输出方案；app/biz 找陈宏炎，算法找张玏 |
| 部分算法没权限 | 所属 app、biz、创建 biz 时勾选的算法 | app/biz 找陈宏炎，算法权限找张玏 |
| 模型能力不够 | 内部算法效果、目标效果、是否需要外采 | 模型外采找林元健，算法边界找张玏 |
| 美图容异常 | 项目链接、服务名、环境、日志 | 美图容问题找江善桃 |
| 缺少 AK/SK | `AIGC_AK`、`AIGC_SK` 是否在后端环境 | 重新配置后端环境变量并重启 |
| 鉴权失败 | AK/SK 环境、`AIGC_API_HOST`、`AIGC_AUTH_MODE` | app/biz 和 AK/SK 环境找陈宏炎，算法权限找张玏 |
| 轮询超时 | `AIGC_MAX_POLLS`、`AIGC_POLL_INTERVAL_MS`、算法任务状态 | 提高轮询次数；算法任务状态找张玏查 task id |
| 结果图打不开 | 远端结果是否过期、本地是否持久化成功 | 后端拿到结果后立即保存到 `/static` 或存储服务 |
| 视频接口失败 | 输入视频是不是 URL，算法侧是否可访问 | 配置 Observer 上传中转 |
| 上传内容丢失 | `DATA_DIR`、`STORAGE_DIR` 是否持久化 | 配置挂载卷并重新上传一次 |

## 10. 上线 checklist

上线前逐项确认：

- [ ] GitHub 代码已提交。
- [ ] 美图谷仓代码已同步。
- [ ] `.gitlab-ci.yml` 存在。
- [ ] `matrix.conf` 中 namespace/project 正确。
- [ ] `Dockerfile` 能构建前端并启动后端。
- [ ] Matrix CI build 成功。
- [ ] Matrix CI deploy 成功。
- [ ] 公司 API 所属 app 已确认是“品牌广告工具”。
- [ ] biz 已在“品牌广告工具”app 下创建。
- [ ] 创建 biz 时已选择当前项目需要的算法。
- [ ] 后端环境变量已配置。
- [ ] `AIGC_AK` / `AIGC_SK` 未提交到仓库。
- [ ] `AIGC_API_HOST` 和 AK/SK 环境匹配。
- [ ] `AIGC_PUBLIC_BASE_URL` 是算法侧可访问域名。
- [ ] `DATA_DIR` / `STORAGE_DIR` 已挂持久化卷。
- [ ] 页面可访问。
- [ ] 上传素材可保存。
- [ ] `/api/aigc/adapt-image` 可返回结果。
- [ ] 结果图可预览。
- [ ] 后端日志没有持续报错。

## 11. 新人接手路线

新人第一天建议按这个顺序看：

1. 先读本文件，理解完整链路。
2. 再读 `README.md`，理解本地开发和 Matrix 配置。
3. 再读 `docs/meitu-gucang-env.md`，理解环境变量。
4. 再读 `docs/ai-adaptation-backend-adapter-design.md`，理解 AIGC 适配层设计。
5. 阅读 API 接口文档，理解 app/biz、AK/SK、环境和鉴权流程。
6. 打开 RoboHub API Agent，了解接口问题可以怎么对话拿方案。
7. 本地启动一次前端和后端。
8. 用测试图跑一次 `/api/aigc/adapt-image`。
9. 找项目 owner 补齐仓库地址、线上域名和仍缺失的联系人信息。

## 12. 后续维护规则

1. 每次上线后，把遇到的问题补到“迁移过程问题记录”。
2. 每次 API 口径变化后，同步更新环境变量说明。
3. 每次换域名、bucket、Matrix 项目名后，同步更新项目信息登记。
4. 真实密钥只放环境变量管理平台，不写进文档、不写进代码、不截图外传。
5. 遇到新错误码时，记录错误码、task id、请求参数、解决人和最终原因。
