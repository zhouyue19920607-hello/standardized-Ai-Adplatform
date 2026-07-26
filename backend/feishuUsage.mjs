import axios from "axios";
import crypto from "node:crypto";

const FEISHU_API = "https://open.feishu.cn/open-apis";
const DEFAULT_WIKI_TOKEN = "Z3zTwTAFViAZH4klt9NcsqNFngb";
const DEFAULT_TABLE_ID = "tblHi5s5LQVZZ66v";

let tenantTokenCache = null;
let appTokenCache = null;
const sessionQueues = new Map();

const configured = () => Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET);

async function getTenantToken() {
  if (tenantTokenCache && tenantTokenCache.expiresAt > Date.now() + 60_000) {
    return tenantTokenCache.value;
  }
  const response = await axios.post(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    app_id: process.env.FEISHU_APP_ID,
    app_secret: process.env.FEISHU_APP_SECRET,
  }, { timeout: 10_000 });
  if (response.data?.code !== 0 || !response.data?.tenant_access_token) {
    throw new Error(response.data?.msg || "无法获取飞书 tenant_access_token");
  }
  tenantTokenCache = {
    value: response.data.tenant_access_token,
    expiresAt: Date.now() + Number(response.data.expire || 7200) * 1000,
  };
  return tenantTokenCache.value;
}

async function getAppToken() {
  if (appTokenCache) return appTokenCache;
  const tenantToken = await getTenantToken();
  const wikiToken = process.env.FEISHU_USAGE_WIKI_TOKEN || DEFAULT_WIKI_TOKEN;
  const response = await axios.get(`${FEISHU_API}/wiki/v2/spaces/get_node`, {
    params: { token: wikiToken },
    headers: { Authorization: `Bearer ${tenantToken}` },
    timeout: 10_000,
  });
  if (response.data?.code !== 0 || !response.data?.data?.node?.obj_token) {
    throw new Error(response.data?.msg || "无法解析飞书使用记录表");
  }
  appTokenCache = response.data.data.node.obj_token;
  return appTokenCache;
}

const cleanText = (value, max = 1000) => String(value || "").slice(0, max);

const uniqueValues = (values) => [...new Set(values.filter(Boolean))];

const mergeText = (current, incoming, max = 1000) => {
  const values = uniqueValues([
    ...String(current || "").split("、"),
    ...String(incoming || "").split("、"),
  ]);
  return cleanText(values.join("、"), max);
};

function getShanghaiPeriod(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  const localDate = new Date(`${values.year}-${values.month}-${values.day}T00:00:00Z`);
  const day = localDate.getUTCDay() || 7;
  localDate.setUTCDate(localDate.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(localDate.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((localDate - yearStart) / 86400000) + 1) / 7);
  return {
    month: `${values.year}-${values.month}`,
    week: `${localDate.getUTCFullYear()}-W${String(week).padStart(2, "0")}`,
  };
}

async function findSessionRecord(tenantToken, appToken, tableId, sessionId) {
  if (!sessionId) return null;
  const response = await axios.post(
    `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`,
    {
      filter: {
        conjunction: "and",
        conditions: [{ field_name: "会话ID", operator: "is", value: [sessionId] }],
      },
    },
    {
      params: { page_size: 1 },
      headers: { Authorization: `Bearer ${tenantToken}` },
      timeout: 10_000,
    },
  );
  if (response.data?.code !== 0) {
    throw new Error(response.data?.msg || "查询飞书访问会话失败");
  }
  return response.data?.data?.items?.[0] || null;
}

export async function recordFeishuUsage(user, event = {}) {
  if (!configured()) {
    console.warn("[FeishuUsage] skipped: FEISHU_APP_ID/FEISHU_APP_SECRET 未配置");
    return { skipped: true };
  }

  const eventId = cleanText(event.eventId || crypto.randomUUID(), 200);
  const now = Date.now();
  const period = getShanghaiPeriod(new Date(now));
  const eventTypes = Array.isArray(event.eventTypes)
    ? event.eventTypes
    : [event.eventType || "其他"];
  const eventTypeValue = uniqueValues(eventTypes).join("、") || "其他";
  const isGeneration = eventTypes.includes("生成素材");
  const isDownload = eventTypes.includes("下载素材");
  const fields = {
    "事件编号": `WEB-${now}-${eventId.slice(0, 4).toUpperCase()}`,
    "用户名称": cleanText(user?.displayName || user?.name || "美图用户", 200),
    "用户标识": cleanText(user?.openid || user?.feishu_user_id, 300),
    "进入时间": event.enteredAt || now,
    "事件类型": eventTypeValue,
    "页面路径": cleanText(event.pagePath, 500),
    "统计周": period.week,
    "统计月": period.month,
    "最后操作时间": now,
    "操作次数": 1,
    "首次生成耗时(秒)": 0,
    "本次使用时长(秒)": 0,
    "生成尝试次数": isGeneration ? 1 : 0,
    "生成成功次数": isGeneration && event.generatedSuccessfully ? 1 : 0,
    "生成失败次数": isGeneration && !event.generatedSuccessfully ? 1 : 0,
    "下载数量": isDownload ? Math.max(1, Number(event.outputCount) || 1) : 0,
    "任务状态": isDownload ? "已完成" : isGeneration ? "生成中" : "仅访问",
    "采用情况": "待确认",
    "返工次数": 0,
    "传统制作预计耗时(分钟)": 0,
    "AI节省时间(分钟)": 0,
    "满意度(1-5分)": 0,
    "使用入口": event.entry || "直接访问",
    "使用工具": cleanText(event.tool, 300),
    "硬广形式": cleanText(event.adFormat, 300),
    "素材类型": Array.isArray(event.assetTypes) ? event.assetTypes.filter(Boolean) : [],
    "是否点击生成": Boolean(event.clickedGenerate),
    "是否生成成功": Boolean(event.generatedSuccessfully),
    "失败原因": cleanText(event.failureReason, 1000),
    "生成规格": cleanText(event.outputSpec, 500),
    "生成格式": event.outputFormat || "其他",
    "生成数量": Number(event.outputCount) || 0,
    "结果编号": cleanText(event.resultId, 300),
    "是否下载": Boolean(event.downloaded),
    "会话ID": cleanText(event.sessionId, 300),
    "唯一事件ID": eventId,
  };
  if (!fields["素材类型"].length) delete fields["素材类型"];
  if (event.downloadedAt) fields["下载时间"] = event.downloadedAt;

  const tenantToken = await getTenantToken();
  const appToken = await getAppToken();
  const tableId = process.env.FEISHU_USAGE_TABLE_ID || DEFAULT_TABLE_ID;
  const existing = await findSessionRecord(tenantToken, appToken, tableId, fields["会话ID"]);
  let response;
  if (existing) {
    const current = existing.fields || {};
    const enteredAt = Number(current["进入时间"] || fields["进入时间"] || now);
    const firstGenerationSeconds = isGeneration
      ? Number(current["首次生成耗时(秒)"] || Math.max(0, Math.round((now - enteredAt) / 1000)))
      : Number(current["首次生成耗时(秒)"] || 0);
    const mergedFields = {
      ...fields,
      "事件编号": current["事件编号"] || fields["事件编号"],
      "进入时间": current["进入时间"] || fields["进入时间"],
      "事件类型": mergeText(current["事件类型"], fields["事件类型"], 300),
      "页面路径": mergeText(current["页面路径"], fields["页面路径"], 500),
      "使用工具": mergeText(current["使用工具"], fields["使用工具"], 300),
      "硬广形式": mergeText(current["硬广形式"], fields["硬广形式"], 1000),
      "素材类型": uniqueValues([...(current["素材类型"] || []), ...(fields["素材类型"] || [])]),
      "是否点击生成": Boolean(current["是否点击生成"] || fields["是否点击生成"]),
      "是否生成成功": Boolean(current["是否生成成功"] || fields["是否生成成功"]),
      "失败原因": mergeText(current["失败原因"], fields["失败原因"], 1000),
      "生成规格": mergeText(current["生成规格"], fields["生成规格"], 1000),
      "生成数量": Number(current["生成数量"] || 0) + Number(fields["生成数量"] || 0),
      "结果编号": mergeText(current["结果编号"], fields["结果编号"], 1000),
      "是否下载": Boolean(current["是否下载"] || fields["是否下载"]),
      "操作次数": Number(current["操作次数"] || 0) + 1,
      "首次生成耗时(秒)": firstGenerationSeconds,
      "本次使用时长(秒)": Math.max(0, Math.round((now - enteredAt) / 1000)),
      "生成尝试次数": Number(current["生成尝试次数"] || 0) + Number(fields["生成尝试次数"] || 0),
      "生成成功次数": Number(current["生成成功次数"] || 0) + Number(fields["生成成功次数"] || 0),
      "生成失败次数": Number(current["生成失败次数"] || 0) + Number(fields["生成失败次数"] || 0),
      "下载数量": Number(current["下载数量"] || 0) + Number(fields["下载数量"] || 0),
      "任务状态": isDownload ? "已完成" : (current["任务状态"] === "已完成" ? "已完成" : fields["任务状态"]),
      "采用情况": current["采用情况"] || "待确认",
      "返工次数": Number(current["返工次数"] || 0),
      "传统制作预计耗时(分钟)": Number(current["传统制作预计耗时(分钟)"] || 0),
      "AI节省时间(分钟)": Number(current["AI节省时间(分钟)"] || 0),
      "满意度(1-5分)": Number(current["满意度(1-5分)"] || 0),
      "唯一事件ID": current["唯一事件ID"] || fields["唯一事件ID"],
    };
    if (current["下载时间"] || fields["下载时间"]) {
      mergedFields["下载时间"] = Math.max(Number(current["下载时间"] || 0), Number(fields["下载时间"] || 0));
    }
    response = await axios.put(
      `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${existing.record_id}`,
      { fields: mergedFields },
      { headers: { Authorization: `Bearer ${tenantToken}` }, timeout: 10_000 },
    );
  } else {
    response = await axios.post(
      `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      { fields },
      { headers: { Authorization: `Bearer ${tenantToken}` }, timeout: 10_000 },
    );
  }
  if (response.data?.code !== 0) {
    throw new Error(response.data?.msg || "飞书使用记录写入失败");
  }
  return { recordId: response.data?.data?.record?.record_id, eventId };
}

export function recordFeishuUsageSafely(user, event) {
  const sessionId = cleanText(event?.sessionId, 300);
  const previous = sessionQueues.get(sessionId) || Promise.resolve();
  const pending = previous.then(() => recordFeishuUsage(user, event));
  if (sessionId) sessionQueues.set(sessionId, pending);
  void pending.catch(error => {
    console.error("[FeishuUsage] record failed:", error.response?.data || error.message);
  }).finally(() => {
    if (sessionId && sessionQueues.get(sessionId) === pending) sessionQueues.delete(sessionId);
  });
}
