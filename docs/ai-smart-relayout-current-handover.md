# AI 智能排版当前交接记录

更新时间：2026-06-14

适用范围：标准素材看板的 `/api/aigc/adapt-image`，不要混到创新形式看板。

## 当前版本状态

- 上一个已同步版本：`v1.0.73`
- 当前本地待同步提交：`32560fc Use versioned poster algorithm names`
- 建议下一版本：`v1.0.74`
- GitHub remote：`origin`
- 美图谷仓 remote：`meitu`

## 当前问题

目标是让标准素材看板的 AI 智能排版真正走分层重排，而不是降级到 inpaint + expand + crop。

最近线上错误演进如下：

1. 早期错误：
   `poster_edit_layer_async: Forbidden`

2. 绑定算法权限后：
   `api/v1/sdk/status(task_id): Task not found`

3. `v1.0.72` 后：
   已经优先使用 `openapi-poll/query_result?msg_id=...`，但仍报：
   `openapi-poll/query_result(msg_id)@openapi.mtlab.meitu.com -> no route found`

4. `v1.0.73` 后：
   将 poster 分层提交切到 MTLab `/v1/algorithm/submit`，但报：
   `openapi-submit/poster_edit_layer_async: no route found`

## 当前判断

前面已经排除了一部分问题：

- 不是单纯 `task_id` / `msg_id` 参数名问题。
- 不是单纯轮询顺序问题。
- `openapi-poll/query_result` 需要和谷仓统一提交口径配套使用。
- `poster_edit_layer_async` 在谷仓日志里显示的任务名是 `/v1/poster_edit_layer_async`，不是裸的 `poster_edit_layer_async`。

因此当前最新修复是：

```text
api_name: /v1/poster_edit_layer_async
api_name: /v1/poster_trans_design_async
```

而不是：

```text
api_name: poster_edit_layer_async
api_name: poster_trans_design_async
```

## 已落地的关键改动

### v1.0.72

提交：`23db546 Prioritize MTLab polling for poster relayout`

- `openapi-poll/query_result` 参数改为 `msg_id`
- 轮询候选改为 MTLab `openapi-poll/query_result(msg_id)` 优先
- `AIGC_MTLAB_API_HOST` 默认值改为 `https://openapi.mtlab.meitu.com`
- `.env.example` 新增 `AIGC_MTLAB_API_HOST`
- `textdetect_img` 候选改为 MTLab 优先，ali 兜底

### v1.0.73

提交：`5a21bc7 Submit poster relayout through MTLab algorithm queue`

- `poster_edit_layer_async` 改为通过 MTLab `/v1/algorithm/submit` 提交
- `poster_trans_design_async` 改为通过 MTLab `/v1/algorithm/submit` 提交
- 提交 body 保留原始结构，不再展平 `parameter`
- 增加日志：
  `[OpenAPI Submit] algorithm submit`

### 待发布为 v1.0.74

提交：`32560fc Use versioned poster algorithm names`

- 统一提交时支持覆盖 `api_name`
- poster 分层提交使用：
  `/v1/poster_edit_layer_async`
- poster 设计识别提交使用：
  `/v1/poster_trans_design_async`

## 关键代码位置

主要文件：

- `backend/server.mjs`

重点函数：

- `getAigcConfig`
- `submitOpenapiV3Async`
- `pollOpenapiV3Async`
- `splitPosterLayersForAdapt`
- `analyzePosterDesignForAdapt`
- `executeLayeredRelayoutForAdapt`

前端显示智能排版状态：

- `App.tsx`
- `describeAdaptImageResult`

## 下一台电脑继续处理时怎么验证

先拉最新：

```bash
git pull origin master
git fetch --tags
```

如果要同步美图谷仓：

```bash
git remote -v
git pull meitu master
```

验证当前版本：

```bash
git log --oneline -5
git tag --points-at HEAD
```

应该能看到最新提交包含：

```text
32560fc Use versioned poster algorithm names
```

以及 tag：

```text
v1.0.74
```

## 线上验证时看这些日志

在 Elastic 里搜：

```text
"[OpenAPI Submit] algorithm submit"
```

期望看到：

```text
apiName: "/v1/poster_edit_layer_async"
url: "https://openapi.mtlab.meitu.com/v1/algorithm/submit"
```

然后搜：

```text
"openapi-poll/query_result"
```

期望看到：

```text
https://openapi.mtlab.meitu.com/openapi-poll/query_result?...&msg_id=...
```

如果仍失败，优先判断是哪一类：

1. 提交阶段失败：
   `openapi-submit/...: no route found`
   说明 `/v1/algorithm/submit` 的 `api_name` 或权限仍不对。

2. 轮询阶段失败：
   `openapi-poll/query_result... no route found`
   说明提交没有进入这个 poll 系统，或 poll host/path 仍不匹配。

3. 结果解析失败：
   `poster layer split did not return usable foreground/background layers`
   说明算法有结果，但 `normalizePosterLayerResult` 没解析到前景/背景。

4. 业务降级：
   `layered relayout failed and fell back to inpaint + expand + crop`
   说明分层重排没有完成，后端进入 fallback。

## 当前仍可能存在的不确定点

- `/v1/algorithm/submit` 是否对当前 AK/SK 开通了 `/v1/poster_edit_layer_async` 权限。
- 谷仓统一提交是否要求 `api_name` 带 `/v1/`。当前最新修复已经改为带 `/v1/`。
- `poster_trans_design_async` 返回的 JSON 是否稳定落在 `media_info_list` 或 `details.mtlab_callback_response`。
- `textdetect_img` 仍可能不可用，但已有 fallback，不是当前 P0。

## 如果 v1.0.74 仍然报 no route found

需要向算法/平台同学确认这两个问题：

1. `/v1/algorithm/submit` 的 `api_name` 应该传哪一种：

```text
/v1/poster_edit_layer_async
poster_edit_layer_async
```

2. `poster_edit_layer_async` 是否支持谷仓统一提交；如果不支持，需要平台提供可用的异步查询接口，或配置 `biz_repost_url` 回调。

回调线索：

历史日志里出现过：

```text
bizRepostUrl is empty
```

说明平台可能支持回调。当前项目还没有 `/api/aigc/openapi-callback` 之类的回调接收接口。
