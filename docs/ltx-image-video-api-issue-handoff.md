# LTX image-to-video API issue handoff

Date: 2026-06-14

This document records the current unresolved API-shape issue for creative-board video generation.

## Symptom

- Board: creative format board.
- User action: text-to-video or image-to-video that eventually calls `/v1/ltx_2_async`.
- Algorithm error:

```txt
MTLABSDK - PARAM VALUE ERROR --- extra msg: Exactly 1 image is requied for inference
```

- Algorithm detail usually contains:

```json
{
  "name": "/v1/ltx_2_async",
  "status": 2,
  "error_code": 21104,
  "data": {
    "media_info_list": []
  }
}
```

- Backend log example:

```txt
[AIGC Image To Video] failed: MTLABSDK - PARAM VALUE ERROR --- extra msg: Exactly 1 image is requied for inference
```

## Important Observation

In the AIGC task UI, the input/original image can be visible. That means the app has an image URL before submit.

But the LTX algorithm callback still reports `media_info_list: []`.

So the likely problem is not "no first-frame image exists". The likely problem is request-shape mismatch between:

- ai-saap backend
- `/api/v1/push`
- AIGC gateway
- MTLab SDK adapter for `/v1/ltx_2_async`

## Code Paths

Main file:

```txt
backend/server.mjs
```

Relevant symbols:

```txt
AIGC_TASKS.imageToVideo = "/v1/ltx_2_async"
AIGC_TASKS.textToVideo = "/v1/ltx_2_async"
POST /api/aigc/text-to-video
POST /api/aigc/image-to-video
pushAigcTask
submitAigcTask
```

## Versions Already Pushed

### v1.0.75

- Text-to-video now creates a first-frame image first.
- The first-frame URL is sent to `/v1/ltx_2_async`.
- Prompt no longer contains target size/time wording.
- `ratio` and `duration` are passed as params instead of prompt text.

### v1.0.76

- `pushAigcTask` includes `media_info_list` at the top level of the `/api/v1/push` payload.
- It also keeps `params.media_info_list`.

### v1.0.77

- `pushAigcTask` also includes camelCase `mediaInfoList` at the top level.
- `/api/aigc/image-to-video` resolves local/static images to a URL reachable by Meitu algorithm before submit.

## Current Push Payload Shape

The current `/api/v1/push` payload for media tasks contains:

```txt
task: "/v1/ltx_2_async"
task_type: "mtlab"
biz: config.biz
params: JSON.stringify({ parameter, media_info_list })
rsp_media_type: "url"
media_info_list: normalizedMediaInfoList
mediaInfoList: normalizedMediaInfoList
init_images: [...]
```

If `v1.0.77` is already deployed and the same error still appears, the platform is still not forwarding the image list into the LTX SDK request.

## Questions For API / Platform Owner

Please confirm the exact accepted request body for LTX through `/api/v1/push`:

1. For `/api/v1/push` + `task=/v1/ltx_2_async`, should images be passed as top-level `media_info_list`, top-level `mediaInfoList`, `params.media_info_list`, `init_images`, or another field?
2. Does `/v1/ltx_2_async` require `media_data_type: "url"` only, or does it accept base64 jpg/png?
3. Should LTX bypass `/api/v1/push` and call direct OpenAPI async instead?
4. If direct async is required, what poll route should be used?

Potential direct endpoint:

```txt
POST https://openapi.mtlab.meitu.com/v1/ltx_2_async?api_key=...&api_secret=...
```

Potential direct body:

```json
{
  "parameter": {
    "task_type": "i2v-distilled",
    "prompt": "...",
    "rsp_media_type": "url",
    "lora_id": "i2v-nolora"
  },
  "media_info_list": [
    {
      "media_data": "https://...",
      "media_profiles": {
        "media_data_type": "url"
      },
      "media_extra": {}
    }
  ],
  "extra": {}
}
```

Potential poll routes to confirm:

```txt
GET /api/v1/sdk/status?task_id=...
GET /openapi-poll/query_result?msg_id=...
callback only
```

## Recommended Next Fix

If `v1.0.77` still fails with `media_info_list: []`, add `ltx_2_async` to a direct OpenAPI async path instead of using `/api/v1/push`.

Implementation direction:

1. Add `ltx_2_async` to the direct async handling in `backend/server.mjs`.
2. Reuse `submitOpenapiV3Async` and `pollOpenapiV3Async`.
3. Submit exactly `{ parameter, media_info_list, extra }`.
4. Keep image URLs as reachable URLs. Avoid base64 unless API owner confirms base64 is accepted.
5. Keep prompt about visual content only. Do not put size/time constraints into the prompt.

Product rule:

- Prompt describes content.
- Ratio/duration are API params or final template/display constraints.
- Do not put target size/time wording into video prompt.
