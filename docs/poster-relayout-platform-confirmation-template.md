# 标准素材看板 AI 智能排版接口确认模板

适用范围：标准素材看板的 `/api/aigc/adapt-image` 智能排版链路  
使用方式：把下面整段直接发给平台同学 / 算法同学即可

---

## 一、可直接转发的消息模板

大家好，这边在联调「标准素材看板」的 AI 智能排版能力，当前链路已经接入到后端，但实际执行时仍会自动降级到 `inpaint + expand + crop`，没有进入真正的分层重排。

当前现象如下：

1. 页面提示：

```text
AI智能排版已降级：openapi-submit/poster_edit_layer_async: no route found
text 检测不可用：openapi-sync/textdetect_img: no route found
layered relayout failed and fell back to inpaint + expand + crop: openapi-submit/poster_edit_layer_async: no route found
```

2. 业务表现：

- 结果图能生成，但只是扩图/补背景/裁切
- 没有做真正的主体、文案、Logo 分层重排
- 有时还会提示安全区风险：

```text
some protected regions are too close to the output safe-area edge
```

3. 当前我们后端的调用方式是：

- `poster_edit_layer_async`：
  通过 `https://openapi.mtlab.meitu.com/v1/algorithm/submit` 提交
- `poster_trans_design_async`：
  通过 `https://openapi.mtlab.meitu.com/v1/algorithm/submit` 提交
- `textdetect_img`：
  当前按同步接口候选路由依次尝试

我们现在最需要确认下面 4 个问题：

### 问题 1

`poster_edit_layer_async` 是否支持通过统一提交接口：

```text
POST /v1/algorithm/submit
```

来调用？

### 问题 2

如果支持统一提交，`api_name` 正确值到底应该是哪一个：

```text
/v1/poster_edit_layer_async
```

还是：

```text
poster_edit_layer_async
```

`poster_trans_design_async` 也请同步确认：

```text
/v1/poster_trans_design_async
```

还是：

```text
poster_trans_design_async
```

### 问题 3

如果 `poster_edit_layer_async` 不支持统一提交，那它在当前环境下的正确接入方式是什么：

- 直调地址是什么
- 异步查询地址是什么
- 是用 `msg_id` 还是 `task_id`
- 是否必须配置 `biz_repost_url` 回调

### 问题 4

`textdetect_img` 在当前环境下可用的真实路由是什么？

我们目前尝试过这些候选：

```text
/v1/textdetect_img
/v1/textdetect
/v1/vision/ocr/text_detection
```

但页面仍出现：

```text
openapi-sync/textdetect_img: no route found
```

烦请帮忙确认当前 AK/SK 对应环境里，OCR 文本检测应该走哪条正式路由。

---

## 二、我们当前代码里的实际接入方式

当前项目后端文件：

`/Users/meitu/Documents/New project/standardized-Ai-Adplatform/backend/server.mjs`

当前代码逻辑：

1. 智能排版优先走 `relayout`
2. `relayout` 内会调用：
   - `splitPosterLayersForAdapt`
   - `analyzePosterDesignForAdapt`
   - `executeLayeredRelayoutForAdapt`
3. 如果 `poster_edit_layer_async` / `poster_trans_design_async` 不通，就会自动降级到：

```text
inpaint + expand + crop
```

所以现在页面里看到“有 AI 生成结果，但没有智能排版”，本质上是接口没打通，不是前端逻辑没触发。

---

## 三、建议平台同学帮忙一起看这几条日志

如果方便，请一起确认这些日志关键字：

### 1. 提交阶段

搜索：

```text
[OpenAPI Submit] algorithm submit
```

重点确认：

- `apiName`
- 提交 host
- 返回是否是 `no route found`
- 返回里有没有 `msg_id` / `task_id`

### 2. 页面降级提示

搜索：

```text
poster_edit_layer_async
textdetect_img
layered relayout failed
```

### 3. 谷仓 / 算法侧任务记录

确认：

- 是否真的有接收到 `/v1/poster_edit_layer_async`
- 任务有没有落到统一队列
- 是否因为权限 / 路由 / 提交协议不匹配而直接拒绝

---

## 四、我们希望最终达到的能力

目标不是普通扩图，而是：

1. 原图尺寸不匹配时，先识别：
   - 主体
   - 文案
   - Logo
2. 对这些元素做保护
3. 在目标尺寸上重新布局
4. 背景只做补全，不新增无关元素，不生成无关文字
5. 最终结果满足安全区要求

如果当前 `poster_edit_layer_async` 本身不适合做这条链路，也请帮忙推荐同环境下更合适的正式算法接口。

---

## 五、补充说明

当前前端页面已经把降级状态展示出来，所以现在看到：

```text
AI智能排版已降级
```

并不代表页面坏了，而是后端在明确提示：

```text
智能排版接口没打通，已自动回退到普通适配流程
```

---

## 六、拿到回复后，前端/后端这边会怎么改

平台同学一旦确认完以上 4 个问题，我们这边会立即对应调整：

1. 提交地址
2. `api_name`
3. 轮询地址
4. `msg_id` / `task_id`
5. 是否需要回调接口
6. `textdetect_img` 的真实路由

确认完这些以后，才能继续验证“智能排版是否真正生效”。

---

## 七、内部备注

如果下一次继续接手这个问题，优先同时查看这两份文档：

- [ai-smart-relayout-current-handover.md](/Users/meitu/Documents/New%20project/standardized-Ai-Adplatform/docs/ai-smart-relayout-current-handover.md)
- [poster-relayout-platform-confirmation-template.md](/Users/meitu/Documents/New%20project/standardized-Ai-Adplatform/docs/poster-relayout-platform-confirmation-template.md)

前者是技术交接记录，后者是沟通模板。
