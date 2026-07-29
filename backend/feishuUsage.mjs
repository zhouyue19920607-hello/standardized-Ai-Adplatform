import axios from "axios";
import crypto from "node:crypto";

const FEISHU_API = "https://open.feishu.cn/open-apis";
const DEFAULT_WIKI_TOKEN = "Z3zTwTAFViAZH4klt9NcsqNFngb";
const DEFAULT_TABLE_ID = "tblHi5s5LQVZZ66v";

let tenantTokenCache = null;
let appTokenCache = null;
let tableFieldsCache = null;
let tableFieldMetaCache = null;
const sessionQueues = new Map();

const usageStatus = {
  configured: false,
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastSkippedAt: null,
  lastErrorAt: null,
  lastError: null,
  lastRecordId: null,
  lastStage: null,
  lastStageAt: null,
  lastDurationMs: 0,
  consecutiveFailures: 0,
  pendingSessions: 0,
};

const configured = () => Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET);
const FEISHU_STEP_TIMEOUT_MS = Number(process.env.FEISHU_STEP_TIMEOUT_MS || 8000);

async function withDeadline(stage, task, timeoutMs = FEISHU_STEP_TIMEOUT_MS) {
  markStage(stage);
  let timer;
  try {
    return await Promise.race([
      task(),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${stage} 超时 ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function markStage(stage) {
  usageStatus.lastStage = stage;
  usageStatus.lastStageAt = new Date().toISOString();
}

function setUsageError(error) {
  usageStatus.lastErrorAt = new Date().toISOString();
  usageStatus.lastError = error?.response?.data?.msg || error?.response?.data?.message || error?.message || String(error);
  usageStatus.consecutiveFailures += 1;
}

function setUsageSuccess(recordId) {
  markStage("success");
  usageStatus.lastSuccessAt = new Date().toISOString();
  usageStatus.lastError = null;
  usageStatus.lastRecordId = recordId || null;
  usageStatus.consecutiveFailures = 0;
}

export function getFeishuUsageStatus() {
  return {
    ...usageStatus,
    configured: configured(),
    pendingSessions: sessionQueues.size,
    wikiTokenConfigured: Boolean(process.env.FEISHU_USAGE_WIKI_TOKEN),
    tableIdConfigured: Boolean(process.env.FEISHU_USAGE_TABLE_ID),
    defaultWikiToken: DEFAULT_WIKI_TOKEN,
    defaultTableId: DEFAULT_TABLE_ID,
  };
}

async function getTenantToken() {
  if (tenantTokenCache && tenantTokenCache.expiresAt > Date.now() + 60_000) {
    markStage("tenant_token_cached");
    return tenantTokenCache.value;
  }
  const response = await withDeadline("tenant_token_request", () => axios.post(`${FEISHU_API}/auth/v3/tenant_access_token/internal`, {
    app_id: process.env.FEISHU_APP_ID,
    app_secret: process.env.FEISHU_APP_SECRET,
  }, { timeout: FEISHU_STEP_TIMEOUT_MS }));
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
  if (appTokenCache) {
    markStage("wiki_node_cached");
    return appTokenCache;
  }
  const tenantToken = await getTenantToken();
  const wikiToken = process.env.FEISHU_USAGE_WIKI_TOKEN || DEFAULT_WIKI_TOKEN;
  const response = await withDeadline("wiki_node_request", () => axios.get(`${FEISHU_API}/wiki/v2/spaces/get_node`, {
    params: { token: wikiToken },
    headers: { Authorization: `Bearer ${tenantToken}` },
    timeout: FEISHU_STEP_TIMEOUT_MS,
  }));
  if (response.data?.code !== 0 || !response.data?.data?.node?.obj_token) {
    throw new Error(response.data?.msg || "无法解析飞书使用记录表");
  }
  appTokenCache = response.data.data.node.obj_token;
  return appTokenCache;
}

const cleanText = (value, max = 1000) => String(value || "").slice(0, max);

const uniqueValues = (values) => [...new Set(values.filter(Boolean))];

const cleanList = (value, maxItemLength = 100) => {
  const list = Array.isArray(value) ? value : [value];
  return uniqueValues(list.map(item => cleanText(item, maxItemLength)).filter(Boolean));
};

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

function fallbackUsageFieldMeta() {
  const fieldTypes = {
    "用户名称": 1,
    "用户标识": 1,
    "进入时间": 5,
    "页面路径": 1,
    "统计周": 1,
    "统计月": 1,
    "最后操作时间": 5,
    "操作次数": 2,
    "本次使用时长(秒)": 2,
    "生成尝试次数": 2,
    "生成成功次数": 2,
    "生成失败次数": 2,
    "下载数量": 2,
    "任务状态": 3,
    "使用入口": 3,
    "使用工具": 1,
    "硬广形式": 1,
    "是否点击生成": 7,
    "是否生成成功": 7,
    "失败原因": 1,
    "操作摘要": 1,
    "生成规格": 1,
    "生成格式": 3,
    "生成数量": 2,
    "结果编号": 1,
    "是否下载": 7,
    "会话ID": 1,
  };
  return new Map(Object.entries(fieldTypes).map(([field_name, type]) => [field_name, { field_name, type }]));
}

function shouldSkipFieldLookup() {
  return String(process.env.FEISHU_USAGE_SKIP_FIELD_LOOKUP || "true").toLowerCase() !== "false";
}

function fallbackWritableFields(fields) {
  return filterExistingFields(fields, fallbackUsageFieldMeta());
}

function minimalWritableFields(fields) {
  return {
    "用户名称": cleanText(fields["用户名称"], 200),
    "进入时间": Number(fields["进入时间"] || Date.now()),
    "页面路径": cleanText(fields["页面路径"], 500),
    "使用工具": cleanText(fields["使用工具"], 300),
    "硬广形式": cleanText(fields["硬广形式"], 300),
    "会话ID": cleanText(fields["会话ID"], 300),
    "操作摘要": cleanText(fields["操作摘要"] || "进入网站", 500),
  };
}

async function createUsageRecord(tenantToken, appToken, tableId, fields, stage = "record_create_request") {
  try {
    return await withDeadline(stage, () => axios.post(
      `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
      { fields },
      { headers: { Authorization: `Bearer ${tenantToken}` }, timeout: FEISHU_STEP_TIMEOUT_MS },
    ));
  } catch (error) {
    const msg = error?.response?.data?.msg || error?.message || "";
    if (stage !== "record_create_minimal_request" && /FieldConvFail|field.*convert|字段/i.test(msg)) {
      usageStatus.lastError = msg;
      return createUsageRecord(tenantToken, appToken, tableId, minimalWritableFields(fields), "record_create_minimal_request");
    }
    throw error;
  }
}

async function getTableFieldMeta(tenantToken, appToken, tableId) {
  const cacheKey = `${appToken}:${tableId}`;
  if (tableFieldMetaCache?.key === cacheKey && tableFieldMetaCache.expiresAt > Date.now()) {
    markStage("table_fields_cached");
    return tableFieldMetaCache.value;
  }
  const meta = new Map();
  let pageToken = undefined;
  markStage("table_fields_request");
  do {
    const response = await withDeadline("table_fields_request", () => axios.get(
      `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/fields`,
      {
        params: { page_size: 100, ...(pageToken ? { page_token: pageToken } : {}) },
        headers: { Authorization: `Bearer ${tenantToken}` },
        timeout: FEISHU_STEP_TIMEOUT_MS,
      },
    ));
    if (response.data?.code !== 0) {
      throw new Error(response.data?.msg || "读取飞书使用记录字段失败");
    }
    for (const field of response.data?.data?.items || []) {
      if (field?.field_name) meta.set(field.field_name, field);
    }
    pageToken = response.data?.data?.page_token;
  } while (pageToken);
  tableFieldMetaCache = { key: cacheKey, value: meta, expiresAt: Date.now() + 10 * 60_000 };
  tableFieldsCache = { key: cacheKey, value: new Set(meta.keys()), expiresAt: Date.now() + 10 * 60_000 };
  return meta;
}

async function getTableFieldNames(tenantToken, appToken, tableId) {
  const cacheKey = `${appToken}:${tableId}`;
  if (tableFieldsCache?.key === cacheKey && tableFieldsCache.expiresAt > Date.now()) {
    return tableFieldsCache.value;
  }
  const meta = await getTableFieldMeta(tenantToken, appToken, tableId);
  return new Set(meta.keys());
}

function coerceFeishuFieldValue(value, field) {
  if (value === undefined || value === null) return undefined;
  const type = Number(field?.type);
  if ([1, 13, 15].includes(type)) return Array.isArray(value) ? value.join("、") : String(value);
  if (type === 2) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }
  if (type === 3) return Array.isArray(value) ? String(value[0] || "") : String(value);
  if (type === 4) return cleanList(value);
  if (type === 5) {
    const number = Number(value);
    if (Number.isFinite(number)) return number;
    const parsed = Date.parse(String(value));
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  if (type === 7) return Boolean(value);
  if ([11, 17, 18, 20, 21, 22, 23, 1001, 1002, 1003, 1005].includes(type)) return undefined;
  return value;
}

function filterExistingFields(fields, fieldMetaOrNames) {
  const result = {};
  for (const [name, value] of Object.entries(fields)) {
    const field = fieldMetaOrNames instanceof Map ? fieldMetaOrNames.get(name) : null;
    const exists = fieldMetaOrNames instanceof Map ? Boolean(field) : fieldMetaOrNames.has(name);
    if (!exists) continue;
    const coerced = field ? coerceFeishuFieldValue(value, field) : value;
    if (coerced !== undefined) result[name] = coerced;
  }
  return result;
}

async function findSessionRecord(tenantToken, appToken, tableId, sessionId) {
  if (!sessionId) return null;
  const response = await withDeadline("record_search_request", () => axios.post(
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
      timeout: FEISHU_STEP_TIMEOUT_MS,
    },
  ));
  if (response.data?.code !== 0) {
    throw new Error(response.data?.msg || "查询飞书访问会话失败");
  }
  return response.data?.data?.items?.[0] || null;
}

export async function recordFeishuUsage(user, event = {}) {
  const startedAt = Date.now();
  usageStatus.lastAttemptAt = new Date().toISOString();
  markStage("start");
  usageStatus.configured = configured();
  if (!configured()) {
    usageStatus.lastSkippedAt = new Date().toISOString();
    usageStatus.lastError = "FEISHU_APP_ID/FEISHU_APP_SECRET 未配置";
    console.warn("[FeishuUsage] skipped: FEISHU_APP_ID/FEISHU_APP_SECRET 未配置");
    return { skipped: true };
  }

  try {

  const eventId = cleanText(event.eventId || crypto.randomUUID(), 200);
  const now = Date.now();
  const period = getShanghaiPeriod(new Date(now));
  const eventTypes = Array.isArray(event.eventTypes)
    ? event.eventTypes
    : [event.eventType || "其他"];
  const isGenerateClick = Boolean(event.clickedGenerate) || eventTypes.includes("点击生成");
  const isGenerationSuccess = Boolean(event.generatedSuccessfully) || eventTypes.includes("生成成功") || eventTypes.includes("生成素材");
  const isGenerationFailure = eventTypes.includes("生成失败") || Boolean(event.failureReason);
  const isGeneration = isGenerateClick || isGenerationSuccess || isGenerationFailure;
  const isDownload = Boolean(event.downloaded) || eventTypes.includes("下载结果") || eventTypes.includes("下载素材");
  const fields = {
    "事件编号": `WEB-${now}-${eventId.slice(0, 4).toUpperCase()}`,
    "用户名称": cleanText(user?.displayName || user?.name || event.visitorId || "美图用户", 200),
    "用户标识": cleanText(user?.openid || user?.feishu_user_id || event.visitorId, 300),
    "进入时间": event.enteredAt || now,
    "事件类型": cleanList(eventTypes),
    "页面路径": cleanText(event.pagePath, 500),
    "统计周": period.week,
    "统计月": period.month,
    "最后操作时间": now,
    "操作次数": 1,
    "首次生成耗时(秒)": 0,
    "本次使用时长(秒)": 0,
    "生成尝试次数": isGenerateClick ? 1 : 0,
    "生成成功次数": isGenerationSuccess ? 1 : 0,
    "生成失败次数": isGenerationFailure ? 1 : 0,
    "下载数量": isDownload ? Math.max(1, Number(event.outputCount) || 1) : 0,
    "任务状态": cleanText(event.taskStatus || (isGenerationSuccess ? "已完成" : isGenerationFailure ? "已放弃" : isGenerateClick ? "生成中" : "仅访问"), 100),
    "采用情况": cleanText(event.adoptionStatus || "待确认", 100),
    "返工次数": 0,
    "传统制作预计耗时(分钟)": 0,
    "AI节省时间(分钟)": 0,
    "满意度(1-5分)": 0,
    "未采用原因": cleanList(event.nonAdoptionReasons),
    "使用入口": cleanText(event.entry || "直接访问", 100),
    "使用工具": cleanText(event.tool, 300),
    "硬广形式": cleanText(event.adFormat, 300),
    "素材类型": cleanList(event.assetTypes),
    "是否点击生成": Boolean(event.clickedGenerate),
    "是否生成成功": Boolean(isGenerationSuccess),
    "失败原因": cleanText(event.failureReason, 1000),
    "生成规格": cleanText(event.outputSpec, 500),
    "生成格式": cleanText(event.outputFormat || "其他", 100),
    "生成数量": Number(event.outputCount) || 0,
    "结果编号": cleanText(event.resultId, 300),
    "是否下载": Boolean(isDownload),
    "操作摘要": cleanText(eventTypes.join("、"), 500),
    "会话ID": cleanText(event.sessionId, 300),
    "唯一事件ID": eventId,
  };
  if (event.downloadedAt) fields["下载时间"] = event.downloadedAt;

  markStage("build_fields");
  const tenantToken = await getTenantToken();
  const appToken = await getAppToken();
  const tableId = process.env.FEISHU_USAGE_TABLE_ID || DEFAULT_TABLE_ID;
  let response;
  if (shouldSkipFieldLookup()) {
    markStage("field_lookup_skipped");
    response = await createUsageRecord(tenantToken, appToken, tableId, fallbackWritableFields(fields));
  } else {
    let fieldMeta;
    try {
      fieldMeta = await getTableFieldMeta(tenantToken, appToken, tableId);
    } catch (error) {
      usageStatus.lastError = error?.message || String(error);
      markStage("table_fields_fallback");
      fieldMeta = fallbackUsageFieldMeta();
    }
    const fieldNames = new Set(fieldMeta.keys());
    const writableFields = filterExistingFields(fields, fieldMeta);
    const existing = fieldNames.has("会话ID")
      ? await findSessionRecord(tenantToken, appToken, tableId, fields["会话ID"])
      : null;
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
        "页面路径": mergeText(current["页面路径"], fields["页面路径"], 500),
        "事件类型": cleanList([...(Array.isArray(current["事件类型"]) ? current["事件类型"] : [current["事件类型"]]), ...fields["事件类型"]]),
        "是否点击生成": Boolean(current["是否点击生成"] || fields["是否点击生成"]),
        "是否生成成功": Boolean(current["是否生成成功"] || fields["是否生成成功"]),
        "失败原因": mergeText(current["失败原因"], fields["失败原因"], 1000),
        "生成规格": mergeText(current["生成规格"], fields["生成规格"], 1000),
        "生成格式": fields["生成格式"] !== "其他" ? fields["生成格式"] : (current["生成格式"] || fields["生成格式"]),
        "生成数量": Number(current["生成数量"] || 0) + Number(fields["生成数量"] || 0),
        "结果编号": mergeText(current["结果编号"], fields["结果编号"], 1000),
        "是否下载": Boolean(current["是否下载"] || fields["是否下载"]),
        "任务状态": fields["任务状态"] !== "仅访问" ? fields["任务状态"] : (current["任务状态"] || fields["任务状态"]),
        "采用情况": current["采用情况"] || fields["采用情况"],
        "未采用原因": cleanList([...(Array.isArray(current["未采用原因"]) ? current["未采用原因"] : [current["未采用原因"]]), ...fields["未采用原因"]]),
        "使用入口": current["使用入口"] || fields["使用入口"],
        "使用工具": mergeText(current["使用工具"], fields["使用工具"], 500),
        "硬广形式": mergeText(current["硬广形式"], fields["硬广形式"], 500),
        "素材类型": cleanList([...(Array.isArray(current["素材类型"]) ? current["素材类型"] : [current["素材类型"]]), ...fields["素材类型"]]),
        "操作次数": Number(current["操作次数"] || 0) + 1,
        "首次生成耗时(秒)": firstGenerationSeconds,
        "本次使用时长(秒)": Math.max(0, Math.round((now - enteredAt) / 1000)),
        "生成尝试次数": Number(current["生成尝试次数"] || 0) + Number(fields["生成尝试次数"] || 0),
        "生成成功次数": Number(current["生成成功次数"] || 0) + Number(fields["生成成功次数"] || 0),
        "生成失败次数": Number(current["生成失败次数"] || 0) + Number(fields["生成失败次数"] || 0),
        "下载数量": Number(current["下载数量"] || 0) + Number(fields["下载数量"] || 0),
        "返工次数": Number(current["返工次数"] || 0),
        "传统制作预计耗时(分钟)": Number(current["传统制作预计耗时(分钟)"] || 0),
        "AI节省时间(分钟)": Number(current["AI节省时间(分钟)"] || 0),
        "满意度(1-5分)": Number(current["满意度(1-5分)"] || 0),
        "唯一事件ID": current["唯一事件ID"] || fields["唯一事件ID"],
      };
      if (current["下载时间"] || fields["下载时间"]) {
        mergedFields["下载时间"] = Math.max(Number(current["下载时间"] || 0), Number(fields["下载时间"] || 0));
      }
      response = await withDeadline("record_update_request", () => axios.put(
        `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records/${existing.record_id}`,
        { fields: filterExistingFields(mergedFields, fieldMeta) },
        { headers: { Authorization: `Bearer ${tenantToken}` }, timeout: FEISHU_STEP_TIMEOUT_MS },
      ));
    } else {
      response = await createUsageRecord(tenantToken, appToken, tableId, writableFields);
    }
  }
  if (response.data?.code !== 0) {
    throw new Error(response.data?.msg || "飞书使用记录写入失败");
  }
  const recordId = response.data?.data?.record?.record_id;
  usageStatus.lastDurationMs = Date.now() - startedAt;
  setUsageSuccess(recordId);
  return { recordId, eventId };
  } catch (error) {
    usageStatus.lastDurationMs = Date.now() - startedAt;
    setUsageError(error);
    throw error;
  }
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
