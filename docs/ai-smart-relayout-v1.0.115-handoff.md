# AI Smart Relayout Handoff - v1.0.115

更新时间：2026-06-18

当前线上/仓库版本：`v1.0.115`

## 当前状态

标准素材看板的 AI 智能排版已经进入“可控分层排版”方向。

目前主体物和背景效果相对稳定，当前主要问题集中在文字和 Logo：

- 原图文字/Logo 有时被拆成多个碎框。
- slogan、按钮文案、品牌名、Logo 容易被分开排版。
- 文字/Logo 可能显示不完整或位置不够美观。

`v1.0.115` 已经开始解决这个问题：把文字、Logo、slogan、按钮文案识别为一个“信息组”，尽量作为整体抠出和移动。

## 这次修改

提交：

- GitHub commit：`6421d3b Group poster text and logo relayout layers`
- GitHub tag：`v1.0.115`
- 美图谷仓 tag：`v1.0.115`

关键文件：

- `backend/server.mjs`

主要改动：

1. 扩展 `poster_trans_design_async` 返回字段解析
   - 增加了更多可能的图层类型字段：
     - `layerType`
     - `element_type`
     - `elementType`
     - `class`
     - `tag`
     - `attr`
     - `attribute`
     - `attributes`
     - `value`
   - 增加了更多可能的框字段：
     - `bounding_box`
     - `boundingBox`
     - `text_box`
     - `textBox`
     - `bound`
     - `coords`
     - `boxCoord`
     - `points`
     - `polygon`

2. 新增“信息组”逻辑
   - 新增函数：
     - `absoluteBoxGap`
     - `unionAbsoluteBoxesForAdapt`
     - `areInfoZonesRelatedForAdapt`
     - `buildInfoGroupZonesForAdapt`
   - 如果 Logo、品牌名、slogan、按钮文案靠得比较近，会合并成 `type: "info"`。

3. 排版优先使用信息组
   - `buildRelayoutZonesForAdapt` 会把信息组加入排版候选。
   - 如果已经选中信息组，会跳过单独的 logo/text，避免重复贴一遍。
   - `planZonePlacementForAdapt` 新增了 `info` 类型排版规则。

4. 背景清理也参考海报文字属性识别结果
   - `inpaintTextLogoBackgroundForRelayout` 增加 `designAnalysis` 参数。
   - 清理旧文字/Logo 位置时，会把 `poster_trans_design_async` 识别到的文字/Logo 框也纳入。

## 当前算法链路

标准素材看板智能排版目前主要用这些能力：

1. 主体检测
   - `sod`
   - 用于判断主体区域，避免误伤主体。

2. Logo 检测
   - 当前代码仍是 `logo_seg`
   - 之前讨论过可升级到 `logo_seg_async`，但 `v1.0.115` 还没有切换。

3. 文本检测
   - `textdetect_img`
   - 用于 OCR/文字框兜底。

4. 海报文字/图层属性识别
   - `poster_trans_design_async`
   - 从 `v1.0.115` 开始，作为文字/Logo 信息组的重要依据。

5. 海报分层
   - `poster_edit_layer_async`
   - 根据信息组或单个文字/Logo 框，抠出原始像素图层。

6. 背景延展
   - `image_extension_async`
   - 当前主体和背景效果主要依赖这个链路。

7. 局部修复
   - `image_manipulation_fl_async`
   - 用于擦掉原文字/Logo 位置。

## 暂未接入但建议后续验证的接口

### 1. AI消除-水印-V2

接口：

```text
/v1/eraser_watermark_v2_async
```

建议用途：

- 只用于指定框擦除文字/logo 旧位置。
- 不建议整图自动擦除，避免误删产品包装上的品牌字。

适合替换当前 `image_manipulation_fl_async` 的一部分背景清理逻辑。

### 2. LOGO分割 async

接口：

```text
/v1/logo_seg_async
```

建议用途：

- `inpaint: false`：只检测 Logo。
- `task: inpaint` 或 `inpaint: true`：按指定区域擦除 Logo。

注意：

- 不建议直接全自动擦整图 Logo。
- 应该由我们先判断哪些 Logo 属于需要移动的信息层，再指定区域处理。

## 下一步建议

优先继续验证 `v1.0.115` 的效果：

1. 用那张 LV 横图转 1440x2340 测一次。
2. 看返回结果里的 `layeredRelayout.layers.items`：
   - 是否出现 `type: "info"`。
   - `members` 里是否包含 logo/text。
3. 如果没有出现 `info`：
   - 看 `poster_trans_design_async` 是否返回有效 layers。
   - 看 `designAnalysis.layerCount` 是否大于 0。
4. 如果出现 `info` 但文字/logo 仍不完整：
   - 增大 `buildZoneLayerSplitBoxForAdapt` 中 `info` 的 padding。
   - 当前值：`0.035`。
5. 如果文字/logo 整体太大或太小：
   - 调整 `planZonePlacementForAdapt` 里的 `zone.type === "info"` 分支。
   - 横转竖重点参数：
     - `maxWidth = targetWidth * 0.88`
     - `maxHeight = targetHeight * 0.24`
     - `centerY = targetHeight * 0.19`

## 换电脑继续操作

在另一台电脑上：

```bash
git clone https://github.com/zhouyue19920607-hello/standardized-Ai-Adplatform.git
cd standardized-Ai-Adplatform
git checkout master
git pull
git checkout v1.0.115
npm install
npm run build
```

如果要继续开发，不建议直接在 tag 上改，建议：

```bash
git checkout master
git pull
git checkout -b codex/continue-smart-relayout
```

然后继续从 `backend/server.mjs` 里的这些函数开始：

- `analyzePosterDesignForAdapt`
- `buildRelayoutZonesForAdapt`
- `buildInfoGroupZonesForAdapt`
- `buildZoneLayerSplitBoxForAdapt`
- `planZonePlacementForAdapt`
- `executeLayeredRelayoutForAdapt`

## 验证命令

每次改完至少跑：

```bash
node --check backend/server.mjs
npm run build
```

## 当前判断

不要回到 Agent 方案。

当前比较稳的路线是：

1. 背景和主体继续使用现有可控链路。
2. 文字/Logo 不让 AI 生成。
3. 通过 `poster_trans_design_async` + `poster_edit_layer_async` 把原图文字/Logo 当原始图层搬运。
4. 后端自己做信息组排版。
5. 后续再把旧位置擦除升级为 `eraser_watermark_v2_async` 指定框模式。

