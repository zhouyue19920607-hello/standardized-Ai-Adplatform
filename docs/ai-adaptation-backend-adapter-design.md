# AI 广告图适配后端适配层设计

本文把 6 个美图算法接口整理成当前项目可落地的后端适配层设计。目标是在「标准化素材看板」中，让用户上传一张非目标尺寸图片后，系统能根据目标模板尺寸自动完成裁剪、扩图或智能重排，并尽量保住主体物、文案、Logo、slogan 的完整性和美观度。

## 目标

- 输入一张用户上传图片和一个目标广告位尺寸。
- 识别并保护主体物、文字、Logo、slogan 等关键内容。
- 根据源图和目标比例差异自动选择 `crop`、`outpaint`、`relayout` 等策略。
- 对扩图和重排结果做自动质检，发现关键元素丢失或越界时重试或降级。
- 对前端暴露一个稳定接口，屏蔽 6 个底层算法的异步轮询、鉴权、结果解析和降级逻辑。

## 当前 Node MVP 落地状态

现在项目里的 Node 后端已经落了 `/api/aigc/adapt-image` MVP，当前实现口径是：

- 已实现
  - 三路检测：主体、Logo、文字
  - 像素级 mask 合并，并落盘为 `protectedMaskUrl`
  - 单独合并 `logo + 文字` 生成可消除的 `removableMaskUrl`
  - 主动步骤编排：`inpaint(Logo+文字) -> expand -> AI crop`
  - 深度 QA 第一版：尺寸校验、主体 mask IoU、OCR 文案召回、Logo hash 相似度、安全区检查
- 仍是降级实现
  - 大比例跨度场景仍然是 `inpaint + outpaint + crop`，不是分层重排
- 当前明确做不到
  - 没有真正的 `layout planner`
  - 不能把主体、文案、Logo 拆成独立图层后重新自动排版

## 现有代码落点

当前项目已经有 AIGC 调用基础设施，建议在此基础上扩展，而不是新建独立服务。

- 后端入口：[backend/server.mjs](../backend/server.mjs)
- 前端 API 定义：[services/api.ts](../services/api.ts)
- 当前图片 AI 适配入口：`POST /api/aigc/smart-crop`
- 当前前端调用：`smartCropImageWithAigc(...)`
- 当前 AIGC 配置：`AIGC_AK`、`AIGC_SK`、`AIGC_API_HOST`、`AIGC_PUBLIC_BASE_URL` 等环境变量

建议新增统一接口：

```http
POST /api/aigc/adapt-image
```

并逐步让 `smartCropImageWithAigc` 切换到该接口。

## 接口口径差异与落地取舍

目前两份接口资料存在口径差异，后端适配层需要把这些差异隔离在 provider client 内，不能让管线层直接依赖某一种写法。

| 项目 | 资料 A：OpenAPI 形态 | 资料 B：AI Platform 形态 | 适配层取舍 |
|------|----------------------|--------------------------|------------|
| 基础域名 | `https://openapi.mtlab.meitu.com/v1` | `https://ai-platform-api.meitu.com/v1`、`/v2` | 通过环境变量配置，默认沿用现有 `AIGC_API_HOST` |
| 鉴权 | query：`api_key`、`api_secret` | Header：`X-Api-Key`、`X-Api-Secret` | `mtlabClient` 支持 `query` 与 `header` 两种模式 |
| 异步 ID | `msg_id` | `task_id` | 统一映射成 `taskId` |
| 轮询接口 | 资料未统一，需要按实际网关确认 | `GET /v2/task/{task_id}` | client 内配置 `pollEndpointTemplate` |
| 入参格式 | `media_info_list` + `parameter` | 扁平 JSON：`image_url`、`mask_url` 等 | wrapper 负责格式转换，管线只使用统一内部 DTO |
| 结果格式 | `media_info_list[0].media_data` | `data.mask_url`、`data.results[]` 等 | wrapper 统一归一化为 `resultUrls`、`maskUrl`、`boxes` |

建议新增配置：

```text
AIGC_PROVIDER_API_STYLE=openapi        # openapi | ai-platform
AIGC_AUTH_MODE=query                   # query | header
AIGC_API_HOST=https://openapi.mtlab.meitu.com
AIGC_POLL_ENDPOINT_TEMPLATE=/v2/task/{taskId}
```

落地原则：

- 如果生产环境当前已经跑通现有 `AIGC_AK/AIGC_SK` 签名链路，第一版优先复用现有链路。
- 如果新申请算法返回的是资料 B 形态，则只新增一个 `aiPlatformClient` 或在 `mtlabClient` 内增加 `apiStyle` 分支。
- 管线层只认 `detectSaliency`、`detectLogo`、`detectText`、`expandImage`、`inpaintImage`、`suggestCrop` 这些语义函数，不直接拼 provider endpoint。

## 后端模块拆分

建议把 `backend/server.mjs` 中已经膨胀的 AIGC 逻辑拆出独立模块。第一阶段也可以先在 `server.mjs` 内实现，稳定后再拆分。

```text
backend/
  aigc/
    mtlabClient.mjs
    adImageAnalyzer.mjs
    adImagePlanner.mjs
    adImagePipeline.mjs
    adImageQa.mjs
    maskUtils.mjs
```

模块职责：

- `mtlabClient.mjs`：统一调用美图 OpenAPI，处理签名、同步/异步请求、轮询、错误归一化。
- `adImageAnalyzer.mjs`：并行调用显著性检测、Logo 分割、文字检测，输出结构化分析结果。
- `adImagePlanner.mjs`：根据目标尺寸、源图比例、安全区和分析结果，决定适配策略。
- `adImagePipeline.mjs`：编排完整管线，调用扩图、改图、构图和后处理。
- `adImageQa.mjs`：检查主体、文字、Logo 是否保留，是否落在安全区。
- `maskUtils.mjs`：合并主体/文字/Logo mask，生成保护区、重绘区、裁剪约束。

## 统一算法 Client

6 个接口统一封装成如下形式：

```ts
type MtlabMedia = {
  media_data: string;
  media_extra?: Record<string, unknown>;
  media_profiles: {
    media_data_type: "url" | "base64" | "png" | "jpg";
  };
};

type MtlabRequest = {
  endpoint: string;
  method?: "GET" | "POST";
  async: boolean;
  payload: Record<string, unknown>;
  apiStyle?: "openapi" | "ai-platform";
};

type MtlabResult = {
  endpoint: string;
  taskId?: string;
  errorCode: number;
  resultUrls: string[];
  maskUrl?: string;
  cropUrl?: string;
  boxes?: Box[];
  parameter?: Record<string, unknown>;
  raw: unknown;
};
```

Client 方法：

```ts
submitSync(request: MtlabRequest): Promise<MtlabResult>
submitAsync(request: MtlabRequest): Promise<{ taskId: string; raw: unknown }>
pollResult(taskId: string, options?: PollOptions): Promise<MtlabResult>
run(request: MtlabRequest): Promise<MtlabResult>
```

注意事项：

- 异步接口返回 `msg_id` 或 `task_id` 后必须轮询结果，内部统一命名为 `taskId`。
- 异步结果只保留有限时间，后端拿到结果后要立刻持久化到 `/static`。
- 失败时统一抛出包含 `algorithmId`、`endpoint`、`taskId`、`providerCode`、`providerMessage` 的错误。
- 结果图片 URL 应通过已有 `persistAigcResult(...)` 下载并保存，避免前端依赖临时远端 URL。

## 6 个算法封装

### Endpoint 映射

| 语义函数 | OpenAPI 形态 | AI Platform 形态 | 同步/异步 |
|----------|--------------|------------------|-----------|
| `detectSaliency` | `/v1/sod` 或 `/v1/sod_2c_async` | `/v1/vision/saliency/saliency_segmentation` | OpenAPI 可同步/异步；AI Platform v1 同步 |
| `detectLogo` | `/v1/logo_seg_async` | `/v1/vision/logo/logo_segmentation` | OpenAPI 异步；AI Platform v1 同步 |
| `detectText` | `/v1/textdetect_img_async` | `/v1/vision/ocr/text_detection` | OpenAPI 异步；AI Platform v1 同步 |
| `expandImageV4` | `/v1/mtimage_expand_v4_async` | `/v2/ai_ext/outpainting` | 异步 |
| `manipulateImage` | `/v1/image_manipulation_fl_async` | `/v2/ai_ext/inpainting` | 异步 |
| `suggestCropping` | `/v1/image_cropping_async` | `/v2/ai_ext/image_cropping_async` | 异步 |

实现时每个 wrapper 应返回同一份内部结构。比如 `detectLogo` 不管底层返回 `parameter.has_target` 还是 `data.logo_regions`，都统一输出 `hasTarget`、`maskUrl`、`boxes`。

### 1. 显著性检测 `/sod`

用途：识别主体物、人像或商品，并返回主体 bbox 和 mask。

封装函数：

```ts
detectSaliency(imageUrl): Promise<{
  exists: boolean;
  kind?: 0 | 1 | 2;
  box?: Box;
  maskUrl?: string;
  cutoutUrl?: string;
}>
```

请求参数：

```json
{
  "openapi": {
    "media_info_list": [
      {
        "media_data": "https://your-image-url.com/ad.jpg",
        "media_profiles": { "media_data_type": "url" }
      }
    ],
    "parameter": {
      "rsp_media_type": "url",
      "nMask": true,
      "nbox": true,
      "model_type": 1
    }
  },
  "ai-platform": {
    "image_url": "https://your-image-url.com/ad.jpg",
    "return_mask": true,
    "return_crop": true,
    "return_binary": false
  }
}
```

输出字段映射：

- `parameter.exist_salient` -> `exists`
- `parameter.Kind` -> `kind`
- `parameter.top_x/top_y/bottom_x/bottom_y` -> `box`
- `media_info_list[0].media_data` -> `maskUrl` 或 `cutoutUrl`

### 2. Logo 分割 `/logo_seg`

用途：检测 Logo 区域，生成 Logo mask。管线默认使用 `inpaint=false`，只检测不消除。

封装函数：

```ts
detectLogo(imageUrl): Promise<{
  hasTarget: boolean;
  maskUrl?: string;
  boxes?: Box[];
}>
```

请求参数：

```json
{
  "openapi": {
    "media_info_list": [
      {
        "media_data": "https://your-image-url.com/ad.jpg",
        "media_profiles": { "media_data_type": "url" }
      }
    ],
    "parameter": {
      "inpaint": false,
      "requester": "design_studio",
      "task": "logo_seg",
      "userboxes": []
    }
  },
  "ai-platform": {
    "image_url": "https://your-image-url.com/ad.jpg",
    "task": "logo_seg",
    "inpaint": false,
    "return_mask": true
  }
}
```

输出字段映射：

- `parameter.has_target` -> `hasTarget`
- `media_info_list[0].media_data` -> `maskUrl`

### 3. 文字检测 `/textdetect`

用途：检测图片中文字区域，生成文字 mask。用于保护文案、slogan、按钮文字等。

封装函数：

```ts
detectText(imageUrl, userboxes?): Promise<{
  hasText: boolean;
  maskUrl?: string;
  boxes?: Box[];
}>
```

请求参数：

```json
{
  "openapi": {
    "media_info_list": [
      {
        "media_data": "https://your-image-url.com/ad.jpg",
        "media_profiles": { "media_data_type": "url" }
      }
    ],
    "parameter": {
      "rsp_media_type": "url"
    }
  },
  "ai-platform": {
    "image_url": "https://your-image-url.com/ad.jpg",
    "return_polygon": true,
    "return_text": true
  }
}
```

如果前端或模板提供候选区域，可增加 `userboxes`。

### 4. AI 扩图 `/expand_v4`

用途：对背景做自然扩展。优先用于比例差异中等，且关键元素可以保留在原图中心区域的场景。

封装函数：

```ts
expandImageV4(input): Promise<{
  candidates: Array<{ url: string; seed?: number }>;
}>
```

推荐两种模式：

- `mode=1 + ratio`：适合按目标比例快速扩图。
- `free_expand_ratio`：适合根据主体位置精确控制四边扩展量。

管线默认优先使用 `free_expand_ratio`，因为广告图要保护主体、文案和 Logo 的安全边距。

AI Platform 形态若只支持 `position=center/top/bottom/left/right`，则第一版以 `position=center` 投递，后处理再用保护区裁剪；如果新申请的扩图接口支持自由四边扩展，则优先使用自由扩展。

### 5. AI 改图 `/manipulation`

用途：局部重绘或消除。管线中主要用于修补扩图边缘、重绘背景空洞，以及在重排策略里补全被移动元素后的背景。

封装函数：

```ts
manipulateImage(input): Promise<{
  candidates: Array<{ url: string }>;
}>
```

输入需要两张图：

- `media_info_list[0]`：原图或局部 crop。
- `media_info_list[1]`：需要重绘/消除区域的 mask。

默认不用于修改主体、文案、Logo、slogan 区域；这些区域应进入保护 mask。

AI Platform 形态为扁平字段：

```json
{
  "image_url": "https://your-cdn.com/ad_image.jpg",
  "mask_url": "https://your-cdn.com/paint-mask.png",
  "prompt": "clean natural background",
  "negative_prompt": "distorted text, changed logo, artifacts",
  "strength": 0.75,
  "num_images": 1,
  "quality": "high"
}
```

### 6. AI 构图 `/cropping`

用途：对扩图后的大画布做构图分析，输出推荐裁剪结果。不能单独信任，需要结合主体、文字、Logo 坐标做二次校验。

封装函数：

```ts
suggestCropping(imageUrl): Promise<{
  url?: string;
  cropBox?: Box;
  raw: unknown;
}>
```

二次校验规则：

- 裁剪区域必须包含主体 bbox。
- 裁剪区域必须包含文字和 Logo bbox。
- 关键元素到边缘至少保留模板安全边距。

## 统一前端接口

### Request

```ts
type AdaptImageRequest = {
  imageUrl: string;
  targetWidth: number;
  targetHeight: number;
  templateId?: string;
  templateName?: string;
  app?: string;
  safeArea?: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    unit: "px" | "ratio";
  };
  allowRelayout?: boolean;
  generateNum?: number;
  prompt?: string;
};
```

默认安全区建议：

- 普通广告位：四边 8%。
- 开屏、焦点视窗：四边 10% 到 15%。
- 有系统遮罩或底部文案的模板：读取模板遮罩/裁剪层，换算成不可占用区域。

### Response

```ts
type AdaptImageResponse = {
  ok: true;
  resultUrl: string;
  strategy: "direct" | "crop" | "outpaint" | "relayout" | "fallback";
  target: { width: number; height: number };
  analysis: {
    source: { width: number; height: number };
    subject?: { exists: boolean; kind?: number; box?: Box; maskUrl?: string };
    logo?: { hasTarget: boolean; maskUrl?: string; boxes?: Box[] };
    text?: { hasText: boolean; maskUrl?: string; boxes?: Box[] };
    protectedMaskUrl?: string;
  };
  plan: {
    sourceRatio: number;
    targetRatio: number;
    ratioDelta: number;
    expandRatio?: { top: number; bottom: number; left: number; right: number };
    cropBox?: Box;
    reasons: string[];
  };
  qa: {
    passed: boolean;
    subjectPreserved: boolean;
    textPreserved: boolean;
    logoPreserved: boolean;
    safeAreaPassed: boolean;
    warnings: string[];
  };
  candidates?: Array<{
    url: string;
    score: number;
    qa: AdaptImageResponse["qa"];
  }>;
};
```

错误返回：

```ts
type AdaptImageError = {
  ok: false;
  error: string;
  details?: string;
  stage?: "analysis" | "planning" | "generation" | "qa" | "postprocess";
  provider?: {
    endpoint?: string;
    msgId?: string;
    code?: string | number;
    message?: string;
  };
};
```

## 适配策略

### direct

条件：

- 源图尺寸与目标尺寸完全一致。
- 或源图比例与目标比例非常接近，且缩放后关键区域全部在安全区内。

处理：

- 不调用生成模型。
- 只做压缩、模板合成和导出。

### crop

条件：

- 比例差异小于约 8% 到 12%。
- 主体、文字、Logo 能全部落在裁剪框内。

处理：

- 结合显著性 bbox、文字 mask、Logo mask 计算保护区。
- 生成满足目标比例的裁剪框。
- 如 `/cropping` 推荐结果通过保护区校验，可采用；否则用本地确定性裁剪。

### outpaint

条件：

- 比例差异中等。
- 关键内容不适合裁剪，但保持原图构图仍可成立。

处理：

- 根据保护区位置计算 `free_expand_ratio`。
- 调用 `/expand_v4` 生成多张候选图。
- 对每张候选图执行构图和 QA。
- 选择主体完整、文字完整、Logo 完整且安全区通过的最高分结果。

### relayout

条件：

- 竖图转横图、横图转竖图等比例跨度大。
- 单纯裁剪或扩图会导致主体太小、边缘空洞、文字/Logo 不安全。

处理建议：

1. 使用主体、文字、Logo mask 生成保护层。
2. 生成或扩展目标比例背景。
3. 对主体层、文字层、Logo 层生成目标布局计划。
4. 使用确定性合成把元素放入目标画布。
5. 用 `/manipulation` 修补背景空洞或边缘不自然区域。

备注：如果当前算法只返回 mask、不返回可编辑分层素材，第一阶段 relayout 可以先降级成“保护区扩图 + 构图裁剪”，后续再补真正分层重排。

## 管线流程

```text
upload/static url
  -> normalize image
  -> analysis:
       sod + logo_seg + textdetect 并行
  -> build protected mask
  -> plan strategy
  -> generate:
       direct/crop/outpaint/relayout
  -> postprocess:
       resize to exact target
       compress
       persist result
  -> qa:
       subject/text/logo/safe-area checks
  -> return best candidate
```

建议伪代码：

```js
app.post("/api/aigc/adapt-image", async (req, res) => {
  try {
    const input = validateAdaptImageRequest(req.body);
    const normalized = await normalizeImageForAigc(input.imageUrl);

    const analysis = await analyzeAdImage(normalized.publicUrl);
    const protectedMask = await buildProtectedMask(analysis);
    const plan = await planAdImageAdaptation({
      source: normalized,
      target: input,
      analysis,
      protectedMask
    });

    const candidates = await executeAdaptationPlan(plan);
    const scored = await scoreCandidates(candidates, {
      analysis,
      target: input,
      safeArea: input.safeArea
    });

    const best = pickBestCandidate(scored);
    if (!best.qa.passed && plan.canRetry) {
      const retryPlan = createRetryPlan(plan, best.qa);
      const retryCandidates = await executeAdaptationPlan(retryPlan);
      scored.push(...await scoreCandidates(retryCandidates, { analysis, target: input }));
    }

    const final = pickBestCandidate(scored);
    res.json(toAdaptImageResponse(final));
  } catch (err) {
    res.status(500).json(toAdaptImageError(err));
  }
});
```

## QA 规则

第一阶段已经在 Node 后端实现基础深度质检：尺寸检查、几何安全区检查、OCR 字符召回、Logo 区域感知哈希相似度。它仍然不是专用品牌识别模型，但比只靠 prompt 更可控。

必检项：

- 主体 bbox 在最终画布内。
- 主体 bbox 与安全区相交比例达到阈值，例如 95%。
- 文字 mask 在最终画布内。
- Logo mask 在最终画布内。
- 关键元素距离边缘满足安全边距。
- 最终图精确等于目标尺寸。
- 最终图文件大小满足模板要求。

已实现增强：

- 对最终图再次调用 `textdetect`，按字符集合召回率检查文案是否保留。
- 对 Logo mask 区域做简化感知哈希相似度检查，发现明显变形或丢失时给出 warning。
- 三路 mask 会落盘，并用像素级并集合并为 `protectedMaskUrl` 和 `editableMaskUrl`。

仍待增强：

- 对最终图再次调用 `sod`，确认主体仍存在且尺寸合理。
- 使用专用 Logo 识别/品牌识别模型替代当前简化感知哈希。

评分建议：

```text
score = 100
  - 主体越界扣 40
  - 文字越界扣 25
  - Logo 越界扣 25
  - 安全边距不足扣 10 到 30
  - 构图过空或主体过小扣 10 到 20
  - 扩图接缝明显扣 10 到 20
```

## 降级策略

- `sod` 失败：使用整图中心区域作为主体保护区。
- `logo_seg` 失败：跳过 Logo 检测，但保留文字检测结果。
- `textdetect` 失败：跳过文字 mask，但提高安全边距。
- `expand_v4` 失败：回退本地 smart crop，并向前端返回 warning。
- `cropping` 失败：使用本地保护区裁剪。
- QA 失败：自动切换候选图；仍失败则返回最佳候选并标记 `qa.passed=false`。

## 与现有接口的迁移

第一阶段：

- 新增 `/api/aigc/adapt-image`。
- 保留 `/api/aigc/smart-crop`。
- 前端 `smartCropImageWithAigc` 可先增加可选字段 `useAdPipeline`，灰度切换。

第二阶段：

- 将 `smartCropImageWithAigc` 默认改为调用 `/api/aigc/adapt-image`。
- Preview 卡片展示 `strategy`、`qa.warnings`。
- 管理后台增加开关：启用广告图适配管线、生成候选数量、失败时是否允许降级。

第三阶段：

- 将模板不可占用区域、安全区、遮罩约束配置化。
- 为开屏、焦点视窗、弹窗、icon/banner 等模板建立独立策略参数。

## 配置项

建议新增环境变量：

```text
AIGC_ADAPT_PIPELINE_ENABLED=true
AIGC_ADAPT_GENERATE_NUM=3
AIGC_ADAPT_MAX_RETRIES=1
AIGC_ADAPT_SAFE_MARGIN_RATIO=0.1
AIGC_ADAPT_STRICT_QA=false
```

复用现有变量：

```text
AIGC_AK=
AIGC_SK=
AIGC_API_HOST=https://openapi-ali.meitu.com
AIGC_PUBLIC_BASE_URL=
AIGC_MAX_POLLS=120
AIGC_POLL_INTERVAL_MS=2000
```

## 安全与隐私

- 不要把 API Key 写入 `backend/data/settings.json` 或提交到仓库。
- 所有密钥使用 `.env.local`、服务器环境变量或部署平台 Secret。
- 后端日志不要打印完整 `api_key`、`api_secret`、远端签名。
- 远端临时结果保存到本地后，前端只使用本地 `/static` URL。

## 实施顺序

1. 抽出或复用现有 AIGC 请求工具，补齐通用异步 `msg_id` 轮询。
2. 新增 6 个算法 wrapper。
3. 新增 `analyzeAdImage`，并行跑 `sod/logo_seg/textdetect`。
4. 新增 `planAdImageAdaptation`，输出 `direct/crop/outpaint/relayout`。
5. 新增 `/api/aigc/adapt-image`。
6. 前端服务层新增 `adaptImageWithAigc`。
7. 灰度替换 `smartCropImageWithAigc` 调用。
8. 加入 QA 结果展示和失败 warning。
