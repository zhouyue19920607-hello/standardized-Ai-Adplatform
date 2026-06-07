# 美图谷仓环境变量配置说明

用于「标准化素材看板 / 创新形式标准素材看板」调用美图 AIGC API。

## 需要你填写的位置

请在美图谷仓项目的「后端运行环境 / 环境变量」里新增或确认以下变量。

不要填写到前端页面里，也不要提交到 GitHub。

```bash
AIGC_AK=
AIGC_SK=
AIGC_BIZ=ai-saap
AIGC_API_HOST=https://openapi-ali.meitu.com
AIGC_AUTH_MODE=query
AIGC_PUBLIC_BASE_URL=https://ai-saap.cloud.meitu-int.com
AIGC_MAX_POLLS=120
AIGC_POLL_INTERVAL_MS=2000
```

## 你需要自己补的内容

### AIGC_AK

填写你在美图开放平台申请到的正式环境 AK。

```bash
AIGC_AK=在这里填写你的 AK
```

### AIGC_SK

填写你在美图开放平台申请到的正式环境 SK。

```bash
AIGC_SK=在这里填写你的 SK
```

## 固定项不要改

```bash
AIGC_BIZ=ai-saap
AIGC_API_HOST=https://openapi-ali.meitu.com
AIGC_AUTH_MODE=query
AIGC_PUBLIC_BASE_URL=https://ai-saap.cloud.meitu-int.com
AIGC_MAX_POLLS=120
AIGC_POLL_INTERVAL_MS=2000
```

## 配完后必须做

1. 保存谷仓环境变量。
2. 重新部署或重启后端服务。
3. 打开线上站点测试标准化素材看板 AI 适配。

## 当前报错对应原因

如果页面弹窗显示：

```txt
后端缺少 AIGC_AK / AIGC_SK 环境变量
```

说明谷仓后端没有读到 `AIGC_AK` 或 `AIGC_SK`。

优先检查：

- 变量名是否完全一致，大小写不能错。
- AK/SK 是否填在后端运行环境，不是前端环境。
- 填完后是否重新部署或重启服务。

## 其他常见错误

### 素材公网 URL 错误

```txt
AI 图生图/适配需要美图可访问的素材公网 URL
```

检查：

```bash
AIGC_PUBLIC_BASE_URL=https://ai-saap.cloud.meitu-int.com
```

这个域名必须能被美图 AIGC 服务访问到。

### 正式环境接口错误

如果出现鉴权、签名、权限类错误，检查：

```bash
AIGC_API_HOST=https://openapi-ali.meitu.com
AIGC_AUTH_MODE=query
```

同时确认 AK/SK 是正式环境下申请的，并且对应算法权限已开通。

如果使用测试环境 AK/SK，必须把接口域名改为测试环境，例如：

```bash
AIGC_API_HOST=https://openapi-pre.mtlab.meitu.com
AIGC_AUTH_MODE=query
```

`90002 / GATEWAY_AUTHORIZED_ERROR` 通常表示请求在网关层鉴权失败，优先检查 AK/SK 所属环境和 `AIGC_API_HOST` 是否匹配。

`60477` 通常表示鉴权已通过，但算法层拒绝任务。优先用安全提示词和标准比例验证，例如：

```txt
A cat walking on the grass, sunny day, high quality
```

并将比例先固定为 `16:9` 测试。

视频扩展接口会把本站上传的 `/static` 视频转成 base64 传给美图，避免美图后端下载公网 URL 失败导致视频对象为空。为控制请求体大小，base64 输入目前限制原视频不超过 10MB。

文生视频默认先调用 MOKI 接口：

```txt
/v1/t2v_magic_async
```

如果该接口因为队列、模型节点或算法层错误失败，后端会自动降级到 LTX 备用接口：

```txt
/v1/ltx_2_async
```

LTX 文生视频会在 `parameter` 中传入 `task_type: "t2v"`。接口返回里 `fallbackUsed: true` 表示本次实际使用了 LTX。
