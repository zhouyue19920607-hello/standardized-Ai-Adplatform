import axios from "axios";
import crypto from "node:crypto";

const FEISHU_API = "https://open.feishu.cn/open-apis";
const DEFAULT_WIKI_TOKEN = "Z3zTwTAFViAZH4klt9NcsqNFngb";
const DEFAULT_TABLE_ID = "tblHi5s5LQVZZ66v";

let tenantTokenCache = null;
let appTokenCache = null;

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

export async function recordFeishuUsage(user, event = {}) {
  if (!configured()) {
    console.warn("[FeishuUsage] skipped: FEISHU_APP_ID/FEISHU_APP_SECRET 未配置");
    return { skipped: true };
  }

  const eventId = cleanText(event.eventId || crypto.randomUUID(), 200);
  const now = Date.now();
  const fields = {
    "事件编号": `WEB-${now}-${eventId.slice(0, 4).toUpperCase()}`,
    "用户名称": cleanText(user?.displayName || user?.name || "美图用户", 200),
    "登录邮箱": cleanText(user?.login_email || user?.email, 300),
    "用户标识": cleanText(user?.openid || user?.feishu_user_id, 300),
    "进入时间": event.enteredAt || now,
    "事件类型": event.eventType || "其他",
    "页面路径": cleanText(event.pagePath, 500),
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
  if (event.downloadedAt) fields["下载时间"] = event.downloadedAt;

  const tenantToken = await getTenantToken();
  const appToken = await getAppToken();
  const tableId = process.env.FEISHU_USAGE_TABLE_ID || DEFAULT_TABLE_ID;
  const response = await axios.post(
    `${FEISHU_API}/bitable/v1/apps/${appToken}/tables/${tableId}/records`,
    { fields },
    { headers: { Authorization: `Bearer ${tenantToken}` }, timeout: 10_000 },
  );
  if (response.data?.code !== 0) {
    throw new Error(response.data?.msg || "飞书使用记录写入失败");
  }
  return { recordId: response.data?.data?.record?.record_id, eventId };
}

export function recordFeishuUsageSafely(user, event) {
  void recordFeishuUsage(user, event).catch(error => {
    console.error("[FeishuUsage] record failed:", error.response?.data || error.message);
  });
}
