import axios from "axios";
import crypto from "node:crypto";

const FEISHU_API = "https://open.feishu.cn/open-apis";
const CASE_APP_TOKEN = process.env.FEISHU_CASE_APP_TOKEN || "B27LbHfKPawILAsy0h3cZl8in9e";
const CASE_TABLE_ID = process.env.FEISHU_CASE_TABLE_ID || "tblq2aHcsX6TKGAV";
const CACHE_MS = 5 * 60 * 1000;
const VIDEO_LINK_TTL_MS = 15 * 60 * 1000;

let tenantTokenCache = null;
let caseCache = { expiresAt: 0, records: [] };

const configured = () => Boolean(process.env.FEISHU_APP_ID && process.env.FEISHU_APP_SECRET);

export function caseToolConfigured() {
  return Boolean(process.env.ARKCLAW_CASE_API_KEY);
}

export function verifyCaseToolRequest(req) {
  const expected = process.env.ARKCLAW_CASE_API_KEY || "";
  if (!expected) return false;
  const incoming = String(
    req.headers["x-api-key"]
    || req.headers.authorization?.replace(/^Bearer\s+/i, "")
    || req.query.api_key
    || "",
  );
  if (!incoming) return false;
  const incomingBuffer = Buffer.from(incoming);
  const expectedBuffer = Buffer.from(expected);
  return incomingBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(incomingBuffer, expectedBuffer);
}

function downloadSecret() {
  return process.env.CASE_VIDEO_DOWNLOAD_SECRET || process.env.ARKCLAW_CASE_API_KEY || "";
}

function signVideoToken(fileToken, expiresAt) {
  const secret = downloadSecret();
  if (!secret) return "";
  return crypto.createHmac("sha256", secret).update(`${fileToken}:${expiresAt}`).digest("base64url");
}

export function verifyCaseVideoSignature(fileToken, expiresAt, signature) {
  const expires = Number(expiresAt);
  if (!fileToken || !expires || expires < Date.now() || !signature) return false;
  const expected = signVideoToken(fileToken, expires);
  if (!expected) return false;
  const incomingBuffer = Buffer.from(String(signature));
  const expectedBuffer = Buffer.from(expected);
  return incomingBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(incomingBuffer, expectedBuffer);
}

function signedVideoUrl(origin, video) {
  if (!origin) return "";
  const expires = Date.now() + VIDEO_LINK_TTL_MS;
  const sig = signVideoToken(video.fileToken, expires);
  if (!sig) return "";
  const url = new URL(`/api/cases/videos/${encodeURIComponent(video.fileToken)}`, origin);
  url.searchParams.set("filename", video.name);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("sig", sig);
  return url.toString();
}

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

function valueText(value) {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.map(valueText).join(" ");
  if (typeof value === "object") return value.text || value.name || valueText(Object.values(value));
  return "";
}

function normalized(value) {
  return valueText(value)
    .toLowerCase()
    .replace(/破款/g, "破框")
    .replace(/[\s，。！？、/：:（）()_-]/g, "");
}

function queryTerms(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/破款/g, "破框")
    .replace(/给我|帮我|找一个|找些|一个|一些|关于|相关|创新硬广|创新形式|硬广|案例|case|视频|效果素材|素材/gi, " ")
    .replace(/的/g, " ")
    .split(/[\s，。！？、/：:（）()_-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 2);
}

function requestedVideoTerms(text) {
  return queryTerms(text).filter((term) =>
    /破框|焦点|聚光|开屏|彩蛋|多态|翻卡|跃动|跃境|联动|超视频|全景|3d|焕新|ui|杂志|翻页|炫动/i.test(term),
  );
}

function dateLabel(value) {
  if (!value) return "未填写";
  try {
    return new Intl.DateTimeFormat("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(Number(value)));
  } catch {
    return "未填写";
  }
}

async function loadCaseRecords() {
  if (caseCache.expiresAt > Date.now()) return caseCache.records;
  if (!configured()) throw new Error("FEISHU_APP_ID/FEISHU_APP_SECRET 未配置");
  const tenantToken = await getTenantToken();
  const records = [];
  let pageToken = "";
  do {
    const response = await axios.get(
      `${FEISHU_API}/bitable/v1/apps/${CASE_APP_TOKEN}/tables/${CASE_TABLE_ID}/records`,
      {
        params: { page_size: 100, page_token: pageToken || undefined },
        headers: { Authorization: `Bearer ${tenantToken}` },
        timeout: 10_000,
      },
    );
    if (response.data?.code !== 0) {
      throw new Error(response.data?.msg || "读取案例库失败");
    }
    records.push(...(response.data?.data?.items || []));
    pageToken = response.data?.data?.page_token || "";
  } while (pageToken);
  caseCache = { expiresAt: Date.now() + CACHE_MS, records };
  return records;
}

function findCases(query, records, limit = 3) {
  if (/一个|一条|1个|1条/.test(query)) limit = 1;
  const terms = queryTerms(query);
  if (!terms.length) return [];
  return records
    .map((record) => {
      const fields = record.fields || {};
      const all = normalized([
        fields["品牌"],
        fields["行业"],
        fields["上线平台"],
        fields["上线形式"],
        fields["提需方"],
        fields["状态"],
        fields["视频效果"],
      ]);
      const brand = normalized(fields["品牌"]);
      let score = 0;
      let matchedTerms = 0;
      for (const term of terms) {
        const wanted = normalized(term);
        if (brand && brand === wanted) { score += 100; matchedTerms += 1; }
        else if (brand && (brand.includes(wanted) || wanted.includes(brand))) { score += 50; matchedTerms += 1; }
        else if (all.includes(wanted)) { score += 10; matchedTerms += 1; }
      }
      if (fields["状态"] === "已上线") score += 5;
      const hasCoreFields = Boolean(fields["品牌"] && (fields["行业"] || fields["上线平台"] || fields["上线形式"]));
      return { record, score, matchedTerms, hasCoreFields };
    })
    .filter((item) => item.score > 0 && item.hasCoreFields && item.matchedTerms === terms.length)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((item) => item.record);
}

function getCaseVideos(records, query, limit = 3) {
  const videoTerms = requestedVideoTerms(query);
  const videos = records.flatMap((record) => {
    const attachments = record.fields?.["视频效果"];
    if (!Array.isArray(attachments)) return [];
    return attachments
      .filter((item) => item?.file_token && item?.name)
      .map((item) => ({
        fileToken: item.file_token,
        name: item.name,
        bytes: Number(item.size) || 0,
      }));
  });
  const matched = videoTerms.length
    ? videos.filter((video) => videoTerms.every((term) => normalized(video.name).includes(normalized(term))))
    : videos;
  return (matched.length ? matched : videos).slice(0, limit);
}

function formatCases(records, query, origin = "") {
  return records.map((record, index) => {
    const fields = record.fields || {};
    const videos = getCaseVideos([record], query, 3).map((video) => ({
      name: video.name,
      sizeMB: Number((video.bytes / 1024 / 1024).toFixed(2)),
      downloadUrl: signedVideoUrl(origin, video),
    }));
    return {
      index: index + 1,
      brand: valueText(fields["品牌"]) || "未命名品牌",
      industry: valueText(fields["行业"]) || "未填写",
      platform: valueText(fields["上线平台"]) || "未填写",
      format: valueText(fields["上线形式"]) || "未填写",
      launchDate: dateLabel(fields["上线时间"]),
      status: valueText(fields["状态"]) || "未填写",
      videos,
    };
  });
}

export async function searchCaseLibrary(query, { limit = 3, origin = "" } = {}) {
  const records = await loadCaseRecords();
  const matches = findCases(query, records, limit);
  return {
    query,
    total: matches.length,
    cases: formatCases(matches, query, origin),
    instruction: "请只回复案例摘要和视频，不要展示多维表格链接、App Token、Table ID 或内部记录链接。",
  };
}

export async function downloadCaseVideo(fileToken) {
  if (!configured()) throw new Error("FEISHU_APP_ID/FEISHU_APP_SECRET 未配置");
  const tenantToken = await getTenantToken();
  const response = await axios.get(`${FEISHU_API}/drive/v1/medias/${fileToken}/download`, {
    headers: { Authorization: `Bearer ${tenantToken}` },
    responseType: "stream",
    timeout: 30_000,
  });
  return response;
}
