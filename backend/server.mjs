import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Type } from "@google/genai";
import axios from "axios";
import sharp from "sharp";
import { processImage } from "./utils/imageProcessor.mjs";
import { compressAndCompositeVideo } from "./ffmpegUtils.mjs";


// ---- 基础路径与环境变量 ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const PORT = process.env.PORT || 4000;
const COMFYUI_BASE_URL = process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

// NOTE: 生产部署时可通过 DATA_DIR / STORAGE_DIR 指向挂载卷，让访问统计、模板配置和上传资产跨容器重启保留。
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const STORAGE_DIR = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(__dirname, "storage");
const MASKS_DIR = path.join(STORAGE_DIR, "masks");
const WORKFLOWS_DIR = path.join(STORAGE_DIR, "workflows");
const BADGES_DIR = path.join(STORAGE_DIR, "badges");

const TEMPLATES_FILE = path.join(DATA_DIR, "templates.json");
const CREATIVE_TEMPLATES_FILE = path.join(DATA_DIR, "creative-templates.json");
const WORKFLOWS_FILE = path.join(DATA_DIR, "workflows.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");
const CREATIVE_SETTINGS_FILE = path.join(DATA_DIR, "creative-settings.json");
const ANALYTICS_FILE = path.join(DATA_DIR, "analytics.json");
const DEFAULT_CREATIVE_TEMPLATE_SETTINGS = {
  interactionType: "bubble-slide",
  cropAreaEnabled: true,
  platforms: ["xiuxiu", "meiyan", "wink"]
};
const DEFAULT_CREATIVE_TEMPLATES = [
  { id: "dynamic-splash", groupId: "splash", groupName: "开屏创意模版", name: "炫动开屏", dimensions: "1440 x 2340 / 5s", enabled: true },
  { id: "magazine-flip", groupId: "splash", groupName: "开屏创意模版", name: "杂志翻页", dimensions: "1440 x 2340 / 3-5素材", enabled: true },
  { id: "slide-splash", groupId: "splash", groupName: "开屏创意模版", name: "聚光开屏", dimensions: "小卡 275 x 370 / 大卡 897 x 370 / 开屏 1440 x 2340", enabled: true },
  { id: "twist-splash", groupId: "splash", groupName: "开屏创意模版", name: "扭转开屏", dimensions: "1440 x 2340 / 5s", enabled: true },
  { id: "break-frame-focal-3d", groupId: "home", groupName: "首页创意模版", name: "破框焦点视窗3D", dimensions: "预览 1126 x 2436 / 破框 1126 x 1890 / 焦点 1126 x 900", enabled: true },
  { id: "jumping-focal-window", groupId: "home", groupName: "首页创意模版", name: "跃动焦点视窗", dimensions: "待配置", enabled: true },
  { id: "refresh-ui-bottom-nav", groupId: "home", groupName: "首页创意模版", name: "焕新UI/底导", dimensions: "待配置", enabled: true }
];
// NOTE: 模版使用次数单独存储，不随 templates.json 一起被 git 覆盖
// 格式：{ "mt-f-1": 12, "mt-ib-1": 5, ... }
const USAGE_STATS_FILE = path.join(DATA_DIR, "usage-stats.json");
// NOTE: 遇罩/裁剪层/角标路径单独存储，不随代码更新被覆盖
// 格式：{ "mt-s-1": { mask_path, maskUrl, maskPath, crop_overlay_path, badge_overlay_path } }
const ASSET_OVERRIDES_FILE = path.join(DATA_DIR, "asset-overrides.json");

const getShanghaiDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}`;
};

const ensureAnalyticsDay = (analytics, dateKey = getShanghaiDateKey()) => {
  if (!analytics.days) analytics.days = {};
  if (!analytics.days[dateKey]) {
    analytics.days[dateKey] = {
      visits: 0,
      generations: 0,
      visitors: [],
      templateUses: {}
    };
  }
  if (!Array.isArray(analytics.days[dateKey].visitors)) analytics.days[dateKey].visitors = [];
  if (!analytics.days[dateKey].templateUses) analytics.days[dateKey].templateUses = {};
  return analytics.days[dateKey];
};

const buildAnalyticsSummary = (analytics) => {
  const days = analytics.days || {};
  const todayKey = getShanghaiDateKey();
  const today = days[todayKey] || { visits: 0, generations: 0, visitors: [], templateUses: {} };
  const totalVisitorIds = new Set();
  const templateTotals = {};
  Object.entries(days).forEach(([date, day]) => {
    (day.visitors || []).forEach(id => totalVisitorIds.add(id));
    Object.values(day.templateUses || {}).forEach(item => {
      if (!templateTotals[item.id]) {
        templateTotals[item.id] = { ...item, count: 0 };
      }
      templateTotals[item.id].count += item.count || 0;
    });
  });
  const recentDays = Object.entries(days)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 14)
    .map(([date, day]) => ({
      date,
      visits: day.visits || 0,
      generations: day.generations || 0,
      uniqueVisitors: (day.visitors || []).length,
      templateUseCount: Object.values(day.templateUses || {}).reduce((sum, item) => sum + (item.count || 0), 0)
    }));
  return {
    today: {
      date: todayKey,
      visits: today.visits || 0,
      generations: today.generations || 0,
      uniqueVisitors: (today.visitors || []).length,
      templateUseCount: Object.values(today.templateUses || {}).reduce((sum, item) => sum + (item.count || 0), 0),
      topTemplates: Object.values(today.templateUses || {}).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 10)
    },
    totals: {
      daysTracked: Object.keys(days).length,
      visits: Object.values(days).reduce((sum, day) => sum + (day.visits || 0), 0),
      generations: Object.values(days).reduce((sum, day) => sum + (day.generations || 0), 0),
      uniqueVisitors: totalVisitorIds.size
    },
    recentDays,
    templateRanking: Object.values(templateTotals).sort((a, b) => (b.count || 0) - (a.count || 0)).slice(0, 20)
  };
};

// ---- 辅助函数：简易 JSON“库”读写 ----
async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function readJson(filePath, defaultValue) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    return JSON.parse(content);
  } catch (err) {
    return defaultValue;
  }
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

// 初始化：保证数据文件存在
async function ensureDataFiles() {
  const templates = await readJson(TEMPLATES_FILE, null);
  if (!templates) {
    // 初始模版：和前端现有模版保持一致，并附加尺寸字段，作为“管理库”基线
    const initialTemplates = [
      // 美图秀秀
      { id: "mt-s-1", app: "美图秀秀", category: "开屏", name: "气泡全屏", checked: false, dimensions: "1440 x 2340", splashGroup: "dynamic" },
      { id: "mt-s-5", app: "美图秀秀", category: "开屏", name: "气泡非全屏", checked: false, dimensions: "1440 x 1938", splashGroup: "nonfull" },
      { id: "mt-s-2", app: "美图秀秀", category: "开屏", name: "上下滑动全屏", checked: false, dimensions: "1440 x 2340", splashGroup: "slide" },
      { id: "mt-s-6", app: "美图秀秀", category: "开屏", name: "上下滑动非全屏", checked: false, dimensions: "1440 x 1938", splashGroup: "slide-nonfull" },
      { id: "mt-s-3", app: "美图秀秀", category: "开屏", name: "扭动全屏", checked: false, dimensions: "1440 x 2340", splashGroup: "twist" },
      { id: "mt-s-7", app: "美图秀秀", category: "开屏", name: "扭动非全屏", checked: false, dimensions: "1440 x 1938", splashGroup: "twist-nonfull" },
      { id: "mt-s-8", app: "美图秀秀", category: "开屏", name: "三合一全屏", checked: false, dimensions: "1440 x 2340", splashGroup: "triple" },
      { id: "mt-s-9", app: "美图秀秀", category: "开屏", name: "三合一非全屏", checked: false, dimensions: "1440 x 1938", splashGroup: "triple-nonfull" },
      { id: "mt-f-1", app: "美图秀秀", category: "焦点视窗", name: "焦点视窗", checked: true, dimensions: "1126 x 2436" },
      { id: "mt-f-3", app: "美图秀秀", category: "焦点视窗", name: "沉浸式焦点视窗", checked: false, dimensions: "1126 x 2436" },
      { id: "mt-fe-1", app: "美图秀秀", category: "信息流", name: "一键配方图文", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-ib-1", app: "美图秀秀", category: "icon/banner", name: "热推第三位", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-ib-2", app: "美图秀秀", category: "icon/banner", name: "热搜词第四位", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-ib-3", app: "美图秀秀", category: "icon/banner", name: "话题页背景板", checked: false, dimensions: "1126 x 640" },
      { id: "mt-ib-4", app: "美图秀秀", category: "icon/banner", name: "话题页banner", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-p-1", app: "美图秀秀", category: "弹窗", name: "保分页弹窗", checked: false, dimensions: "960 x 1440" },
      { id: "mt-p-2", app: "美图秀秀", category: "弹窗", name: "首页弹窗", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-p-3", app: "美图秀秀", category: "弹窗", name: "首页弹窗异形", checked: false, dimensions: "1080 x 1920" },

      // 美颜
      { id: "my-s-1", app: "美颜", category: "开屏", name: "动态开屏", checked: false, dimensions: "1440 x 2340", splashGroup: "dynamic" },
      { id: "my-s-5", app: "美颜", category: "开屏", name: "气泡非全屏", checked: false, dimensions: "1440 x 1938", splashGroup: "nonfull" },
      { id: "my-s-2", app: "美颜", category: "开屏", name: "上下滑动全屏", checked: false, dimensions: "1440 x 2340", splashGroup: "slide" },
      { id: "my-s-6", app: "美颜", category: "开屏", name: "上下滑动非全屏", checked: false, dimensions: "1440 x 1938", splashGroup: "slide-nonfull" },
      { id: "my-s-3", app: "美颜", category: "开屏", name: "扭动全屏", checked: false, dimensions: "1440 x 2340", splashGroup: "twist" },
      { id: "my-s-7", app: "美颜", category: "开屏", name: "扭动非全屏", checked: false, dimensions: "1440 x 1938", splashGroup: "twist-nonfull" },
      { id: "my-s-8", app: "美颜", category: "开屏", name: "三合一全屏", checked: false, dimensions: "1440 x 2340", splashGroup: "triple" },
      { id: "my-s-9", app: "美颜", category: "开屏", name: "三合一非全屏", checked: false, dimensions: "1440 x 1938", splashGroup: "triple-nonfull" },
      { id: "my-f-1", app: "美颜", category: "焦点视窗", name: "焦点视窗", checked: false, dimensions: "1126 x 2436" },
      { id: "my-p-1", app: "美颜", category: "弹窗", name: "弹窗精图", checked: false, dimensions: "1080 x 1920" },
      { id: "my-ib-1", app: "美颜", category: "icon/banner", name: "百宝箱顶部banner", checked: false, dimensions: "1080 x 1920" },

      // wink
      { id: "wk-s-1", app: "wink", category: "开屏", name: "动态开屏", checked: false, dimensions: "1440 x 2340", splashGroup: "dynamic" },
      { id: "wk-s-5", app: "wink", category: "开屏", name: "气泡非全屏", checked: false, dimensions: "1440 x 1938", splashGroup: "nonfull" },
      { id: "wk-s-2", app: "wink", category: "开屏", name: "上下滑动全屏", checked: false, dimensions: "1440 x 2340", splashGroup: "slide" },
      { id: "wk-s-6", app: "wink", category: "开屏", name: "上下滑动非全屏", checked: false, dimensions: "1440 x 1938", splashGroup: "slide-nonfull" },
      { id: "wk-s-3", app: "wink", category: "开屏", name: "扭动全屏", checked: false, dimensions: "1440 x 2340", splashGroup: "twist" },
      { id: "wk-s-7", app: "wink", category: "开屏", name: "扭动非全屏", checked: false, dimensions: "1440 x 1938", splashGroup: "twist-nonfull" },
      { id: "wk-s-8", app: "wink", category: "开屏", name: "三合一全屏", checked: false, dimensions: "1440 x 2340", splashGroup: "triple" },
      { id: "wk-s-9", app: "wink", category: "开屏", name: "三合一非全屏", checked: false, dimensions: "1440 x 1938", splashGroup: "triple-nonfull" },
      { id: "wk-f-1", app: "wink", category: "焦点视窗", name: "焦点视窗", checked: false, dimensions: "1126 x 2436" }
    ];

    await writeJson(TEMPLATES_FILE, initialTemplates);
  }

  const creativeTemplates = await readJson(CREATIVE_TEMPLATES_FILE, null);
  if (!creativeTemplates) {
    await writeJson(CREATIVE_TEMPLATES_FILE, DEFAULT_CREATIVE_TEMPLATES);
  }

  const workflows = await readJson(WORKFLOWS_FILE, null);
  if (!workflows) {
    await writeJson(WORKFLOWS_FILE, []);
  }

  // NOTE: 初始化 AI 增强模式配置，默认关闭
  const settings = await readJson(SETTINGS_FILE, null);
  if (!settings) {
    await writeJson(SETTINGS_FILE, {
      aiEnhancedMode: false,
      aiProvider: "tongyi",
      tongyiApiKey: "",
      comfyuiUrl: "http://127.0.0.1:8188"
    });
  }

  const creativeSettings = await readJson(CREATIVE_SETTINGS_FILE, null);
  if (!creativeSettings) {
    await writeJson(CREATIVE_SETTINGS_FILE, {
      creativeTemplateSettings: settings?.creativeTemplateSettings || DEFAULT_CREATIVE_TEMPLATE_SETTINGS
    });
  }

  await ensureDir(MASKS_DIR);
  await ensureDir(WORKFLOWS_DIR);
  await ensureDir(BADGES_DIR);
}

// ---- Multer 上传：遮罩 PNG & Workflow JSON ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "mask") {
      cb(null, MASKS_DIR);
    } else if (file.fieldname === "workflow") {
      cb(null, WORKFLOWS_DIR);
    } else if (file.fieldname === "image") {
      cb(null, BADGES_DIR);
    } else {
      cb(null, STORAGE_DIR);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext);
    const safeBase = base.replace(/[^a-zA-Z0-9_\-]/g, "_");
    cb(null, `${Date.now()}_${safeBase}${ext || '.dat'}`);
  }
});

const upload = multer({ storage });

// ---- 初始化 Express 应用 ----
const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use("/static", express.static(STORAGE_DIR));

// 生产环境下静态服务 Vue/React 构建出来的 dist 目录
const DIST_DIR = path.join(ROOT_DIR, "dist");
app.use(express.static(DIST_DIR));

// ---- API：模版管理 ----
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", last_updated: "2026-02-25 10:35", feature: "png_transparency_v7_mtp1_text" });
});

app.get("/api/templates", async (req, res) => {
  const templates = await readJson(TEMPLATES_FILE, []);
  // NOTE: 动态合并使用次数，usage-stats.json 不受 git 更新影响
  const usageStats = await readJson(USAGE_STATS_FILE, {});
  // NOTE: 动态合并遇罩/角标路径，asset-overrides.json 不受 git 更新影响
  const assetOverrides = await readJson(ASSET_OVERRIDES_FILE, {});
  const merged = templates.map(t => ({
    ...t,
    ...(assetOverrides[t.id] || {}),
    processedCount: usageStats[t.id] ?? t.processedCount ?? 0
  }));
  res.json(merged);
});

app.put("/api/templates/:id", async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};

  const templates = await readJson(TEMPLATES_FILE, []);
  const index = templates.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Template not found" });
  }

  templates[index] = { ...templates[index], ...payload };
  await writeJson(TEMPLATES_FILE, templates);
  res.json(templates[index]);
});

app.post("/api/templates", async (req, res) => {
  const payload = req.body || {};
  if (!payload.id || !payload.name || !payload.app || !payload.category) {
    return res.status(400).json({ error: "id, name, app, category 为必填字段" });
  }


  const templates = await readJson(TEMPLATES_FILE, []);
  if (templates.some(t => t.id === payload.id)) {
    return res.status(409).json({ error: "Template id already exists" });
  }

  const template = {
    checked: false,
    dimensions: "1080 x 1920",
    ...payload
  };
  templates.push(template);
  await writeJson(TEMPLATES_FILE, templates);
  res.status(201).json(template);
});

// 模版排序
app.post("/api/templates/reorder", async (req, res) => {
  const { templates: newOrderTemplates } = req.body;
  if (!Array.isArray(newOrderTemplates)) {
    return res.status(400).json({ error: "Invalid templates array" });
  }

  // 简易实现：直接全量覆盖。为了安全起见，这里可以校验 ID 集合是否一致，但信任前端全量传回也没问题。
  await writeJson(TEMPLATES_FILE, newOrderTemplates);
  res.json({ success: true, count: newOrderTemplates.length });
});

// 模版使用次数递增（写入独立的 usage-stats.json，不修改 templates.json）
app.post("/api/templates/:id/increment", async (req, res) => {
  const { id } = req.params;
  const { visitorId = "anonymous", board = "standard" } = req.body || {};
  const templates = await readJson(TEMPLATES_FILE, []);
  const template = templates.find(t => t.id === id);
  if (!template) {
    return res.status(404).json({ error: "Template not found" });
  }

  // NOTE: 读写 usage-stats.json，确保次数跨版本持久化
  const usageStats = await readJson(USAGE_STATS_FILE, {});
  usageStats[id] = (usageStats[id] || 0) + 1;
  await writeJson(USAGE_STATS_FILE, usageStats);

  const analytics = await readJson(ANALYTICS_FILE, { days: {} });
  const day = ensureAnalyticsDay(analytics);
  day.generations += 1;
  if (visitorId && !day.visitors.includes(visitorId)) day.visitors.push(visitorId);
  day.templateUses[id] = {
    id,
    name: template.name,
    app: template.app,
    category: template.category,
    board,
    count: (day.templateUses[id]?.count || 0) + 1
  };
  await writeJson(ANALYTICS_FILE, analytics);

  res.json({ success: true, processedCount: usageStats[id] });
});

app.post("/api/analytics/visit", async (req, res) => {
  const { visitorId = "anonymous", board = "standard", path: pagePath = "/" } = req.body || {};
  const analytics = await readJson(ANALYTICS_FILE, { days: {} });
  const day = ensureAnalyticsDay(analytics);
  day.visits += 1;
  if (visitorId && !day.visitors.includes(visitorId)) day.visitors.push(visitorId);
  day.lastVisit = new Date().toISOString();
  day.lastBoard = board;
  day.lastPath = pagePath;
  await writeJson(ANALYTICS_FILE, analytics);
  res.json({ ok: true, summary: buildAnalyticsSummary(analytics) });
});

app.get("/api/analytics/summary", async (req, res) => {
  const analytics = await readJson(ANALYTICS_FILE, { days: {} });
  res.json(buildAnalyticsSummary(analytics));
});

// ---- API：创新形式素材看板模版管理 ----
app.get("/api/creative-templates", async (req, res) => {
  const templates = await readJson(CREATIVE_TEMPLATES_FILE, DEFAULT_CREATIVE_TEMPLATES);
  const defaultById = Object.fromEntries(DEFAULT_CREATIVE_TEMPLATES.map(t => [t.id, t]));
  const merged = templates.map(t => ({
    ...(defaultById[t.id] || {}),
    ...t
  }));
  res.json(merged);
});

app.put("/api/creative-templates/:id", async (req, res) => {
  const { id } = req.params;
  const payload = req.body || {};
  const templates = await readJson(CREATIVE_TEMPLATES_FILE, DEFAULT_CREATIVE_TEMPLATES);
  const index = templates.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Creative template not found" });
  }

  templates[index] = { ...templates[index], ...payload, id };
  await writeJson(CREATIVE_TEMPLATES_FILE, templates);
  res.json(templates[index]);
});

app.post("/api/creative-templates/:id/assets/:slot", upload.single("image"), async (req, res) => {
  const { id, slot } = req.params;
  const file = req.file;
  const slotToField = {
    interaction: "interaction_asset_path",
    crop: "crop_area_path",
    xiuxiu: "platform_xiuxiu_path",
    meiyan: "platform_meiyan_path",
    wink: "platform_wink_path"
  };
  const field = slotToField[slot];
  if (!field) {
    return res.status(400).json({ error: "Unknown creative asset slot" });
  }
  if (!file) {
    return res.status(400).json({ error: "缺少上传文件字段 'image'" });
  }

  const templates = await readJson(CREATIVE_TEMPLATES_FILE, DEFAULT_CREATIVE_TEMPLATES);
  const index = templates.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Creative template not found" });
  }

  const assetUrl = `/static/${path.relative(STORAGE_DIR, file.path).replace(/\\/g, "/")}`;
  templates[index] = {
    ...templates[index],
    [field]: assetUrl
  };
  await writeJson(CREATIVE_TEMPLATES_FILE, templates);
  res.json(templates[index]);
});

// 模版遮罩 PNG 上传 / 更新
app.post("/api/templates/:id/mask", upload.single("mask"), async (req, res) => {
  const { id } = req.params;
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "缺少上传文件字段 'mask'" });
  }

  const templates = await readJson(TEMPLATES_FILE, []);
  const index = templates.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Template not found" });
  }

  const relativePath = path.relative(ROOT_DIR, file.path).replace(/\\/g, "/");
  const maskUrl = `/static/${path.relative(STORAGE_DIR, file.path).replace(/\\/g, "/")}`;

  templates[index] = {
    ...templates[index],
    maskPath: relativePath,
    mask_path: maskUrl,
    maskUrl
  };
  await writeJson(TEMPLATES_FILE, templates);

  // NOTE: 同步写入 asset-overrides.json，确保路径跨版本持久化
  const assetOverrides = await readJson(ASSET_OVERRIDES_FILE, {});
  assetOverrides[id] = {
    ...(assetOverrides[id] || {}),
    maskPath: relativePath,
    mask_path: maskUrl,
    maskUrl
  };
  await writeJson(ASSET_OVERRIDES_FILE, assetOverrides);

  res.json(templates[index]);
});

// 模版裁剪区域 PNG 上传 (For Splash)
app.post("/api/templates/:id/crop-overlay", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "缺少上传文件字段 'image'" });
  }

  const templates = await readJson(TEMPLATES_FILE, []);
  const index = templates.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Template not found" });
  }

  const overlayUrl = `/static/${path.relative(STORAGE_DIR, file.path).replace(/\\/g, "/")}`;

  templates[index] = {
    ...templates[index],
    crop_overlay_path: overlayUrl
  };
  await writeJson(TEMPLATES_FILE, templates);

  // NOTE: 同步写入 asset-overrides.json
  const assetOverrides = await readJson(ASSET_OVERRIDES_FILE, {});
  assetOverrides[id] = {
    ...(assetOverrides[id] || {}),
    crop_overlay_path: overlayUrl
  };
  await writeJson(ASSET_OVERRIDES_FILE, assetOverrides);

  res.json(templates[index]);
});

// 模版广告角标 PNG 上传 (For Focal Window)
app.post("/api/templates/:id/badge-overlay", upload.single("image"), async (req, res) => {
  const { id } = req.params;
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "缺少上传文件字段 'image'" });
  }

  const templates = await readJson(TEMPLATES_FILE, []);
  const index = templates.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Template not found" });
  }

  // Use stable name for default badge: [id]_badge.[ext]
  const ext = path.extname(file.originalname) || ".png";
  const stableFilename = `${id}_badge${ext}`;
  const stablePath = path.join(BADGES_DIR, stableFilename);

  // Rename/Move from multer's temp name to stable name
  try {
    await fs.rename(file.path, stablePath);
  } catch (err) {
    console.error("Rename badge failed, fallback to original:", err);
  }

  const relativePath = `storage/badges/${stableFilename}`;
  const overlayUrl = `/static/badges/${stableFilename}`;

  templates[index] = {
    ...templates[index],
    badge_overlay_path: overlayUrl
  };
  await writeJson(TEMPLATES_FILE, templates);

  // NOTE: 同步写入 asset-overrides.json
  const assetOverridesB = await readJson(ASSET_OVERRIDES_FILE, {});
  assetOverridesB[id] = {
    ...(assetOverridesB[id] || {}),
    badge_overlay_path: overlayUrl
  };
  await writeJson(ASSET_OVERRIDES_FILE, assetOverridesB);

  res.json(templates[index]);
});

// ---- API：ComfyUI Workflow 管理 ----
// Workflow 结构：{ id, name, description?, filePath, templateId? }
app.get("/api/workflows", async (req, res) => {
  const workflows = await readJson(WORKFLOWS_FILE, []);
  res.json(workflows);
});

app.get("/api/workflows/:id", async (req, res) => {
  const { id } = req.params;
  const workflows = await readJson(WORKFLOWS_FILE, []);
  const wf = workflows.find(w => w.id === id);
  if (!wf) {
    return res.status(404).json({ error: "Workflow not found" });
  }
  res.json(wf);
});

app.post("/api/workflows", upload.single("workflow"), async (req, res) => {
  const { name, description, templateId } = req.body || {};
  const file = req.file;

  const finalName = name || (file ? file.originalname.replace(/\.[^/.]+$/, "") : "未命名工作流");

  if (!file) {
    return res.status(400).json({ error: "缺少上传文件字段 'workflow'" });
  }

  const workflows = await readJson(WORKFLOWS_FILE, []);
  const id = `wf_${Date.now()}`;
  const relativePath = path.relative(ROOT_DIR, file.path).replace(/\\/g, "/");

  const workflow = {
    id,
    name: finalName,
    description: description || "",
    filePath: relativePath,
    templateId: templateId || null,
    updatedAt: new Date().toISOString()
  };

  workflows.push(workflow);
  await writeJson(WORKFLOWS_FILE, workflows);
  res.status(201).json(workflow);
});

app.put("/api/workflows/:id", upload.single("workflow"), async (req, res) => {
  const { id } = req.params;
  const { name, description, templateId } = req.body || {};
  const file = req.file;

  const workflows = await readJson(WORKFLOWS_FILE, []);
  const index = workflows.findIndex(w => w.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Workflow not found" });
  }

  const current = workflows[index];
  let filePath = current.filePath;

  if (file) {
    filePath = path.relative(ROOT_DIR, file.path).replace(/\\/g, "/");
  }

  const updated = {
    ...current,
    name: name ?? current.name,
    description: description ?? current.description,
    templateId: templateId ?? current.templateId,
    filePath,
    updatedAt: new Date().toISOString()
  };

  workflows[index] = updated;
  await writeJson(WORKFLOWS_FILE, workflows);
  res.json(updated);
});

// ---- API：Gemini 颜色分析（后端代理），供前端调用 ----
let geminiClient = null;
if (GEMINI_API_KEY) {
  geminiClient = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
}

app.post("/api/analyze-image", async (req, res) => {
  try {
    if (!geminiClient) {
      return res.status(500).json({ error: "后端未配置 GEMINI_API_KEY" });
    }

    const { imageBase64 } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ error: "缺少字段 imageBase64" });
    }

    const response = await geminiClient.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: "image/jpeg",
              data: imageBase64
            }
          },
          {
            text: "Analyze this image and extract the primary dominant brand color (hex) and suggest a Material Symbol icon name that represents the main subject of the image (e.g., 'star', 'token', 'local_shipping', 'shopping_cart'). Return as JSON."
          }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            hexColor: { type: Type.STRING },
            iconName: { type: Type.STRING }
          },
          required: ["hexColor", "iconName"]
        }
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    res.json(parsed);
  } catch (err) {
    console.error("Gemini analyze-image failed:", err);
    res.status(500).json({ error: "Gemini 调用失败", fallback: { hexColor: "#2563EB", iconName: "star" } });
  }
});

// ---- API：ComfyUI 调用占位（可按需扩展）----
// ---- API：原始素材上传 (视频/图片) ----
app.post("/api/upload", upload.single("file"), async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "缺少上传文件" });
  }

  const relativePath = path.relative(ROOT_DIR, file.path).replace(/\\/g, "/");
  const url = `/static/${path.relative(STORAGE_DIR, file.path).replace(/\\/g, "/")}`;

  res.json({
    ok: true,
    path: relativePath,
    url
  });
});

// ---- API：ComfyUI 调用处理 ----
async function pollComfyUIResult(promptId) {
  const checkUrl = `${COMFYUI_BASE_URL}/history/${promptId}`;
  for (let i = 0; i < 60; i++) { // 最多等待 60 秒
    try {
      const resp = await axios.get(checkUrl);
      const history = resp.data[promptId];
      if (history && history.outputs) {
        return history.outputs;
      }
    } catch (e) {
      console.error("Polling ComfyUI failed:", e.message);
    }
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error("ComfyUI execution timeout");
}

app.post("/api/comfyui/generate", async (req, res) => {
  const { workflowId, params } = req.body || {};
  if (!workflowId) {
    return res.status(400).json({ error: "缺少 workflowId" });
  }

  const workflows = await readJson(WORKFLOWS_FILE, []);
  const wf = workflows.find(w => w.id === workflowId);
  if (!wf) {
    return res.status(404).json({ error: "Workflow not found" });
  }

  try {
    // 1. 读取工作流 JSON 内容
    const workflowPath = path.resolve(ROOT_DIR, wf.filePath);
    const workflowJson = await readJson(workflowPath, null);
    if (!workflowJson) throw new Error("Workflow file missing");

    // 2. 注入动态参数 (自动识别输入节点)
    const inputPath = params.inputPath ? path.resolve(ROOT_DIR, params.inputPath) : "";
    let foundInput = false;

    for (const nodeId in workflowJson) {
      const node = workflowJson[nodeId];
      // 支持 VHS_LoadVideo, LoadVideo, LoadImage 等常见节点
      if (node.class_type === "VHS_LoadVideo" || node.class_type === "LoadVideo") {
        node.inputs.video = inputPath;
        foundInput = true;
      } else if (node.class_type === "LoadImage") {
        node.inputs.image = inputPath;
        foundInput = true;
      }
    }

    if (!foundInput) {
      console.warn("Could not find suitable input node in workflow, sending as-is.");
    }

    // 3. 提交任务到 ComfyUI
    console.log(`[ComfyUI] Sending prompt to ${COMFYUI_BASE_URL}/prompt`);
    const promptResp = await axios.post(`${COMFYUI_BASE_URL}/prompt`, { prompt: workflowJson }, { timeout: 2000 });
    const promptId = promptResp.data.prompt_id;
    console.log(`[ComfyUI] Task created: ${promptId}`);

    // 4. 等待并获取结果
    const outputs = await pollComfyUIResult(promptId);

    // 5. 提取图片结果 (简单逻辑：取第一个输出节点的第一个图片)
    let resultUrl = "";
    for (const nodeId in outputs) {
      const nodeOutput = outputs[nodeId];
      if (nodeOutput.images && nodeOutput.images.length > 0) {
        const img = nodeOutput.images[0];
        // 构造 ComfyUI view 接口的 URL
        const rawUrl = `${COMFYUI_BASE_URL}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || "")}&type=${img.type || "output"}`;

        // Download to local storage to avoid CORS issues and enable processing
        try {
          const resp = await axios.get(rawUrl, { responseType: 'arraybuffer' });
          const ext = path.extname(img.filename) || ".png";
          const newFilename = `comfy_out_${Date.now()}${ext}`;
          const localPath = path.join(STORAGE_DIR, newFilename);

          await fs.writeFile(localPath, resp.data);
          resultUrl = `/static/${newFilename}`;
        } catch (downloadErr) {
          console.error("Failed to download ComfyUI result locally:", downloadErr);
          // Fallback to raw URL if download fails
          resultUrl = rawUrl;
        }
        break;
      }
    }

    if (!resultUrl) throw new Error("No image output found in workflow results");

    res.json({
      ok: true,
      resultUrl,
      message: "ComfyUI 工作流执成功"
    });

  } catch (err) {
    console.error("ComfyUI execution failed:", err.message);
    res.status(500).json({
      error: "ComfyUI 执行失败",
      details: err.message,
      message: "请确保 ComfyUI 已在本地启动 (默认 http://127.0.0.1:8188) 且已安装对应节点库 (如 VHS)。"
    });
  }
});

// ---- API: 焦点视窗广告生成 ----
app.post("/api/focal-window/generate", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "缺少上传图片" });
    }

    // 读取上传的图片
    const imageBuffer = await fs.readFile(file.path);
    const imageBase64 = imageBuffer.toString('base64');

    // 读取4个PNG图层
    const iconBgBuffer = await fs.readFile(path.join(__dirname, "templates", "focal_window_icon_bg.png"));
    const gradientBuffer = await fs.readFile(path.join(__dirname, "templates", "focal_window_gradient.png"));
    const fixedBg1Buffer = await fs.readFile(path.join(__dirname, "templates", "focal_window_fixed_1.png"));
    const fixedBg2Buffer = await fs.readFile(path.join(__dirname, "templates", "focal_window_fixed_2.png"));

    const iconBgBase64 = iconBgBuffer.toString('base64');
    const gradientBase64 = gradientBuffer.toString('base64');
    const fixedBg1Base64 = fixedBg1Buffer.toString('base64');
    const fixedBg2Base64 = fixedBg2Buffer.toString('base64');

    // 提取底部颜色 (简化版本,使用Gemini)
    let extractedColor = "#FF6B6B";
    if (geminiClient) {
      try {
        const colorResponse = await geminiClient.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: imageBase64
                }
              },
              {
                text: "Extract the dominant color from the bottom 20% of this image. Return only the hex color code in JSON format."
              }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                hexColor: { type: Type.STRING }
              },
              required: ["hexColor"]
            }
          }
        });
        const parsed = JSON.parse(colorResponse.text || "{}");
        extractedColor = parsed.hexColor || extractedColor;
      } catch (err) {
        console.error("颜色提取失败,使用默认颜色:", err);
      }
    }

    // 读取SVG模版
    const svgTemplate = await fs.readFile(path.join(__dirname, "templates", "focal_window.svg"), "utf-8");

    // 替换SVG中的占位符
    const finalSvg = svgTemplate
      .replace(/{user_image_base64}/g, imageBase64)
      .replace(/{user_image_height}/g, "800")
      .replace(/{icon_bg_base64}/g, iconBgBase64)
      .replace(/{gradient_base64}/g, gradientBase64)
      .replace(/{fixed_bg_1_base64}/g, fixedBg1Base64)
      .replace(/{fixed_bg_2_base64}/g, fixedBg2Base64)
      .replace(/{icon_color}/g, extractedColor)
      .replace(/{gradient_color}/g, extractedColor);

    // 保存生成的SVG
    const outputFilename = `focal_window_${Date.now()}.svg`;
    const outputPath = path.join(STORAGE_DIR, outputFilename);
    await fs.writeFile(outputPath, finalSvg, "utf-8");

    const svgUrl = `/static/${outputFilename}`;

    res.json({
      ok: true,
      svgUrl,
      extractedColor,
      message: "焦点视窗广告生成成功"
    });
  } catch (err) {
    console.error("焦点视窗生成失败:", err);
    res.status(500).json({ error: "生成失败", details: err.message });
  }
});



// ---- API: 系统设置（AI 增强模式开关）----
app.get("/api/settings", async (req, res) => {
  const settings = await readJson(SETTINGS_FILE, {
    aiEnhancedMode: false,
    aiProvider: "tongyi",
    tongyiApiKey: "",
    roboneoApiKey: "",
    roboneoApiSecret: "",
    nanobannerApiKey: "",
    nanobannerBaseUrl: "",
    comfyuiUrl: "http://127.0.0.1:8188"
  });
  // NOTE: 为安全起见，返回时遮盖 API Key 的实际内容（只显示是否已配置）
  res.json({
    ...settings,
    tongyiApiKey: settings.tongyiApiKey ? "***configured***" : "",
    tongyiApiKeyConfigured: !!settings.tongyiApiKey,
    roboneoApiKey: settings.roboneoApiKey ? "***configured***" : "",
    roboneoApiSecret: settings.roboneoApiSecret ? "***configured***" : "",
    roboneoApiKeyConfigured: !!settings.roboneoApiKey,
    nanobannerApiKey: settings.nanobannerApiKey ? "***configured***" : "",
    nanobannerBaseUrl: settings.nanobannerBaseUrl ? "***configured***" : "",
    nanobannerApiKeyConfigured: !!settings.nanobannerApiKey
  });
});

app.put("/api/settings", async (req, res) => {
  const payload = req.body || {};
  const current = await readJson(SETTINGS_FILE, {
    aiEnhancedMode: false,
    aiProvider: "tongyi",
    tongyiApiKey: "",
    roboneoApiKey: "",
    roboneoApiSecret: "",
    nanobannerApiKey: "",
    nanobannerBaseUrl: "",
    comfyuiUrl: "http://127.0.0.1:8188"
  });

  // NOTE: 如果前端传来 "***configured***" 说明用户没改 key，保持原值
  if (payload.tongyiApiKey === "***configured***") {
    payload.tongyiApiKey = current.tongyiApiKey;
  }
  if (payload.roboneoApiKey === "***configured***") {
    payload.roboneoApiKey = current.roboneoApiKey;
  }
  if (payload.roboneoApiSecret === "***configured***") {
    payload.roboneoApiSecret = current.roboneoApiSecret;
  }
  if (payload.nanobannerApiKey === "***configured***") {
    payload.nanobannerApiKey = current.nanobannerApiKey;
  }
  if (payload.nanobannerBaseUrl === "***configured***") {
    payload.nanobannerBaseUrl = current.nanobannerBaseUrl;
  }

  const updated = {
    ...current,
    ...payload
  };
  delete updated.creativeTemplateSettings;
  await writeJson(SETTINGS_FILE, updated);
  res.json({ success: true });
});

// ---- API: 创新形式素材看板后台配置 ----
app.get("/api/creative-settings", async (req, res) => {
  const settings = await readJson(CREATIVE_SETTINGS_FILE, {
    creativeTemplateSettings: DEFAULT_CREATIVE_TEMPLATE_SETTINGS
  });

  res.json({
    creativeTemplateSettings: {
      ...DEFAULT_CREATIVE_TEMPLATE_SETTINGS,
      ...(settings.creativeTemplateSettings || {})
    }
  });
});

app.put("/api/creative-settings", async (req, res) => {
  const payload = req.body || {};
  const current = await readJson(CREATIVE_SETTINGS_FILE, {
    creativeTemplateSettings: DEFAULT_CREATIVE_TEMPLATE_SETTINGS
  });

  const updated = {
    ...current,
    creativeTemplateSettings: {
      ...DEFAULT_CREATIVE_TEMPLATE_SETTINGS,
      ...(current.creativeTemplateSettings || {}),
      ...(payload.creativeTemplateSettings || {})
    }
  };

  await writeJson(CREATIVE_SETTINGS_FILE, updated);
  res.json({ success: true });
});


// ---- 通义万象辅助函数 ----

/**
 * 调用通义万象通用图像编辑 2.1 (wanx2.1-imageedit) 进行扩图
 * 官方文档: https://help.aliyun.com/zh/model-studio/wanx-image-edit
 * 计费: ¥0.14/张
 * 优势: 支持 Prompt 引导背景风格、四方向独立比例、直接 base64 传图（无需 OSS 上传）
 *
 * @param {string} inputImagePath - 本地图片路径
 * @param {number} targetWidth - 目标宽度（像素）
 * @param {number} targetHeight - 目标高度（像素）
 * @param {string} apiKey - DashScope API Key
 * @returns {Promise<{url: string, width: number, height: number, size: number}>}
 */
async function tongyiOutpaint(inputImagePath, targetWidth, targetHeight, apiKey, customPrompt = "") {
  const sharpLib = sharp;  // 使用顶层已导入的 sharp


  // Step 1: 读取原图元数据
  let srcWidth, srcHeight;
  try {
    const meta = await sharpLib(inputImagePath).metadata();
    srcWidth = meta.width || 1080;
    srcHeight = meta.height || 1080;
  } catch (e) {
    srcWidth = 1080; srcHeight = 1080;
    console.warn('[TongyiOutpaint] 无法读取图片尺寸，使用估算值:', e.message);
  }

  // Step 2: 预处理图片，确保满足 API 要求
  // NOTE: wanx2.1-imageedit 要求输入图片宽高均 ≥ 512px，且扩图比例 ≤ 2.0
  // 若不满足，先用 sharp 预放大图片，再调用 API
  let processedImagePath = inputImagePath;
  const rawXScale = targetWidth / srcWidth;
  const rawYScale = targetHeight / srcHeight;
  const needsPreUpscale = srcWidth < 512 || srcHeight < 512 || rawXScale > 2.0 || rawYScale > 2.0;

  if (needsPreUpscale) {
    // 计算预放大目标：让扩图比例尽量控制在 2.0 以内同时满足最小尺寸 512px
    const preWidth = Math.max(512, Math.ceil(targetWidth / 2));
    const preHeight = Math.max(512, Math.ceil(targetHeight / 2));
    const preFilename = `tongyi_pre_${Date.now()}.jpg`;
    const prePath = path.join(STORAGE_DIR, preFilename);

    console.log(`[TongyiOutpaint] 预处理: 原图 ${srcWidth}x${srcHeight} 预放大至 ${preWidth}x${preHeight}（满足 API 最小尺寸和比例要求）`);
    await sharpLib(inputImagePath)
      .resize({ width: preWidth, height: preHeight, fit: 'fill', kernel: sharpLib.kernel.lanczos3 })
      .jpeg({ quality: 95 })
      .toFile(prePath);

    processedImagePath = prePath;
    srcWidth = preWidth;
    srcHeight = preHeight;
  }

  // Step 3: 读取图片为 base64（用预处理后的图片）
  // NOTE: wanx2.1-imageedit 支持 base64 直接传参，无需上传到 OSS
  const imageBuffer = await fs.readFile(processedImagePath);
  const ext = path.extname(processedImagePath).toLowerCase();
  const mimeType = ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg');
  const base64Image = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;

  // 清理临时预处理文件
  if (processedImagePath !== inputImagePath) {
    fs.unlink(processedImagePath).catch(() => { });
  }

  // Step 4: 计算扩图比例，钳位到 API 允许范围 [1.0, 2.0]
  const calcXScale = targetWidth / srcWidth;
  const calcYScale = targetHeight / srcHeight;
  const xScale = Math.min(Math.max(parseFloat(calcXScale.toFixed(4)), 1.0), 2.0);
  const yScale = Math.min(Math.max(parseFloat(calcYScale.toFixed(4)), 1.0), 2.0);
  console.log(`[TongyiOutpaint] 原图 ${srcWidth}x${srcHeight} → 目标 ${targetWidth}x${targetHeight}，扩图比例 x=${xScale}, y=${yScale}`);

  const defaultPrompt = "专业广告摄影风格，画面延伸自然，背景与主体融合协调，高清细腻";
  const finalPrompt = customPrompt?.trim() ? customPrompt.trim() : defaultPrompt;
  console.log(`[TongyiOutpaint] 使用 Prompt: ${finalPrompt}`);

  // Step 3: 调用 wanx2.1-imageedit expand 接口
  const requestBody = {
    model: "wanx2.1-imageedit",
    input: {
      function: "expand",
      // NOTE: Prompt 引导扩展后的背景风格，提升广告素材质量
      prompt: finalPrompt,
      base_image_url: base64Image
    },
    parameters: {
      // NOTE: 四方向统一使用相同比例（图片居中扩展），将来可按模板方向差异化配置
      top_scale: yScale,
      bottom_scale: yScale,
      left_scale: xScale,
      right_scale: xScale,
      n: 1,
      watermark: false
    }
  };

  console.log(`[TongyiOutpaint] 提交 wanx2.1-imageedit expand 任务...`);
  const submitResponse = await axios.post(
    "https://dashscope.aliyuncs.com/api/v1/services/aigc/image2image/image-synthesis",
    requestBody,
    {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // NOTE: 图像处理耗时较长，必须启用异步模式
        "X-DashScope-Async": "enable"
      },
      timeout: 30000
    }
  );

  const taskId = submitResponse.data?.output?.task_id;
  if (!taskId) {
    throw new Error(`[TongyiOutpaint] 未获取到 task_id: ${JSON.stringify(submitResponse.data)}`);
  }
  console.log(`[TongyiOutpaint] 任务已提交: ${taskId}，轮询结果中...`);

  // Step 4: 轮询任务状态，最多等待 120 秒
  const maxWait = 120000;
  const pollInterval = 3000;
  const startTime = Date.now();

  while (Date.now() - startTime < maxWait) {
    await new Promise(r => setTimeout(r, pollInterval));

    const statusResponse = await axios.get(
      `https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`,
      {
        headers: { "Authorization": `Bearer ${apiKey}` },
        timeout: 15000
      }
    );

    const taskStatus = statusResponse.data?.output?.task_status;
    console.log(`[TongyiOutpaint] Task ${taskId} status: ${taskStatus}`);

    if (taskStatus === "SUCCEEDED") {
      // NOTE: wanx2.1-imageedit 的结果在 output.results[0].url（与 image-out-painting 不同）
      const outputUrl = statusResponse.data?.output?.results?.[0]?.url;
      if (!outputUrl) {
        throw new Error(`[TongyiOutpaint] 结果中无图片 URL: ${JSON.stringify(statusResponse.data?.output)}`);
      }

      // Step 5: 下载结果图并保存到本地
      console.log(`[TongyiOutpaint] 下载结果图: ${outputUrl}`);
      const imgResponse = await axios.get(outputUrl, { responseType: "arraybuffer", timeout: 60000 });
      const outputFilename = `tongyi_outpaint_${Date.now()}.png`;
      const outputPath = path.join(STORAGE_DIR, outputFilename);
      await fs.writeFile(outputPath, Buffer.from(imgResponse.data));

      console.log(`[TongyiOutpaint] 完成！已保存至 ${outputPath}`);
      return {
        url: `/static/${outputFilename}`,
        width: targetWidth,
        height: targetHeight,
        size: imgResponse.data.byteLength
      };

    } else if (taskStatus === "FAILED") {
      const errInfo = statusResponse.data?.output;
      throw new Error(`[TongyiOutpaint] 任务失败: code=${errInfo?.code}, message=${errInfo?.message}`);
    }
    // PENDING / RUNNING 继续等待
  }

  throw new Error(`[TongyiOutpaint] 超时：任务 ${taskId} 在 ${maxWait / 1000} 秒内未完成`);
}

/**
 * 调用美图 RoboNeo (MiracleVision) 进行智能扩图
 * 官方文档: https://ai.meitu.com/ (画面扩展/智能扩图)
 *
 * @param {string} inputImagePath - 本地图片路径
 * @param {number} targetWidth - 目标宽度
 * @param {number} targetHeight - 目标高度
 * @param {string} apiKey - App Key
 * @param {string} apiSecret - App Secret
 * @param {string} customPrompt - 可选 Prompt
 */
async function roboneoOutpaint(inputImagePath, targetWidth, targetHeight, apiKey, apiSecret, customPrompt = "") {
  try {
    // 1. 读取并转 base64
    const imageBuffer = await fs.readFile(inputImagePath);
    const base64Data = imageBuffer.toString("base64");
    const ext = path.extname(inputImagePath).substring(1).toLowerCase() || "jpg";

    // 2. 构造请求
    // NOTE: 使用美图 AI 开放平台标准扩图接口
    const apiURL = "https://openapi.mtlab.meitu.com/v1/image_expansion";

    const payload = {
      api_key: apiKey,
      api_secret: apiSecret,
      media_info_list: [
        {
          media_data: base64Data,
          media_profiles: {
            media_data_type: (ext === "png" || ext === "webp") ? ext : "jpg"
          }
        }
      ],
      parameter: {
        rsp_media_type: "jpg",
        target_width: targetWidth,
        target_height: targetHeight,
        // RoboNeo 支持 Prompt 引导背景生成
        prompt: customPrompt || "自然扩展背景，高清质量，环境融合"
      }
    };

    console.log(`[RoboNeoOutpaint] 正在调用美图 API: ${targetWidth}x${targetHeight}...`);
    const response = await axios.post(apiURL, payload, { timeout: 60000 });
    const data = response.data;

    // 3. 结果处理
    if (data.media_info_list && data.media_info_list[0]?.media_data) {
      const outBuffer = Buffer.from(data.media_info_list[0].media_data, "base64");
      const outFilename = `roboneo_out_${Date.now()}.jpg`;
      const outPath = path.join(STORAGE_DIR, outFilename);
      await fs.writeFile(outPath, outBuffer);

      console.log(`[RoboNeoOutpaint] 完成! 已保存至 ${outPath}`);
      return {
        url: `/static/${outFilename}`,
        width: targetWidth,
        height: targetHeight,
        size: outBuffer.byteLength
      };
    } else {
      const errorMsg = data.error_message || data.msg || JSON.stringify(data);
      throw new Error(`美图 RoboNeo API 响应异常: ${errorMsg}`);
    }
  } catch (err) {
    if (err.response) {
      console.error("[RoboNeoOutpaint] 接口报错:", err.response.data);
      throw new Error(`美图 API 报错: ${err.response.data.error_message || err.response.statusText}`);
    }
  }
}

/**
 * 使用 Nano Banner (兼容 OpenAI 格式) 进行生成式扩图/生成
 */
async function nanobannerOutpaint(inputImagePath, targetWidth, targetHeight, apiKey, baseUrl, customPrompt = "") {
  try {
    console.log(`[NanoBanner] 开始处理: ${targetWidth}x${targetHeight}...`);
    if (!baseUrl) {
      baseUrl = "https://api.openai.com/v1";
    }
    baseUrl = baseUrl.replace(/\/$/, "");
    const apiEndpoint = `${baseUrl}/chat/completions`;

    // 1. 读取原图做 base64 组合
    const inputExt = path.extname(inputImagePath).toLowerCase();
    const mimeType = inputExt === '.png' ? 'image/png' : 'image/jpeg';
    const inputBuffer = await fs.readFile(inputImagePath);
    const inputBase64 = inputBuffer.toString('base64');
    const imageUri = `data:${mimeType};base64,${inputBase64}`;

    // 2. 组装请求指令
    const extendPrompt = `请根据这张图片进行自然无缝向外扩充延展，生成 ${targetWidth}x${targetHeight} 等比例的完整图像。主体保持不变与居中。${customPrompt}`;

    // NOTE: 对于此类高级代理商，将图片作为 vision 发到 chat/completions 会通过底层映射触发他们的特定修图工作流
    const payload = {
      model: "gemini-3.1-flash-image-preview", // 适用 laozhang.ai 映射环境
      messages: [{
        role: "user",
        content: [
          { type: "text", text: extendPrompt },
          { type: "image_url", image_url: { url: imageUri } }
        ]
      }]
    };

    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    };

    console.log(`[NanoBanner] 发起图生图合并请求到: ${apiEndpoint}`);
    // 允许大底图的长连接时长
    const submitResp = await axios.post(apiEndpoint, payload, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000
    });

    const contentReturn = submitResp.data?.choices?.[0]?.message?.content;
    if (!contentReturn) {
      throw new Error(`无文本结果返回: ${JSON.stringify(submitResp.data).substring(0, 200)}`);
    }

    // 3. 从 Markdown 返回值提取图片（第三方中转站通常在 Markdown 里返回 data:image 或 URL）
    const base64Match = contentReturn.match(/data:image\/[^;]+;base64,([^\)]+)/);
    const urlMatch = contentReturn.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/);

    let imgBuffer;
    if (base64Match && base64Match[1]) {
      imgBuffer = Buffer.from(base64Match[1], 'base64');
    } else if (urlMatch && urlMatch[1]) {
      const imgResponse = await axios.get(urlMatch[1], { responseType: "arraybuffer", timeout: 60000 });
      imgBuffer = Buffer.from(imgResponse.data);
    } else {
      console.warn("[NanoBanner] 找不到 Markdown 图片正则匹配，打印原文：", contentReturn.substring(0, 200));
      throw new Error("未能从其返回值中提取到生成后的图片数据");
    }

    // 4. 保存文件并输出
    const outFilename = `nanobanner_edit_${Date.now()}.jpg`;
    const outPath = path.join(STORAGE_DIR, outFilename);
    await fs.writeFile(outPath, imgBuffer);

    return {
      url: `/static/${outFilename}`,
      width: targetWidth,
      height: targetHeight,
      size: imgBuffer.length
    };

  } catch (err) {
    console.error("[NanoBanner] 错误:", err.response?.data || err.message);
    throw new Error(`Nano Banner 错误: ${err.response?.data?.error?.message || err.response?.data?.message || err.message}`);
  }
}

function extractImageCandidateFromText(contentReturn = "") {
  const dataUriMatch = contentReturn.match(/data:image\/[^;]+;base64,([A-Za-z0-9+/=\r\n]+)/);
  if (dataUriMatch?.[1]) {
    return { type: "base64", value: dataUriMatch[1].replace(/\s/g, "") };
  }

  const markdownUrlMatch = contentReturn.match(/!\[.*?\]\((https?:\/\/[^\)]+)\)/);
  if (markdownUrlMatch?.[1]) {
    return { type: "url", value: markdownUrlMatch[1] };
  }

  const plainUrlMatch = contentReturn.match(/https?:\/\/[^\s"'<>]+\.(?:png|jpg|jpeg|webp)(?:\?[^\s"'<>]+)?/i);
  if (plainUrlMatch?.[0]) {
    return { type: "url", value: plainUrlMatch[0] };
  }

  return null;
}

async function nanobannerTextToPendant(prompt, apiKey, baseUrl) {
  if (!baseUrl || baseUrl === "***configured***" || /^sk-[A-Za-z0-9_-]+$/.test(String(baseUrl).trim())) {
    baseUrl = "https://api.openai.com/v1";
  }
  baseUrl = baseUrl.replace(/\/$/, "");

  const apiEndpoint = `${baseUrl}/chat/completions`;
  const finalPrompt = [
    "生成一个广告开屏挂件素材。",
    "硬性要求：1:1 正方形，最终可处理为 450x450px PNG；主体居中；适合叠加在 1440x2340 开屏视频上；边缘干净；不要文字水印；尽量透明背景或纯色易抠背景。",
    `用户想法：${prompt || "炫动开屏挂件"}`
  ].join("\n");

  const payload = {
    model: "gemini-3.1-flash-image-preview",
    messages: [{
      role: "user",
      content: [{ type: "text", text: finalPrompt }]
    }]
  };

  const submitResp = await axios.post(apiEndpoint, payload, {
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 120000
  });

  const rawContent = submitResp.data?.choices?.[0]?.message?.content;
  const contentReturn = Array.isArray(rawContent)
    ? rawContent.map((item) => item?.text || item?.image_url?.url || "").join("\n")
    : String(rawContent || "");
  const candidate = extractImageCandidateFromText(contentReturn);
  if (!candidate) {
    throw new Error("AI 返回中未找到图片结果");
  }

  let imgBuffer;
  if (candidate.type === "base64") {
    imgBuffer = Buffer.from(candidate.value, "base64");
  } else {
    const imgResponse = await axios.get(candidate.value, { responseType: "arraybuffer", timeout: 60000 });
    imgBuffer = Buffer.from(imgResponse.data);
  }

  const outFilename = `dynamic_pendant_ai_${Date.now()}.png`;
  const outPath = path.join(STORAGE_DIR, outFilename);
  await sharp(imgBuffer)
    .resize(450, 450, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png()
    .toFile(outPath);

  const stats = await fs.stat(outPath);
  return {
    url: `/static/${outFilename}`,
    width: 450,
    height: 450,
    size: stats.size
  };
}

app.post("/api/creative/dynamic-splash/pendant", async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    const settings = await readJson(SETTINGS_FILE, {
      aiEnhancedMode: false,
      aiProvider: "nanobanner",
      nanobannerApiKey: "",
      nanobannerBaseUrl: ""
    });

    if (!settings.nanobannerApiKey) {
      return res.status(400).json({ error: "请先在后台看板管理中配置 Nano Banner API Key" });
    }

    const result = await nanobannerTextToPendant(prompt, settings.nanobannerApiKey, settings.nanobannerBaseUrl);
    return res.json({
      ok: true,
      provider: "nanobanner",
      url: result.url,
      message: "AI 已生成 PNG 450 x 450 挂件素材",
      size: result.size
    });
  } catch (err) {
    console.error("[DynamicSplashPendant] AI generation failed:", err.response?.data || err.message);
    const status = err.response?.status;
    if (status === 401 || status === 403) {
      return res.status(status).json({
        error: "Nano Banner 鉴权失败，请检查 API Key 是否有效，以及 API Base URL 是否填写为服务商提供的接口地址（不要填写成 API Key）"
      });
    }
    return res.status(500).json({ error: err.response?.data?.error?.message || err.response?.data?.message || err.message || "AI 挂件生成失败" });
  }
});

/**
 * [已弃用，保留为备用]
 * 上传本地图片到百炼临时存储，获取可公网访问的 oss:// URL
 * NOTE: wanx2.1-imageedit 已支持 base64，此函数不再主动使用
 * 保留以备 image-out-painting 等不支持 base64 的模型使用
 */
async function uploadImageToBailianStorage(imagePath, apiKey) {
  const FormData = (await import('form-data')).default;
  const filename = path.basename(imagePath);
  const ext = path.extname(filename).toLowerCase();

  // Step 1: 获取 OSS 上传凭证
  console.log(`[TongyiUpload] 获取上传凭证: ${filename}`);
  const policyResp = await axios.get(
    `https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=image-out-painting`,
    {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 15000
    }
  );

  const ossData = policyResp.data?.data;
  if (!ossData?.upload_host || !ossData?.policy) {
    throw new Error(`[TongyiUpload] 获取上传凭证失败: ${JSON.stringify(policyResp.data)}`);
  }

  const ossKey = `${ossData.upload_dir}/${filename}`;

  // Step 2: 上传图片到 OSS 临时存储
  console.log(`[TongyiUpload] 上传中: ${ossKey}`);
  const imageBuffer = await fs.readFile(imagePath);
  const formData = new FormData();
  formData.append('OSSAccessKeyId', ossData.oss_access_key_id);
  formData.append('policy', ossData.policy);
  formData.append('Signature', ossData.signature);
  formData.append('x-oss-object-acl', ossData.x_oss_object_acl);
  formData.append('x-oss-forbid-overwrite', ossData.x_oss_forbid_overwrite);
  formData.append('key', ossKey);
  formData.append('success_action_status', '200');
  // NOTE: file 字段必须是最后一个
  formData.append('file', imageBuffer, {
    filename,
    contentType: ext === '.png' ? 'image/png' : (ext === '.webp' ? 'image/webp' : 'image/jpeg')
  });

  await axios.post(ossData.upload_host, formData, {
    headers: formData.getHeaders(),
    timeout: 60000,
    maxBodyLength: Infinity
  });

  // Step 3: 拼接最终 oss:// URL（有效期 48 小时）
  const ossUrl = `oss://${ossKey}`;
  console.log(`[TongyiUpload] 上传成功: ${ossUrl}`);
  return ossUrl;
}



// ---- API: 通义万象连通性测试 ----
// NOTE: 提供独立的测试接口，方便用户在 Admin 面板验证 API Key 是否正确配置
app.post("/api/tongyi/test", async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, { tongyiApiKey: "" });
    const apiKey = req.body?.apiKey || settings.tongyiApiKey;

    if (!apiKey || apiKey === "***configured***") {
      return res.status(400).json({ ok: false, error: "未配置 DashScope API Key" });
    }

    // NOTE: 用获取上传凭证接口测试 API Key 有效性（轻量，无计费）
    const testResp = await axios.get(
      `https://dashscope.aliyuncs.com/api/v1/uploads?action=getPolicy&model=wanx2.1-imageedit`,
      {
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 10000
      }
    );

    if (testResp.data?.data?.upload_host) {
      return res.json({
        ok: true,
        message: "API Key 验证成功，通义万象服务连接正常",
        quota: testResp.data?.data?.capacity_limit_mb ? `每日上传配额 ${testResp.data.data.capacity_limit_mb}MB` : null
      });
    } else {
      return res.status(400).json({ ok: false, error: "API 响应异常", details: testResp.data });
    }
  } catch (err) {
    const status = err.response?.status;
    const errMsg = err.response?.data?.message || err.message;
    if (status === 401) {
      return res.status(401).json({ ok: false, error: "API Key 无效或已过期，请检查后重试" });
    }
    console.error("[TongyiTest] 连通性测试失败:", err.message);
    return res.status(500).json({ ok: false, error: `连接失败: ${errMsg}` });
  }
});


app.post("/api/roboneo/test", async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, { roboneoApiKey: "", roboneoApiSecret: "" });
    const apiKey = req.body?.apiKey || settings.roboneoApiKey;
    const apiSecret = req.body?.apiSecret || settings.roboneoApiSecret;

    if (!apiKey || apiKey === "***configured***" || !apiSecret || apiSecret === "***configured***") {
      return res.status(400).json({ ok: false, error: "未配置 Meitu App Key 或 App Secret" });
    }

    try {
      await axios.post("https://openapi.mtlab.meitu.com/v1/image_expansion", {
        api_key: apiKey,
        api_secret: apiSecret,
        media_info_list: []
      }, { timeout: 10000 });
    } catch (apiErr) {
      const status = apiErr.response?.status;
      const data = apiErr.response?.data;
      if (status === 401 || status === 403 || data?.error_code === 10001) {
        return res.status(status || 401).json({ ok: false, error: "App Key 或 App Secret 无效" });
      }
      if (data && (data.error_code || data.msg)) {
        return res.json({ ok: true, message: "美图 RoboNeo 身份认证成功，服务连接正常" });
      }
    }
    return res.json({ ok: true, message: "美图 RoboNeo 连通性测试通过" });
  } catch (err) {
    console.error("[RoboNeoTest] 连通性测试失败:", err.message);
    return res.status(500).json({ ok: false, error: `连接失败: ${err.message}` });
  }
});


app.post("/api/nanobanner/test", async (req, res) => {
  try {
    const settings = await readJson(SETTINGS_FILE, { nanobannerApiKey: "", nanobannerBaseUrl: "" });
    const apiKey = req.body?.apiKey || settings.nanobannerApiKey;
    let baseUrl = req.body?.baseUrl || settings.nanobannerBaseUrl;

    if (!apiKey || apiKey === "***configured***") {
      return res.status(400).json({ ok: false, error: "未配置 Nano Banner API Key" });
    }

    if (!baseUrl || baseUrl === "***configured***") {
      baseUrl = "https://api.openai.com/v1";
    }
    baseUrl = baseUrl.replace(/\/$/, "");

    // 简单测试连通性，常见中转站点可以请求 /models 接口
    const tokenResp = await axios.get(`${baseUrl}/models`, {
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      timeout: 10000
    });

    if (tokenResp.status === 200) {
      return res.json({ ok: true, message: "Nano Banner API 测试成功，接口通畅" });
    } else {
      return res.status(400).json({ ok: false, error: "身份认证失败：接口未返回 200 OK" });
    }
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;
    console.error("[NanoBannerTest] 连通性测试失败:", err.message);
    if (status === 401 || status === 403) {
      return res.status(401).json({ ok: false, error: "API Key 无效或无权限", details: data });
    }
    return res.status(500).json({ ok: false, error: `连接失败: ${err.message}` });
  }
});


// ---- API: Composite Video (FFmpeg) ----
app.post("/api/composite-video", upload.fields([{ name: "video", maxCount: 1 }, { name: "bgImage", maxCount: 1 }, { name: "fgImage", maxCount: 1 }]), async (req, res) => {
  try {
    const videoFile = req.files?.video?.[0];
    if (!videoFile) return res.status(400).json({ error: "Missing video file" });

    const bgImage = req.files?.bgImage?.[0];
    const fgImage = req.files?.fgImage?.[0];

    const paramsStr = req.body.params;
    if (!paramsStr) return res.status(400).json({ error: "Missing params" });
    const params = JSON.parse(paramsStr);

    const outputFilename = `video_composite_${Date.now()}.mp4`;
    const outputPath = path.join(STORAGE_DIR, outputFilename);

    const maxSizeMB = Number(params.maxSizeMB) > 0 ? Number(params.maxSizeMB) : undefined;
    const maxDurationSec = Number(params.maxDurationSec) > 0 ? Number(params.maxDurationSec) : undefined;
    console.log(`[VideoComposite] Starting FFmpeg process for ${videoFile.originalname}... target: ${params.targetW}x${params.targetH}${maxSizeMB ? `, max ${maxSizeMB}MB` : ""}${maxDurationSec ? `, trim ${maxDurationSec}s` : ""}`);

    await compressAndCompositeVideo(
      videoFile.path,
      params.targetW,
      params.targetH,
      params.videoRect,
      bgImage?.path,
      fgImage?.path,
      outputPath,
      { maxSizeMB, maxDurationSec }
    );

    const outputStats = await fs.stat(outputPath);
    console.log(`[VideoComposite] FFmpeg success: ${outputPath} (${(outputStats.size / 1024 / 1024).toFixed(2)}MB)`);

    // Clean up temp uploads
    fs.unlink(videoFile.path).catch(() => { });
    if (bgImage) fs.unlink(bgImage.path).catch(() => { });
    if (fgImage) fs.unlink(fgImage.path).catch(() => { });

    return res.json({
      ok: true,
      url: `/static/${outputFilename}`,
      sizeMB: Number((outputStats.size / 1024 / 1024).toFixed(2))
    });
  } catch (err) {
    console.error("[VideoComposite] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---- API: Smart Crop & Compress (不依赖 ComfyUI) ----
app.post("/api/smart-crop", upload.single("image"), async (req, res) => {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: "缺少上传图片" });
    }

    const { width, height, maxSizeKB } = req.body || {};
    const targetWidth = parseInt(width) || 1440;
    const targetHeight = parseInt(height) || 2340;
    const limitKB = parseInt(maxSizeKB) || 200;

    // NOTE: 检查 AI 增强模式开关，如果开启则路由到对应 AI 服务
    const settings = await readJson(SETTINGS_FILE, {
      aiEnhancedMode: false,
      aiProvider: "tongyi",
      tongyiApiKey: "",
      roboneoApiKey: "",
      roboneoApiSecret: ""
    });
    console.log(`[SmartCrop DEBUG] settings.aiEnhancedMode=${settings.aiEnhancedMode}, aiProvider=${settings.aiProvider}, hasKey=${!!settings.tongyiApiKey}, keyLen=${settings.tongyiApiKey?.length}`);
    if (settings.aiEnhancedMode && settings.aiProvider === "tongyi" && settings.tongyiApiKey) {
      try {
        console.log(`[SmartCrop] AI 增强模式开启，使用通义万象 Outpaint: ${targetWidth}x${targetHeight}`);
        const aiPrompt = settings.tongyiExpandPrompt || "专业广告摄影风格，画面延伸自然，背景与主体融合协调，高清细腻";
        const aiResult = await tongyiOutpaint(file.path, targetWidth, targetHeight, settings.tongyiApiKey, aiPrompt);

        // NOTE: wanx2.1-imageedit 有输出分辨率上限（约 1M 像素），实际输出尺寸不等于目标尺寸
        // 例如目标 1440x2340 (336万像素) → API 实际可能输出 1152x1792 (206万像素)
        // 因此必须读取实际输出尺寸，再根据情况决定缩放策略
        const aiRawPath = path.join(STORAGE_DIR, path.basename(aiResult.url));
        const aiMeta = await sharp(aiRawPath).metadata();
        const aiWidth = aiMeta.width;
        const aiHeight = aiMeta.height;
        console.log(`[SmartCrop] AI 输出实际尺寸: ${aiWidth}x${aiHeight}，目标: ${targetWidth}x${targetHeight}`);

        const basename = path.basename(file.originalname, path.extname(file.originalname));
        const outputFilename = `ai_processed_${Date.now()}_${basename}.jpg`;
        const outputPath = path.join(STORAGE_DIR, outputFilename);

        const maxSizeBytes = limitKB * 1024;
        let quality = 85;
        let buffer;

        // NOTE: 根据 AI 实际输出与目标尺寸的关系选择 resize 策略：
        // - AI 输出比目标小（常见，API 有输出分辨率上限）→ fit:fill 强制拉伸，保留全部 AI 扩图内容
        // - AI 输出比目标大 → fit:cover 居中裁剪，保留画面主体
        const aiAspect = aiWidth / aiHeight;
        const targetAspect = targetWidth / targetHeight;
        const fitStrategy = (Math.abs(aiAspect - targetAspect) < 0.05) ? 'fill' : 'cover';
        console.log(`[SmartCrop] AI 后处理策略: fit=${fitStrategy} (AI比例=${aiAspect.toFixed(3)}, 目标比例=${targetAspect.toFixed(3)})`);

        while (quality >= 10) {
          buffer = await sharp(aiRawPath)
            .resize({
              width: targetWidth,
              height: targetHeight,
              fit: fitStrategy,
              position: 'center',
              kernel: sharp.kernel.lanczos3
            })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();

          console.log(`[SmartCrop] AI 后处理 quality=${quality}: ${(buffer.length / 1024).toFixed(1)}KB / ${limitKB}KB`);
          if (buffer.length <= maxSizeBytes) break;
          quality -= 5;
        }

        if (buffer.length > maxSizeBytes) {
          console.warn(`[SmartCrop] AI 后处理：即使 quality=${quality} 仍超出 ${limitKB}KB，当前 ${(buffer.length / 1024).toFixed(1)}KB`);
        }

        await fs.writeFile(outputPath, buffer);

        // 清理 AI 原始临时文件
        fs.unlink(aiRawPath).catch(() => { });

        return res.json({
          ok: true,
          url: `/static/${outputFilename}`,
          width: targetWidth,
          height: targetHeight,
          sizeKB: (buffer.length / 1024).toFixed(2),
          message: `通义万象 AI 增强完成 (AI输出 ${aiWidth}x${aiHeight})`,
          aiEnhanced: true
        });
      } catch (aiErr) {
        console.error("[SmartCrop] 通义万象 Outpaint 失败，回退到常规裁剪:", aiErr.message);
        // NOTE: AI 失败后自动降级到常规裁剪，保证服务可用性
      }
    } else if (settings.aiEnhancedMode && settings.aiProvider === "roboneo" && settings.roboneoApiKey && settings.roboneoApiSecret) {
      try {
        console.log(`[SmartCrop] AI 增强模式开启，使用美图 RoboNeo Outpaint: ${targetWidth}x${targetHeight}`);
        const aiPrompt = settings.tongyiExpandPrompt || "高级感背景，自然融合，高清细节";
        const aiResult = await roboneoOutpaint(file.path, targetWidth, targetHeight, settings.roboneoApiKey, settings.roboneoApiSecret, aiPrompt);

        // NOTE: 复用通义万象的后处理逻辑：读取 AI 输出实际尺寸，再进行目标尺寸的精确缩放与压缩
        const aiRawPath = path.join(STORAGE_DIR, path.basename(aiResult.url));
        const aiMeta = await sharp(aiRawPath).metadata();
        const aiWidth = aiMeta.width;
        const aiHeight = aiMeta.height;
        console.log(`[SmartCrop] RoboNeo 输出实际尺寸: ${aiWidth}x${aiHeight}，目标: ${targetWidth}x${targetHeight}`);

        const basename = path.basename(file.originalname, path.extname(file.originalname));
        const outputFilename = `ai_processed_rb_${Date.now()}_${basename}.jpg`;
        const outputPath = path.join(STORAGE_DIR, outputFilename);

        const maxSizeBytes = limitKB * 1024;
        let quality = 85;
        let buffer;

        // NOTE: 比例校验，决定是 fill 还是 cover
        const aiAspect = aiWidth / aiHeight;
        const targetAspect = targetWidth / targetHeight;
        const fitStrategy = (Math.abs(aiAspect - targetAspect) < 0.05) ? 'fill' : 'cover';

        while (quality >= 10) {
          buffer = await sharp(aiRawPath)
            .resize({
              width: targetWidth,
              height: targetHeight,
              fit: fitStrategy,
              position: 'center',
              kernel: sharp.kernel.lanczos3
            })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();
          if (buffer.length <= maxSizeBytes) break;
          quality -= 5;
        }

        await fs.writeFile(outputPath, buffer);
        fs.unlink(aiRawPath).catch(() => { });

        return res.json({
          ok: true,
          url: `/static/${outputFilename}`,
          width: targetWidth,
          height: targetHeight,
          sizeKB: (buffer.length / 1024).toFixed(2),
          message: `美图 RoboNeo AI 增强完成`,
          aiEnhanced: true
        });
      } catch (aiErr) {
        console.error("[SmartCrop] 美图 RoboNeo Outpaint 失败，回退到常规裁剪:", aiErr.message);
      }
    } else if (settings.aiEnhancedMode && settings.aiProvider === "nanobanner" && settings.nanobannerApiKey) {
      try {
        console.log(`[SmartCrop] AI 增强模式开启，使用 Nano Banner Outpaint: ${targetWidth}x${targetHeight}`);
        const aiPrompt = settings.tongyiExpandPrompt || "highly detailed background, seamless expansion, cinematic lighting";
        const aiResult = await nanobannerOutpaint(file.path, targetWidth, targetHeight, settings.nanobannerApiKey, settings.nanobannerBaseUrl, aiPrompt);

        // NOTE: 复用后处理逻辑
        const aiRawPath = path.join(STORAGE_DIR, path.basename(aiResult.url));
        const aiMeta = await sharp(aiRawPath).metadata();
        const aiWidth = aiMeta.width;
        const aiHeight = aiMeta.height;
        console.log(`[SmartCrop] Nano Banner 输出实际尺寸: ${aiWidth}x${aiHeight}，目标: ${targetWidth}x${targetHeight}`);

        const basename = path.basename(file.originalname, path.extname(file.originalname));
        const outputFilename = `ai_processed_nanobanner_${Date.now()}_${basename}.jpg`;
        const outputPath = path.join(STORAGE_DIR, outputFilename);

        const maxSizeBytes = limitKB * 1024;
        let quality = 85;
        let buffer;

        const aiAspect = aiWidth / aiHeight;
        const targetAspect = targetWidth / targetHeight;
        const fitStrategy = (Math.abs(aiAspect - targetAspect) < 0.05) ? 'fill' : 'cover';

        while (quality >= 10) {
          buffer = await sharp(aiRawPath)
            .resize({
              width: targetWidth,
              height: targetHeight,
              fit: fitStrategy,
              position: 'center',
              kernel: sharp.kernel.lanczos3
            })
            .jpeg({ quality, mozjpeg: true })
            .toBuffer();
          if (buffer.length <= maxSizeBytes) break;
          quality -= 5;
        }

        await fs.writeFile(outputPath, buffer);
        fs.unlink(aiRawPath).catch(() => { });

        return res.json({
          ok: true,
          url: `/static/${outputFilename}`,
          width: targetWidth,
          height: targetHeight,
          sizeKB: (buffer.length / 1024).toFixed(2),
          message: `Nano Banner AI 增强完成`,
          aiEnhanced: true
        });
      } catch (aiErr) {
        console.error("[SmartCrop] Nano Banner Outpaint 失败，回退到常规裁剪:", aiErr.message);
      }
    }

    // Detect Important Region using Gemini Vision (with Timeout)
    let importantRegion = null;
    if (geminiClient) {
      try {
        console.log("[SmartCrop] Detecting important region via Gemini...");
        const imageBuffer = await fs.readFile(file.path);
        const imageBase64 = imageBuffer.toString('base64');

        // 使用 Promise.race 增加 10 秒超时
        const geminiTask = geminiClient.models.generateContent({
          model: "gemini-3-flash-preview",
          contents: {
            parts: [
              {
                inlineData: {
                  mimeType: file.mimetype || "image/jpeg",
                  data: imageBase64
                }
              },
              {
                text: "Detect the bounding box of the main subject and any critical text in this image. I need one bounding box [ymin, xmin, ymax, xmax] that encompasses the area of interest to be preserved during cropping. Return as JSON."
              }
            ]
          },
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                ymin: { type: Type.NUMBER },
                xmin: { type: Type.NUMBER },
                ymax: { type: Type.NUMBER },
                xmax: { type: Type.NUMBER }
              },
              required: ["ymin", "xmin", "ymax", "xmax"]
            }
          }
        });

        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Gemini Timeout")), 10000));
        const response = await Promise.race([geminiTask, timeoutPromise]);

        const parsed = JSON.parse(response.text || "{}");
        if (parsed.ymin !== undefined) {
          importantRegion = parsed;
          console.log("[SmartCrop] Region detected:", importantRegion);
        }
      } catch (geminiErr) {
        console.error("[SmartCrop] Gemini detection bypassed/failed:", geminiErr.message);
      }
    }

    // Output filename
    const originalExt = path.extname(file.originalname).toLowerCase();
    const isPngMimetype = file.mimetype && (file.mimetype.toLowerCase().includes("png") || file.mimetype.toLowerCase().includes("webp"));
    // 同时也支持 webp 透明度，如果用户上传的是 webp
    const ext = (originalExt === ".png" || originalExt === ".webp" || isPngMimetype) ? (isPngMimetype && file.mimetype.includes("webp") ? ".webp" : ".png") : ".jpg";
    console.log(`[SmartCrop] File: ${file.originalname}, Mime: ${file.mimetype}, Final Ext: ${ext}`);
    const basename = path.basename(file.originalname, path.extname(file.originalname)); // Use original name base
    const outputFilename = `processed_${Date.now()}_${basename}${ext}`;
    const outputPath = path.join(STORAGE_DIR, outputFilename);

    console.log(`[SmartCrop] Processing ${file.path} -> ${targetWidth}x${targetHeight}, limit ${limitKB}KB`);

    // Process
    const result = await processImage(file.path, outputPath, targetWidth, targetHeight, limitKB, importantRegion);

    // Generate URL
    const url = `/static/${outputFilename}`;

    res.json({
      ok: true,
      url,
      width: result.width,
      height: result.height,
      sizeKB: (result.size / 1024).toFixed(2),
      message: "智能裁剪与压缩完成"
    });

  } catch (err) {
    console.error("Smart crop failed:", err);
    res.status(500).json({ error: "图片处理失败", details: err.message });
  }
});

// SPA 兜底：所有非 API 且非静态资源的请求都返回 index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(ROOT_DIR, "dist", "index.html"));
});

// ---- 自动清理：定期删除过期的临时素材 (1小时前) ----
async function cleanupStorage() {
  console.log("[Cleanup] Starting storage cleanup...");
  try {
    const files = await fs.readdir(STORAGE_DIR);
    const now = Date.now();
    const expiry = 60 * 60 * 1000; // 1 小时

    for (const file of files) {
      // 排除蒙版、工作流和默认角标目录
      if (file === "masks" || file === "workflows" || file === "badges") continue;

      const filePath = path.join(STORAGE_DIR, file);
      const stats = await fs.stat(filePath);

      if (now - stats.mtimeMs > expiry) {
        await fs.unlink(filePath);
        console.log(`[Cleanup] Deleted expired file: ${file}`);
      }
    }
  } catch (err) {
    console.error("[Cleanup] Storage cleanup failed:", err);
  }
}

// 每 30 分钟跑一次清理
setInterval(cleanupStorage, 30 * 60 * 1000);

// ---- 启动 ----
ensureDataFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
    // 启动时先跑一次清理
    cleanupStorage();
  });
});
