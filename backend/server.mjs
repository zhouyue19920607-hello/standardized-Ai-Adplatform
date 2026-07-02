import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { createReadStream } from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Type } from "@google/genai";
import axios from "axios";
import sharp from "sharp";
import { processImage } from "./utils/imageProcessor.mjs";
import { compressAndCompositeVideo, removeWhiteBackgroundFromVideo, resizeVideoToDimensions, resizeVideoToMaxSide } from "./ffmpegUtils.mjs";


// ---- 基础路径与环境变量 ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const PORT = process.env.PORT || 4000;
const COMFYUI_BASE_URL = process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

async function loadLocalEnvFile() {
  const envFilePath = path.join(ROOT_DIR, ".env.local");
  try {
    const content = await fs.readFile(envFilePath, "utf-8");
    content.split(/\r?\n/).forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return;
      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex <= 0) return;
      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");
      if (key && process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
  } catch (err) {
    if (err.code !== "ENOENT") {
      console.warn("[env] failed to load .env.local:", err.message);
    }
  }
}

await loadLocalEnvFile();

// NOTE: 生产部署时可通过 DATA_DIR / STORAGE_DIR 指向挂载卷，让访问统计、模板配置和上传资产跨容器重启保留。
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, "data");
const STORAGE_DIR = process.env.STORAGE_DIR ? path.resolve(process.env.STORAGE_DIR) : path.join(__dirname, "storage");
const DEFAULT_ASSETS_DIR = path.join(__dirname, "default-assets");
const MASKS_DIR = path.join(STORAGE_DIR, "masks");
const WORKFLOWS_DIR = path.join(STORAGE_DIR, "workflows");
const BADGES_DIR = path.join(STORAGE_DIR, "badges");
const PREVIEWS_DIR = path.join(STORAGE_DIR, "previews");
const AIGC_INPUTS_DIR = path.join(STORAGE_DIR, "aigc-inputs");

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
  { id: "break-frame-focal-3d", groupId: "home", groupName: "首页创意模版", name: "秀秀-破框焦点视窗3D", dimensions: "预览 1126 x 2436 / 破框 1126 x 1890 / 焦点 1126 x 900", enabled: true },
  { id: "meiyan-break-frame-focal-3d", groupId: "home", groupName: "首页创意模版", name: "美颜-破框焦点视窗3D", dimensions: "预览 1126 x 2436 / 破框 1126 x 1890 / 焦点 1126 x 900", enabled: true },
  { id: "polymorphic-flip-card", groupId: "home", groupName: "首页创意模版", name: "多态翻卡", dimensions: "预览 1126 x 2436 / 破框 1126 x 1890 / 焦点 1126 x 900", enabled: true },
  { id: "jumping-focal-window", groupId: "home", groupName: "首页创意模版", name: "跃动焦点视窗", dimensions: "预览 1126 x 2436 / 破框 1126 x 906 / 焦点 1126 x 900", enabled: true },
  { id: "refresh-ui-bottom-nav", groupId: "home", groupName: "首页创意模版", name: "焕新UI", dimensions: "icon 底图 1228 x 674 / 等比缩小 1028 x 565 后裁进 6 个 icon", enabled: true }
];
const IMPLEMENTED_CREATIVE_TEMPLATE_IDS = new Set(DEFAULT_CREATIVE_TEMPLATES.map(t => t.id));
// NOTE: 模版使用次数单独存储，不随 templates.json 一起被 git 覆盖
// 格式：{ "mt-f-1": 12, "mt-ib-1": 5, ... }
const USAGE_STATS_FILE = path.join(DATA_DIR, "usage-stats.json");
// NOTE: 遇罩/裁剪层/角标路径单独存储，不随代码更新被覆盖
// 格式：{ "mt-s-1": { mask_path, maskUrl, maskPath, crop_overlay_path, badge_overlay_path, preview_video_path } }
const ASSET_OVERRIDES_FILE = path.join(DATA_DIR, "asset-overrides.json");
const ASSET_OVERRIDE_FIELDS = ["maskPath", "mask_path", "maskUrl", "crop_overlay_path", "badge_overlay_path", "preview_video_path"];
const DEFAULT_TEMPLATE_ASSET_OVERRIDES = {
  "mt-p-1": {
    maskPath: "backend/default-assets/standard/mt-p-1-mask.jpg",
    mask_path: "/default-assets/standard/mt-p-1-mask.jpg",
    maskUrl: "/default-assets/standard/mt-p-1-mask.jpg",
    badge_overlay_path: "/default-assets/standard/mt-p-1-badge.png"
  },
  "my-f-1": {
    maskPath: "backend/storage/masks/my_focal_window_mask.png",
    mask_path: "/static/masks/my_focal_window_mask.png",
    maskUrl: "/static/masks/my_focal_window_mask.png",
    badge_overlay_path: "/static/badges/my_focal_window_badge.png",
    preview_video_path: "/template-previews/meiyan-focal-window.mp4"
  }
};
const DEFAULT_TEMPLATE_ASSET_LEGACY_PATHS = {
  "my-f-1": [
    "backend/default-assets/standard/my-f-1-mask.png",
    "/default-assets/standard/my-f-1-mask.png",
    "backend/default-assets/standard/my-f-1-badge.png",
    "/default-assets/standard/my-f-1-badge.png",
    "backend/storage/masks/1777270597630_______-____________.png",
    "/static/masks/1777270597630_______-____________.png"
  ]
};

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

async function md5File(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash("md5").update(content).digest("hex");
}

async function ensureDefaultStaticAssetCopies() {
  const copies = [
    {
      source: path.join(DEFAULT_ASSETS_DIR, "standard", "my-f-1-mask.png"),
      target: path.join(MASKS_DIR, "my_focal_window_mask.png")
    },
    {
      source: path.join(DEFAULT_ASSETS_DIR, "standard", "my-f-1-badge.png"),
      target: path.join(BADGES_DIR, "my_focal_window_badge.png")
    }
  ];

  for (const { source, target } of copies) {
    try {
      await fs.access(source);
      let shouldCopy = true;
      try {
        shouldCopy = await md5File(source) !== await md5File(target);
      } catch {
        shouldCopy = true;
      }
      if (shouldCopy) {
        await ensureDir(path.dirname(target));
        await fs.copyFile(source, target);
      }
    } catch (err) {
      console.warn("[DefaultAssets] skip static asset sync:", err.message);
    }
  }
}

function firstConfiguredEnv(...names) {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();
    if (value) return value;
  }
  return "";
}

function normalizeNanoBannerModelName(modelName = "") {
  const raw = String(modelName || "").trim();
  if (!raw) return "gpt-image-2-vip";
  const compact = raw.toLowerCase();
  if (compact === "gpt-image2") return "gpt-image-2";
  if (compact === "gpt-image2-vip") return "gpt-image-2-vip";
  return raw;
}

function getNanoBannerModel() {
  return normalizeNanoBannerModelName(firstConfiguredEnv("NANO_BANNER_MODEL", "NANOBANNER_MODEL"));
}

function getDefaultSystemSettings() {
  const nanobannerApiKey = firstConfiguredEnv("NANO_BANNER_API_KEY", "NANOBANNER_API_KEY");
  return {
    aiEnhancedMode: false,
    aiProvider: nanobannerApiKey ? "nanobanner" : "tongyi",
    tongyiApiKey: firstConfiguredEnv("TONGYI_API_KEY", "DASHSCOPE_API_KEY"),
    nanobannerApiKey,
    nanobannerBaseUrl: firstConfiguredEnv("NANO_BANNER_BASE_URL", "NANO_BANNER_API_BASE_URL", "NANOBANNER_BASE_URL"),
    nanobannerModel: getNanoBannerModel(),
    comfyuiUrl: firstConfiguredEnv("COMFYUI_BASE_URL") || "http://127.0.0.1:8188",
    tongyiExpandPrompt: firstConfiguredEnv("NANO_BANNER_PROMPT", "TONGYI_EXPAND_PROMPT")
  };
}

async function readSystemSettings() {
  const defaults = getDefaultSystemSettings();
  const saved = await readJson(SETTINGS_FILE, {});
  const settings = { ...defaults, ...(saved || {}) };
  if (!settings.tongyiApiKey) settings.tongyiApiKey = defaults.tongyiApiKey;
  if (!settings.nanobannerApiKey) settings.nanobannerApiKey = defaults.nanobannerApiKey;
  if (!settings.nanobannerBaseUrl) settings.nanobannerBaseUrl = defaults.nanobannerBaseUrl;
  settings.nanobannerModel = normalizeNanoBannerModelName(settings.nanobannerModel || defaults.nanobannerModel);
  if (!settings.comfyuiUrl) settings.comfyuiUrl = defaults.comfyuiUrl;
  if (!settings.tongyiExpandPrompt) settings.tongyiExpandPrompt = defaults.tongyiExpandPrompt;
  if (!settings.aiProvider && settings.nanobannerApiKey) settings.aiProvider = "nanobanner";
  return settings;
}

async function persistTemplateAssetOverrides(templates = []) {
  const assetOverrides = await readJson(ASSET_OVERRIDES_FILE, {});
  let changed = false;
  templates.forEach(template => {
    if (!template?.id) return;
    const next = { ...(assetOverrides[template.id] || {}) };
    ASSET_OVERRIDE_FIELDS.forEach(field => {
      if (template[field]) {
        next[field] = template[field];
        changed = true;
      }
    });
    if (Object.keys(next).length > 0) assetOverrides[template.id] = next;
  });
  if (changed) await writeJson(ASSET_OVERRIDES_FILE, assetOverrides);
}

async function isMissingUploadedAssetPath(assetPath = "") {
  const normalized = String(assetPath || "").trim();
  if (!normalized) return true;

  let localPath = "";
  if (normalized.startsWith("/static/")) {
    localPath = path.join(STORAGE_DIR, normalized.replace(/^\/static\//, ""));
  } else if (normalized.startsWith("backend/storage/")) {
    localPath = path.join(ROOT_DIR, normalized);
  }

  if (!localPath) return false;

  try {
    await fs.access(localPath);
    return false;
  } catch {
    return true;
  }
}

async function ensureDefaultTemplateAssetOverrides() {
  const assetOverrides = await readJson(ASSET_OVERRIDES_FILE, {});
  let changed = false;

  for (const [templateId, defaults] of Object.entries(DEFAULT_TEMPLATE_ASSET_OVERRIDES)) {
    const current = { ...(assetOverrides[templateId] || {}) };
    const legacyPaths = DEFAULT_TEMPLATE_ASSET_LEGACY_PATHS[templateId] || [];
    for (const [field, value] of Object.entries(defaults)) {
      const currentValue = String(current[field] || "");
      if (legacyPaths.includes(currentValue) || await isMissingUploadedAssetPath(current[field])) {
        current[field] = value;
        changed = true;
      }
    }
    assetOverrides[templateId] = current;
  }

  if (changed) await writeJson(ASSET_OVERRIDES_FILE, assetOverrides);
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
      { id: "mt-f-3", app: "美图秀秀", category: "焦点视窗", name: "沉浸式焦点视窗", checked: false, dimensions: "1440 x 2340" },
      { id: "mt-fe-1", app: "美图秀秀", category: "信息流", name: "一键配方图文", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-ib-1", app: "美图秀秀", category: "icon/banner", name: "热推第三位", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-ib-2", app: "美图秀秀", category: "icon/banner", name: "热搜词第四位", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-ib-3", app: "美图秀秀", category: "icon/banner", name: "话题页背景板", checked: false, dimensions: "1126 x 640" },
      { id: "mt-ib-4", app: "美图秀秀", category: "icon/banner", name: "话题页banner", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-p-1", app: "美图秀秀", category: "弹窗", name: "保分页弹窗", checked: false, dimensions: "960 x 1440", ...DEFAULT_TEMPLATE_ASSET_OVERRIDES["mt-p-1"] },
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
      { id: "my-f-1", app: "美颜", category: "焦点视窗", name: "焦点视窗", checked: false, dimensions: "1284 x 1128", ...DEFAULT_TEMPLATE_ASSET_OVERRIDES["my-f-1"] },
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
      { id: "wk-f-1", app: "wink", category: "焦点视窗", name: "焦点视窗", checked: false, dimensions: "1126 x 2436", preview_video_path: "/template-previews/wink-focal-window.mp4" }
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
    await writeJson(SETTINGS_FILE, getDefaultSystemSettings());
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
  await ensureDir(PREVIEWS_DIR);
  await ensureDir(AIGC_INPUTS_DIR);
  await ensureDefaultStaticAssetCopies();
  await ensureDefaultTemplateAssetOverrides();
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
    } else if (file.fieldname === "video") {
      cb(null, PREVIEWS_DIR);
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
app.use("/default-assets", express.static(DEFAULT_ASSETS_DIR));

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
  await persistTemplateAssetOverrides([templates[index]]);
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
  await persistTemplateAssetOverrides([template]);
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
  await persistTemplateAssetOverrides(newOrderTemplates);
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
  const merged = templates
    .filter(t => IMPLEMENTED_CREATIVE_TEMPLATE_IDS.has(t.id))
    .map(t => {
      const merged = {
        ...(defaultById[t.id] || {}),
        ...t
      };
      if (merged.id === "refresh-ui-bottom-nav") {
        merged.name = "焕新UI";
        merged.dimensions = "icon 底图 1228 x 674 / 等比缩小 1028 x 565 后裁进 6 个 icon";
      }
      return merged;
    });
  res.json(merged);
});

app.put("/api/creative-templates/:id", async (req, res) => {
  const { id } = req.params;
  if (!IMPLEMENTED_CREATIVE_TEMPLATE_IDS.has(id)) {
    return res.status(404).json({ error: "Creative template not implemented" });
  }
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
  if (!IMPLEMENTED_CREATIVE_TEMPLATE_IDS.has(id)) {
    return res.status(404).json({ error: "Creative template not implemented" });
  }
  const file = req.file;
  const slotToField = {
    interaction: "interaction_asset_path",
    interactionBubble: "interaction_bubble_asset_path",
    interactionTwist: "interaction_twist_asset_path",
    interactionUp: "interaction_up_asset_path",
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

// 模版展示视频上传 / 更新
app.post("/api/templates/:id/preview-video", upload.single("video"), async (req, res) => {
  const { id } = req.params;
  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "缺少上传文件字段 'video'" });
  }

  const templates = await readJson(TEMPLATES_FILE, []);
  const index = templates.findIndex(t => t.id === id);
  if (index === -1) {
    return res.status(404).json({ error: "Template not found" });
  }

  const ext = path.extname(file.originalname).toLowerCase() || ".mp4";
  const stableFilename = `${id}_preview${ext}`;
  const stablePath = path.join(PREVIEWS_DIR, stableFilename);

  try {
    await fs.rename(file.path, stablePath);
  } catch (err) {
    console.error("Rename preview video failed, fallback to original:", err);
  }

  const previewVideoPath = `/static/previews/${stableFilename}`;
  templates[index] = {
    ...templates[index],
    preview_video_path: previewVideoPath
  };
  await writeJson(TEMPLATES_FILE, templates);

  const assetOverrides = await readJson(ASSET_OVERRIDES_FILE, {});
  assetOverrides[id] = {
    ...(assetOverrides[id] || {}),
    preview_video_path: previewVideoPath
  };
  await writeJson(ASSET_OVERRIDES_FILE, assetOverrides);

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

const AIGC_SIGN_ALGORITHM = "SDK-HMAC-SHA256";
const AIGC_DEFAULT_PROMPT = "preserve the original subject, logo and text exactly, only extend the background outside the original image";
const AIGC_BACKGROUND_ONLY_EXPAND_PROMPT = [
  "Background extension only.",
  "Continue the original background, lighting, color, material, perspective and depth of field.",
  "Do not add any new people, products, objects, props, decorations, icons, buttons, packaging, logos, brand marks, labels, slogans or text.",
  "Do not redraw, modify or invent the subject, product, person, logo or copywriting.",
  "Keep the extended area clean and empty enough for the existing foreground layers to be composited later.",
  "No extra elements, no fake text, no new focal object, no visual clutter."
].join(" ");
const AIGC_CONSERVATIVE_ADAPT_EXPAND_PROMPT = [
  "Strictly preserve the original subject, product, person, copywriting, button, logo and brand marks.",
  "Only extend or repair the existing background around the original content.",
  "Do not add any unrelated people, products, objects, props, decorations, icons, buttons, packaging, logos, brand marks, labels, slogans, captions, typography or text.",
  "Do not add new marketing copy, fake letters, fake words, fake UI, fake stickers, fake labels, signs, badges, watermarks or call-to-action buttons.",
  "Do not change, redraw, crop, cover, stretch or deform the original key content.",
  "Do not reinterpret the poster, redesign the scene, invent a new composition, or create additional foreground elements.",
  "The new area must follow the original background, lighting, color, material, perspective and depth of field.",
  "Keep the extended area visually quiet and empty enough for the existing original layers.",
  "Keep the result clean, natural and faithful to the source image."
].join(" ");
const AIGC_NO_NEW_CONTENT_NEGATIVE_PROMPT = [
  "new text",
  "extra text",
  "fake text",
  "unreadable text",
  "new logo",
  "extra logo",
  "watermark",
  "label",
  "sticker",
  "badge",
  "button",
  "icon",
  "packaging",
  "product",
  "person",
  "character",
  "animal",
  "vehicle",
  "decoration",
  "prop",
  "unrelated object",
  "visual clutter",
  "redesigned poster",
  "changed copywriting",
  "changed brand mark"
].join(", ");
const AIGC_TASKS = {
  dispatcher: "/v1/dispatcher",
  textToVideo: "/v1/ltx_2_async",
  imageToVideo: "/v1/ltx_2_async",
  videoClip: "/v1/hook_videoclip_async",
  videoExpand: "/v1/video_expand_v3_async"
};
const AIGC_VIDEO_EXPAND_MAX_FRAMES = 81;
const AIGC_VIDEO_EXPAND_MAX_SIDE = 1024;
const videoExpandJobs = new Map();

function getAigcConfig() {
  const apiHost = (process.env.AIGC_API_HOST || "https://openapi-ali.meitu.com").replace(/\/+$/, "");
  return {
    ak: process.env.AIGC_AK || "",
    sk: process.env.AIGC_SK || "",
    biz: process.env.AIGC_BIZ || "ai-saap",
    apiHost,
    mtlabApiHost: (process.env.AIGC_MTLAB_API_HOST || "https://openapi.mtlab.meitu.com").replace(/\/+$/, ""),
    aiApiHost: (process.env.AIGC_AI_API_HOST || apiHost).replace(/\/+$/, ""),
    videoCutoutTask: (process.env.AIGC_VIDEO_CUTOUT_TASK || "").trim(),
    authMode: (process.env.AIGC_AUTH_MODE || "query").toLowerCase(),
    apiStyle: (process.env.AIGC_PROVIDER_API_STYLE || "").toLowerCase(),
    pollEndpointTemplate: process.env.AIGC_POLL_ENDPOINT_TEMPLATE || "/v2/task/{taskId}",
    publicBaseUrl: (process.env.AIGC_PUBLIC_BASE_URL || "").replace(/\/+$/, ""),
    hostHeader: process.env.AIGC_HOST_HEADER || "",
    maxPolls: Math.max(1, Number(process.env.AIGC_MAX_POLLS || 360)),
    pollIntervalMs: Math.max(500, Number(process.env.AIGC_POLL_INTERVAL_MS || 2000)),
    layeredRelayoutMode: String(process.env.AIGC_LAYERED_RELAYOUT_MODE || "preserve").toLowerCase()
  };
}

function normalizeHttpBaseUrl(value, fallback = "") {
  const raw = String(value || fallback || "").trim().replace(/\/+$/, "");
  if (!raw) return "";
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

function getObserverConfig() {
  return {
    accessId: process.env.OBSERVER_ACCESS_ID || "",
    biz: process.env.OBSERVER_BIZ || "",
    host: normalizeHttpBaseUrl(process.env.OBSERVER_HOST, "https://observer.starii-int.com"),
    cdnDomain: normalizeHttpBaseUrl(process.env.OBSERVER_CDN_DOMAIN)
  };
}

function observerHostCandidates(primaryHost = "") {
  const candidates = [];
  const add = value => {
    const normalized = String(value || "").trim().replace(/\/+$/, "");
    if (normalized && !candidates.includes(normalized)) candidates.push(normalized);
  };
  add(primaryHost);
  if (primaryHost.includes("ali-observer.cloud.m.com")) {
    add(primaryHost.replace("ali-observer.cloud.m.com", "ali-observer.meitu-int.com"));
  }
  if (primaryHost.includes("ali-observer.meitu-int.com")) {
    add(primaryHost.replace("ali-observer.meitu-int.com", "ali-observer.cloud.m.com"));
  }
  return candidates;
}

function getRequestPublicBaseUrl(req) {
  const forwardedHost = String(req.headers["x-forwarded-host"] || "").split(",")[0].trim();
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const host = forwardedHost || req.get("host") || "";
  if (!host || /^(localhost|127\.0\.0\.1|\[::1\])(?::|$)/i.test(host)) return "";
  const proto = forwardedProto || req.protocol || "https";
  return `${proto}://${host}`.replace(/\/+$/, "");
}

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256Hex(secret, value) {
  return crypto.createHmac("sha256", secret).update(value, "utf8").digest("hex");
}

function hmacSha1Base64(secret, value) {
  return crypto.createHmac("sha1", secret).update(value, "utf8").digest("base64");
}

function formatSdkDate(date = new Date()) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function canonicalUri(pathname) {
  return pathname.endsWith("/") ? pathname : `${pathname}/`;
}

function canonicalQuery(searchParams) {
  const params = new URLSearchParams(searchParams);
  params.sort();
  return params.toString();
}

function signAigcRequest(url, method, headers, body, config) {
  const parsed = new URL(url);
  const signingHeaders = {
    ...headers,
    "X-Sdk-Date": headers["X-Sdk-Date"] || formatSdkDate()
  };
  const signedHeaderNames = Object.keys(signingHeaders).map(key => key.toLowerCase()).sort();
  const loweredHeaders = Object.fromEntries(Object.entries(signingHeaders).map(([key, value]) => [key.toLowerCase(), String(value).trim()]));
  const canonicalHeaders = signedHeaderNames.map(key => `${key}:${loweredHeaders[key]}`).join("\n");
  const payloadHash = signingHeaders["X-Sdk-Content-Sha256"] || sha256Hex(body || "");
  const canonicalRequest = [
    method.toUpperCase(),
    canonicalUri(parsed.pathname),
    canonicalQuery(parsed.searchParams),
    canonicalHeaders,
    signedHeaderNames.join(";"),
    payloadHash
  ].join("\n");
  const stringToSign = [
    AIGC_SIGN_ALGORITHM,
    signingHeaders["X-Sdk-Date"],
    sha256Hex(canonicalRequest)
  ].join("\n");
  const signature = hmacSha256Hex(config.sk, stringToSign);
  const authorization = `${AIGC_SIGN_ALGORITHM} Access=${config.ak}, SignedHeaders=${signedHeaderNames.join(";")}, Signature=${signature}`;
  return {
    ...signingHeaders,
    Authorization: `Bearer ${Buffer.from(authorization, "utf8").toString("base64")}`
  };
}

function withAigcQueryAuth(url, config, options = {}) {
  const parsed = new URL(url);
  parsed.searchParams.set("api_key", config.ak);
  parsed.searchParams.set("api_secret", config.sk);
  if (options.withMsgId) {
    parsed.searchParams.set("msg_id", crypto.randomBytes(8).toString("hex"));
  }
  return parsed.toString();
}

async function aigcJsonRequest(url, method, payload, config) {
  const body = payload ? JSON.stringify(payload) : "";
  const normalizeHttpResponse = response => {
    if (response.status >= 400) {
      const message = typeof response.data === "string"
        ? response.data
        : response.data?.message || response.data?.msg || response.data?.error_msg || response.statusText;
      return {
        code: response.status,
        message,
        data: response.data,
        httpStatus: response.status
      };
    }
    return response.data;
  };
  if (config.authMode === "none") {
    const response = await axiosRequestWithRetry({
      url,
      method,
      data: payload ? body : undefined,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      transformRequest: data => data,
      timeout: 90000,
      validateStatus: () => true
    });
    return normalizeHttpResponse(response);
  }

  if (config.authMode === "query") {
    const response = await axiosRequestWithRetry({
      url: withAigcQueryAuth(url, config),
      method,
      data: payload ? body : undefined,
      headers: payload ? { "Content-Type": "application/json" } : undefined,
      transformRequest: data => data,
      timeout: 90000,
      validateStatus: () => true
    });
    return normalizeHttpResponse(response);
  }

  if (config.authMode === "platform_header" || config.authMode === "header") {
    const response = await axiosRequestWithRetry({
      url,
      method,
      data: payload ? body : undefined,
      headers: {
        ...(payload ? { "Content-Type": "application/json" } : {}),
        "X-Api-Key": config.ak,
        "X-Api-Secret": config.sk
      },
      transformRequest: data => data,
      timeout: 90000,
      validateStatus: () => true
    });
    return normalizeHttpResponse(response);
  }

  const parsed = new URL(url);
  const hostHeader = config.hostHeader || parsed.host;
  const headers = signAigcRequest(
    url,
    method,
    {
      ...(payload ? { "Content-Type": "application/json" } : {}),
      Host: hostHeader
    },
    body,
    config
  );
  const response = await axiosRequestWithRetry({
    url,
    method,
    data: payload ? body : undefined,
    headers,
    transformRequest: data => data,
    timeout: 90000,
    validateStatus: () => true
  });
  return normalizeHttpResponse(response);
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function isRetriableHttpError(err) {
  const code = String(err?.code || "");
  if (["ECONNRESET", "ETIMEDOUT", "ECONNABORTED", "EPIPE", "ENOTFOUND", "EAI_AGAIN"].includes(code)) {
    return true;
  }
  const status = Number(err?.response?.status || 0);
  return [408, 425, 429, 500, 502, 503, 504].includes(status);
}

function summarizeHttpErrorData(data) {
  if (data === undefined || data === null) return "";
  if (typeof data === "string") return data.slice(0, 500);
  try {
    return JSON.stringify(data).slice(0, 500);
  } catch (err) {
    return String(data).slice(0, 500);
  }
}

function enrichHttpError(err, label = "http-request") {
  const status = err?.response?.status;
  const dataSummary = summarizeHttpErrorData(err?.response?.data);
  if (status || dataSummary) {
    err.message = `${label}: ${status ? `HTTP ${status}` : err.message}${dataSummary ? ` - ${dataSummary}` : ""}`;
  }
  return err;
}

async function axiosRequestWithRetry(requestConfig, options = {}) {
  const retries = Math.max(0, Number(options.retries ?? 2));
  const label = options.label || requestConfig.url || "http-request";
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await axios.request(requestConfig);
    } catch (err) {
      lastError = err;
      if (attempt >= retries || !isRetriableHttpError(err)) throw enrichHttpError(err, label);
      const delayMs = Math.min(3000, 500 * (2 ** attempt));
      console.warn("[HTTP] retry", JSON.stringify({
        label,
        attempt: attempt + 1,
        retries,
        code: err?.code || "",
        status: err?.response?.status || "",
        message: err?.message || String(err)
      }));
      await sleep(delayMs);
    }
  }
  throw enrichHttpError(lastError, label);
}

function toPositiveInt(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : null;
}

function toNonNegativeInt(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : fallback;
}

function toPositiveSeed(value, fallback = 123) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.round(parsed) : fallback;
}

function ceilToMultiple(value, multiple = 8) {
  const parsed = toPositiveInt(value);
  if (!parsed) return null;
  return Math.ceil(parsed / multiple) * multiple;
}

function floorToMultiple(value, multiple = 8) {
  const parsed = toPositiveInt(value);
  if (!parsed) return null;
  return Math.max(multiple, Math.floor(parsed / multiple) * multiple);
}

function getAigcVideoEncodeDimensions(width, height) {
  const sourceWidth = toPositiveInt(width) || 1920;
  const sourceHeight = toPositiveInt(height) || 1080;
  const scale = Math.min(1, AIGC_VIDEO_EXPAND_MAX_SIDE / Math.max(sourceWidth, sourceHeight));
  return {
    width: floorToMultiple(sourceWidth * scale, 16) || 1024,
    height: floorToMultiple(sourceHeight * scale, 16) || 576
  };
}

function isAigcFallbackCandidate(err) {
  const message = String(err?.message || "");
  return /60477|timeout|超时|mq|redis|queue|MOKI|GATEWAY|90002/i.test(message);
}

function isAigcTimeoutError(err) {
  const message = String(err?.message || "");
  return /timeout|超时|upstream/i.test(message);
}

function normalizeExpandPixels(value) {
  if (!value || typeof value !== "object") return null;
  return {
    left: Math.max(0, Math.round(Number(value.left || 0))),
    right: Math.max(0, Math.round(Number(value.right || 0))),
    top: Math.max(0, Math.round(Number(value.top || 0))),
    bottom: Math.max(0, Math.round(Number(value.bottom || 0)))
  };
}

async function getImageMetadataForUrl(imageUrl) {
  if (imageUrl.startsWith("/static/")) {
    const localPath = path.join(STORAGE_DIR, decodeURIComponent(imageUrl.replace(/^\/static\//, "")));
    return sharp(localPath).metadata();
  }
  const response = await axios.get(imageUrl, {
    responseType: "arraybuffer",
    timeout: 60000,
    maxContentLength: 30 * 1024 * 1024
  });
  return sharp(Buffer.from(response.data)).metadata();
}

async function resolveExpandPixels({ imageUrl, targetWidth, targetHeight, expandPixels }) {
  const explicitPixels = normalizeExpandPixels(expandPixels);
  const width = toPositiveInt(targetWidth);
  const height = toPositiveInt(targetHeight);
  if (!width && !height) {
    return explicitPixels || { left: 100, right: 100, top: 100, bottom: 100 };
  }

  const metadata = await getImageMetadataForUrl(imageUrl);
  if (!metadata.width || !metadata.height) {
    throw new Error("无法读取输入图片尺寸");
  }

  const finalWidth = width || metadata.width;
  const finalHeight = height || metadata.height;
  if (finalWidth < metadata.width || finalHeight < metadata.height) {
    throw new Error(`扩图目标尺寸不能小于原图尺寸，原图为 ${metadata.width}x${metadata.height}`);
  }

  const extraWidth = finalWidth - metadata.width;
  const extraHeight = finalHeight - metadata.height;
  const left = Math.floor(extraWidth / 2);
  const top = Math.floor(extraHeight / 2);
  return {
    left,
    right: extraWidth - left,
    top,
    bottom: extraHeight - top
  };
}

function extractAigcResultMedia(statusData) {
  const taskData = statusData?.data || {};
  const result = taskData.result || {};
  const resultData = result.data || {};
  const details = taskData.details || {};
  const mtlabResult = result.mtlab_res || resultData.mtlab_res || {};
  const callback = details.mtlab_callback_response || resultData.mtlab_callback_response || mtlabResult.mtlab_callback_response || {};
  const toMediaInfoList = values => values
    .map(item => typeof item === "string"
      ? { media_data: item, media_url: item }
      : {
          media_data: item?.media_data || item?.media_url || item?.media_image || item?.url,
          media_url: item?.media_url || item?.media_data || item?.media_image || item?.url,
          media_type: item?.media_type,
          width: item?.width,
          height: item?.height
        })
    .filter(item => item.media_data || item.media_url);
  if (Array.isArray(statusData?.media_info_list)) return statusData.media_info_list;
  if (Array.isArray(statusData?.urls)) return toMediaInfoList(statusData.urls);
  if (Array.isArray(statusData?.images)) return toMediaInfoList(statusData.images);
  if (Array.isArray(taskData.urls)) return toMediaInfoList(taskData.urls);
  if (Array.isArray(taskData.images)) return toMediaInfoList(taskData.images);
  if (callback.error_code === 0 && Array.isArray(callback.media_info_list)) return callback.media_info_list;
  if (callback.error_code === 0 && Array.isArray(callback.urls)) return toMediaInfoList(callback.urls);
  if (callback.error_code === 0 && Array.isArray(callback.images)) return toMediaInfoList(callback.images);
  if (Array.isArray(details.media_info_list)) return details.media_info_list;
  if (Array.isArray(details.images)) {
    return toMediaInfoList(details.images);
  }
  if (Array.isArray(result.urls)) {
    return toMediaInfoList(result.urls);
  }
  if (Array.isArray(result.images)) {
    return toMediaInfoList(result.images);
  }
  if (Array.isArray(resultData.media_info_list)) {
    return resultData.media_info_list;
  }
  if (Array.isArray(resultData.urls)) {
    return toMediaInfoList(resultData.urls);
  }
  if (Array.isArray(resultData.images)) {
    return toMediaInfoList(resultData.images);
  }
  if (Array.isArray(mtlabResult.media_info_list)) {
    return mtlabResult.media_info_list;
  }
  if (Array.isArray(mtlabResult.urls)) {
    return toMediaInfoList(mtlabResult.urls);
  }
  if (Array.isArray(mtlabResult.images)) {
    return toMediaInfoList(mtlabResult.images);
  }
  if (Array.isArray(result.parameter?.data)) {
    return toMediaInfoList(result.parameter.data);
  }
  if (Array.isArray(result.parameters?.data)) {
    return toMediaInfoList(result.parameters.data);
  }
  if (Array.isArray(resultData.parameter?.data)) {
    return toMediaInfoList(resultData.parameter.data);
  }
  if (Array.isArray(resultData.parameters?.data)) {
    return toMediaInfoList(resultData.parameters.data);
  }
  if (statusData?.data?.media_url) {
    return [{
      media_data: statusData.data.media_url,
      media_type: statusData.data.media_type,
      width: statusData.data.width,
      height: statusData.data.height
    }];
  }
  if (statusData?.media_url) {
    return [{
      media_data: statusData.media_url,
      media_type: statusData.media_type,
      width: statusData.width,
      height: statusData.height
    }];
  }
  return result.media_info_list || result.mediaInfoList || result.data?.media_info_list || statusData?.data?.media_info_list || [];
}

function summarizeAigcTaskStatus(statusData) {
  const taskData = statusData?.data || {};
  const result = taskData.result || {};
  const nested = result.data || {};
  const mediaInfoList = extractAigcResultMedia(statusData);
  const keysOf = value => value && typeof value === "object" && !Array.isArray(value)
    ? Object.keys(value).slice(0, 20)
    : [];
  return {
    code: statusData?.code ?? statusData?.error_code,
    message: statusData?.message || statusData?.error_msg || result?.msg || result?.error_msg || nested?.error_msg || "",
    status: taskData.status,
    progress: taskData.progress,
    taskId: taskData.task_id || result.id || "",
    resultKeys: keysOf(result),
    nestedKeys: keysOf(nested),
    mediaCount: mediaInfoList.length
  };
}

function extractAigcDirectResultUrl(data) {
  const mediaList = extractAigcResultMedia(data);
  if (mediaList.length > 0) {
    return mediaList[0].media_data || mediaList[0].media_url || "";
  }
  return data?.data?.url || data?.data?.result_url || data?.url || data?.result_url || "";
}

function normalizeMediaUrlString(value) {
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const markdownMatch = trimmed.match(/^\[[^\]]+\]\((https?:\/\/[^)]+)\)$/i);
  if (markdownMatch) return markdownMatch[1].trim();
  return trimmed;
}

function mediaInfoFromUrl(url) {
  const normalizedUrl = normalizeMediaUrlString(url);
  return {
    media_data: normalizedUrl,
    media_extra: {},
    media_profiles: { media_data_type: "url" }
  };
}

function initImagesFromMediaInfoList(mediaInfoList = []) {
  return mediaInfoList
    .map(item => item?.media_data)
    .filter(url => typeof url === "string" && /^https?:\/\//i.test(url))
    .map(url => ({
      url,
      profile: {
        media_profiles: { media_data_type: "url" },
        media_extra: {},
        version: "v1"
      }
    }));
}

const AIGC_STANDARD_IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff"]);
const AIGC_STANDARD_VIDEO_EXTS = new Set([".mp4", ".mov", ".webm", ".m4v"]);

function hasAigcStandardImageExt(value = "") {
  try {
    const parsed = /^https?:\/\//i.test(value) ? new URL(value) : { pathname: value };
    return AIGC_STANDARD_IMAGE_EXTS.has(path.extname(parsed.pathname).toLowerCase());
  } catch (err) {
    return AIGC_STANDARD_IMAGE_EXTS.has(path.extname(value).toLowerCase());
  }
}

function hasAigcStandardVideoExt(value = "") {
  try {
    const parsed = /^https?:\/\//i.test(value) ? new URL(value) : { pathname: value };
    return AIGC_STANDARD_VIDEO_EXTS.has(path.extname(parsed.pathname).toLowerCase());
  } catch (err) {
    return AIGC_STANDARD_VIDEO_EXTS.has(path.extname(value).toLowerCase());
  }
}

function publicStaticUrl(staticUrl, publicBaseUrl = "") {
  const normalizedUrl = normalizeMediaUrlString(staticUrl);
  if (!publicBaseUrl || typeof normalizedUrl !== "string" || !normalizedUrl.startsWith("/static/")) return normalizedUrl;
  return `${publicBaseUrl}${normalizedUrl}`;
}

function publicUrlToStaticUrl(publicUrl, publicBaseUrl = "") {
  const normalizedUrl = normalizeMediaUrlString(publicUrl);
  if (!publicBaseUrl || !/^https?:\/\//i.test(normalizedUrl)) return "";
  try {
    const media = new URL(normalizedUrl);
    const base = new URL(publicBaseUrl);
    if (media.origin !== base.origin || !media.pathname.startsWith("/static/")) return "";
    return decodeURIComponent(media.pathname);
  } catch (err) {
    return "";
  }
}

function staticUrlToLocalPath(staticUrl) {
  const relativePath = decodeURIComponent(staticUrl.replace(/^\/static\/+/, ""));
  const sourcePath = path.resolve(STORAGE_DIR, relativePath);
  const storageRoot = path.resolve(STORAGE_DIR);
  if (!sourcePath.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error("AIGC 素材路径不在允许的静态目录内");
  }
  return sourcePath;
}

async function getObserverSecurityToken(config) {
  const hosts = observerHostCandidates(config.host);
  let lastError;
  for (const host of hosts) {
    const tokenUrl = `${host}/api/v1/security_token`;
    try {
      const response = await axiosRequestWithRetry({
        url: tokenUrl,
        method: "GET",
        params: { biz: config.biz },
        headers: { "Access-ID": config.accessId },
        timeout: 30000
      }, { label: `observer-token:${new URL(host).host}`, retries: 3 });
      const token = Array.isArray(response.data) ? response.data[0] : response.data?.data?.[0] || response.data;
      if (!token?.access_key || !token?.secret_key || !token?.security_token || !token?.end_point || !token?.bucket) {
        throw new Error("Observer 未返回完整临时上传凭证");
      }
      if (host !== config.host) {
        console.warn("[Observer] token host fallback used", JSON.stringify({
          configuredHost: config.host,
          usedHost: host
        }));
      }
      return token;
    } catch (err) {
      lastError = err;
      console.warn("[Observer] token host failed", JSON.stringify({
        host,
        code: err?.code || "",
        status: err?.response?.status || "",
        message: err?.message || String(err),
        response: summarizeHttpErrorData(err?.response?.data)
      }));
    }
  }
  throw new Error(`Observer 获取上传凭证失败: ${lastError?.message || String(lastError)}`);
}

function objectKeyForAigcVideo(sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase() || ".mp4";
  return `videos/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}/${crypto.randomUUID()}${ext}`;
}

function objectKeyForAigcImage(sourcePath) {
  const ext = path.extname(sourcePath).toLowerCase() || ".jpg";
  return `images/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}/${crypto.randomUUID()}${ext}`;
}

function observerUploadUrl(endpointUrl, bucket, objectName) {
  const normalizedEndpoint = endpointUrl.toString().replace(/\/+$/, "");
  const endpointHost = endpointUrl.host;
  if (endpointHost.startsWith(`${bucket}.`)) {
    return `${normalizedEndpoint}/${objectName}`;
  }
  if (/oss-[^.]+\.aliyuncs\.com$/i.test(endpointHost)) {
    return `${endpointUrl.protocol}//${bucket}.${endpointHost}/${objectName}`;
  }
  return `${normalizedEndpoint}/${bucket}/${objectName}`;
}

async function uploadBufferToObserverOss(buffer, objectName, contentType = "video/mp4") {
  const config = getObserverConfig();
  if (!config.accessId || !config.biz || !config.cdnDomain) {
    throw new Error("缺少 Observer 上传配置：OBSERVER_ACCESS_ID / OBSERVER_BIZ / OBSERVER_CDN_DOMAIN");
  }
  const creds = await getObserverSecurityToken(config);
  const endpoint = String(creds.end_point).replace(/\/+$/, "");
  const bucket = String(creds.bucket);
  let endpointUrl;
  try {
    endpointUrl = new URL(normalizeHttpBaseUrl(endpoint));
  } catch (err) {
    throw new Error(`Observer 返回的上传 endpoint 不是合法 URL: ${endpoint}`);
  }
  try {
    new URL(config.cdnDomain);
  } catch (err) {
    throw new Error(`OBSERVER_CDN_DOMAIN 不是合法 URL: ${config.cdnDomain}`);
  }
  const date = new Date().toUTCString();
  const resource = `/${bucket}/${objectName}`;
  const stringToSign = [
    "PUT",
    "",
    contentType,
    date,
    `x-oss-security-token:${creds.security_token}`,
    resource
  ].join("\n");
  const signature = hmacSha1Base64(creds.secret_key, stringToSign);
  const uploadUrl = observerUploadUrl(endpointUrl, bucket, objectName);
  await axiosRequestWithRetry({
    url: uploadUrl,
    method: "PUT",
    data: buffer,
    headers: {
      "Content-Type": contentType,
      Date: date,
      "x-oss-security-token": creds.security_token,
      Authorization: `OSS ${creds.access_key}:${signature}`
    },
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    timeout: 120000
  }, { label: "observer-upload", retries: 3 });
  return `${config.cdnDomain}/${objectName}`;
}

async function uploadLocalVideoToObserverUrl(sourcePath) {
  await fs.access(sourcePath);
  const buffer = await fs.readFile(sourcePath);
  const objectName = objectKeyForAigcVideo(sourcePath);
  return uploadBufferToObserverOss(buffer, objectName, "video/mp4");
}

async function uploadLocalImageToObserverUrl(sourcePath) {
  await fs.access(sourcePath);
  const buffer = await fs.readFile(sourcePath);
  const ext = path.extname(sourcePath).toLowerCase();
  const contentType = ext === ".png" ? "image/png" : "image/jpeg";
  const objectName = objectKeyForAigcImage(sourcePath);
  return uploadBufferToObserverOss(buffer, objectName, contentType);
}

async function uploadStaticVideoToObserverUrl(staticUrl) {
  return uploadLocalVideoToObserverUrl(staticUrlToLocalPath(staticUrl));
}

async function uploadStaticImageToObserverUrl(staticUrl) {
  return uploadLocalImageToObserverUrl(staticUrlToLocalPath(staticUrl));
}

function hasObserverUploadConfig() {
  const observerConfig = getObserverConfig();
  return Boolean(observerConfig.accessId && observerConfig.biz && observerConfig.cdnDomain);
}

async function writeStandardizedAigcImage(input, options = {}) {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("AIGC input image metadata is unreadable");
  }

  await ensureDir(AIGC_INPUTS_DIR);
  const outputFilename = `aigc_input_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.jpg`;
  const outputPath = path.join(AIGC_INPUTS_DIR, outputFilename);
  const maxSide = toPositiveInt(options.maxSide);
  const shouldResize = Boolean(maxSide && Math.max(metadata.width, metadata.height) > maxSide);
  let pipeline = sharp(input).rotate();
  if (shouldResize) {
    pipeline = pipeline.resize({
      width: metadata.width >= metadata.height ? maxSide : undefined,
      height: metadata.height > metadata.width ? maxSide : undefined,
      fit: "inside",
      withoutEnlargement: true
    });
  }
  await pipeline
    .flatten({ background: "#ffffff" })
    .toColorspace("srgb")
    .jpeg({ quality: 92, mozjpeg: true })
    .toFile(outputPath);
  return `/static/aigc-inputs/${outputFilename}`;
}

async function standardizeAigcImageToBase64(input) {
  const metadata = await sharp(input).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("AIGC input image metadata is unreadable");
  }

  const maxSide = 1600;
  const shouldResize = Math.max(metadata.width, metadata.height) > maxSide;
  const buffer = await sharp(input)
    .rotate()
    .resize(shouldResize ? {
      width: metadata.width >= metadata.height ? maxSide : undefined,
      height: metadata.height > metadata.width ? maxSide : undefined,
      fit: "inside",
      withoutEnlargement: true
    } : undefined)
    .flatten({ background: "#ffffff" })
    .toColorspace("srgb")
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  return buffer.toString("base64");
}

async function standardizeStaticImageForAigc(staticUrl, options = {}) {
  const relativePath = decodeURIComponent(staticUrl.replace(/^\/static\/+/, ""));
  const sourcePath = path.resolve(STORAGE_DIR, relativePath);
  const storageRoot = path.resolve(STORAGE_DIR);
  if (!sourcePath.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error("AIGC 素材路径不在允许的静态目录内");
  }

  const parsed = path.parse(sourcePath);
  const ext = parsed.ext.toLowerCase();
  if (![".jpg", ".jpeg", ".png", ".webp", ".avif", ".tif", ".tiff"].includes(ext)) {
    return staticUrl;
  }

  await fs.access(sourcePath);
  return writeStandardizedAigcImage(sourcePath, options);
}

async function standardizeStaticImageToBase64ForAigc(staticUrl) {
  const relativePath = decodeURIComponent(staticUrl.replace(/^\/static\/+/, ""));
  const sourcePath = path.resolve(STORAGE_DIR, relativePath);
  const storageRoot = path.resolve(STORAGE_DIR);
  if (!sourcePath.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error("AIGC 素材路径不在允许的静态目录内");
  }
  await fs.access(sourcePath);
  return standardizeAigcImageToBase64(sourcePath);
}

async function standardizeRemoteImageForAigc(remoteUrl, options = {}) {
  const response = await axios.get(remoteUrl, {
    responseType: "arraybuffer",
    timeout: 60000,
    maxContentLength: 30 * 1024 * 1024,
    validateStatus: status => status >= 200 && status < 300
  });
  const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
  if (contentType && !contentType.includes("image/")) {
    return "";
  }
  return writeStandardizedAigcImage(Buffer.from(response.data), options);
}

async function standardizeRemoteImageToBase64ForAigc(remoteUrl) {
  let response;
  try {
    response = await axios.get(remoteUrl, {
      responseType: "arraybuffer",
      timeout: 60000,
      maxContentLength: 30 * 1024 * 1024,
      validateStatus: status => status >= 200 && status < 300,
      headers: {
        "User-Agent": "Mozilla/5.0 AIGC image normalizer"
      }
    });
  } catch (err) {
    const status = err.response?.status;
    const contentType = err.response?.headers?.["content-type"];
    throw new Error(`AIGC input image download failed${status ? `: HTTP ${status}` : ""}${contentType ? ` ${contentType}` : ""}`);
  }
  const contentType = String(response.headers?.["content-type"] || "").toLowerCase();
  if (contentType && !contentType.includes("image/")) {
    return "";
  }
  try {
    return await standardizeAigcImageToBase64(Buffer.from(response.data));
  } catch (err) {
    throw new Error(`AIGC input image normalization failed: ${err.message}`);
  }
}

function mediaInfoWithBase64(item, imageBase64) {
  return {
    ...item,
    media_data: imageBase64,
    media_profiles: {
      ...(item?.media_profiles || {}),
      media_data_type: "jpg"
    }
  };
}

function mediaInfoWithUrl(item, url) {
  return {
    ...item,
    media_data: url,
    media_profiles: {
      ...(item?.media_profiles || {}),
      media_data_type: "url"
    }
  };
}

async function normalizeMediaInfoListForAigc(mediaInfoList = [], config, options = {}) {
  const normalized = [];
  for (const item of mediaInfoList) {
    const mediaData = normalizeMediaUrlString(item?.media_data);
    if (typeof mediaData === "string" && mediaData.startsWith("/static/")) {
      if (hasAigcStandardVideoExt(mediaData)) {
        const publicUrl = publicStaticUrl(mediaData, config.publicBaseUrl);
        if (!/^https?:\/\//i.test(publicUrl)) {
          throw new Error("AI 视频扩展需要美图可访问的公网视频 URL。请配置 OBSERVER_* 上传中转，或配置 AIGC_PUBLIC_BASE_URL 为公网域名。");
        }
        normalized.push(mediaInfoWithUrl(item, publicUrl));
        continue;
      }
      if (options.preferPublicImageUrl && hasAigcStandardImageExt(mediaData)) {
        if (hasObserverUploadConfig()) {
          const standardizedStaticUrl = await standardizeStaticImageForAigc(mediaData);
          const observerUrl = await uploadStaticImageToObserverUrl(standardizedStaticUrl);
          normalized.push(mediaInfoWithUrl(item, observerUrl));
          continue;
        }
        const publicUrl = publicStaticUrl(mediaData, config.publicBaseUrl);
        if (/^https?:\/\//i.test(publicUrl)) {
          normalized.push(mediaInfoWithUrl(item, publicUrl));
          continue;
        }
      }
      if (hasAigcStandardImageExt(mediaData)) {
        const imageBase64 = await standardizeStaticImageToBase64ForAigc(mediaData);
        normalized.push(mediaInfoWithBase64(item, imageBase64));
      } else {
        normalized.push({
          ...item,
          media_data: publicStaticUrl(mediaData, config.publicBaseUrl)
        });
      }
      continue;
    }
    if (typeof mediaData === "string" && /^https?:\/\//i.test(mediaData)) {
      if (hasAigcStandardVideoExt(mediaData)) {
        normalized.push(mediaInfoWithUrl(item, mediaData));
        continue;
      }
      if (options.preferPublicImageUrl && hasAigcStandardImageExt(mediaData)) {
        if (options.standardizePublicImageUrl && hasObserverUploadConfig()) {
          try {
            const standardizedRemoteUrl = await standardizeRemoteImageForAigc(mediaData, {
              maxSide: options.standardizedMaxSide
            });
            if (standardizedRemoteUrl) {
              const observerUrl = await uploadStaticImageToObserverUrl(standardizedRemoteUrl);
              normalized.push(mediaInfoWithUrl(item, observerUrl));
              continue;
            }
          } catch (err) {
            console.warn("[AIGC] remote image standardization skipped:", err.message);
          }
        }
        normalized.push(mediaInfoWithUrl(item, mediaData));
        continue;
      }
      const localStaticUrl = publicUrlToStaticUrl(mediaData, config.publicBaseUrl);
      if (localStaticUrl && hasAigcStandardImageExt(localStaticUrl)) {
        if (hasObserverUploadConfig() && options.preferPublicImageUrl) {
          const standardizedStaticUrl = await standardizeStaticImageForAigc(localStaticUrl);
          const observerUrl = await uploadStaticImageToObserverUrl(standardizedStaticUrl);
          normalized.push(mediaInfoWithUrl(item, observerUrl));
          continue;
        }
        const imageBase64 = await standardizeStaticImageToBase64ForAigc(localStaticUrl);
        normalized.push(mediaInfoWithBase64(item, imageBase64));
        continue;
      }
      if (!localStaticUrl) {
        const imageBase64 = await standardizeRemoteImageToBase64ForAigc(mediaData);
        if (imageBase64) {
          normalized.push(mediaInfoWithBase64(item, imageBase64));
          continue;
        }
      }
    }
    normalized.push(item);
  }
  return normalized;
}
function getAigcTaskState(statusData) {
  const taskData = statusData?.data || {};
  if (statusData?.error_code === 29901) return "processing";
  if (statusData?.error_code === 0 && extractAigcResultMedia(statusData).length > 0) return "success";
  if (typeof taskData.status === "number") {
    if (taskData.status === 9) return "success";
    if (taskData.status === 10) return "success";
    if (taskData.status === 2) return "failed";
    return "processing";
  }
  if (statusData?.code === 0 && extractAigcResultMedia(statusData).length > 0) return "success";
  return "processing";
}

function inferAigcFileExt(resultUrl, mediaType, contentType = "") {
  try {
    const parsed = new URL(resultUrl);
    const ext = path.extname(parsed.pathname).toLowerCase();
    if (ext && ext.length <= 6) return ext;
  } catch (err) {
    // Ignore invalid URL parsing and fall back to media/content type.
  }
  const lowerType = `${mediaType || ""} ${contentType || ""}`.toLowerCase();
  if (lowerType.includes("video") || lowerType.includes("mp4")) return ".mp4";
  if (lowerType.includes("webp")) return ".webp";
  if (lowerType.includes("jpeg") || lowerType.includes("jpg")) return ".jpg";
  if (lowerType.includes("png")) return ".png";
  return ".dat";
}

async function imageBufferWithTransparentWhiteBackground(imgBuffer, resizeOptions = null) {
  let pipeline = sharp(imgBuffer);
  if (resizeOptions) {
    pipeline = pipeline.resize(resizeOptions.width, resizeOptions.height, {
      fit: resizeOptions.fit || "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    });
  }

  const { data, info } = await pipeline
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const isWhiteBackground = (pixelIndex) => {
    const offset = pixelIndex * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return a > 0 && r >= 238 && g >= 238 && b >= 238 && max - min <= 18;
  };

  const enqueueIfBackground = (pixelIndex) => {
    if (visited[pixelIndex] || !isWhiteBackground(pixelIndex)) return;
    visited[pixelIndex] = 1;
    queue[tail++] = pixelIndex;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueIfBackground(x);
    enqueueIfBackground((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueueIfBackground(y * width);
    enqueueIfBackground(y * width + width - 1);
  }

  while (head < tail) {
    const pixelIndex = queue[head++];
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    if (x > 0) enqueueIfBackground(pixelIndex - 1);
    if (x < width - 1) enqueueIfBackground(pixelIndex + 1);
    if (y > 0) enqueueIfBackground(pixelIndex - width);
    if (y < height - 1) enqueueIfBackground(pixelIndex + width);
  }

  for (let pixelIndex = 0; pixelIndex < visited.length; pixelIndex += 1) {
    const offset = pixelIndex * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max - min;

    if (visited[pixelIndex]) {
      data[offset + 3] = 0;
      continue;
    }

    // AIGC pendant assets often keep isolated white speckles that are not
    // connected to the canvas edge. Remove low-saturation near-white residue
    // so the final video does not show white dots after compositing.
    if (a > 0 && saturation <= 34 && r >= 238 && g >= 238 && b >= 238) {
      data[offset + 3] = 0;
      continue;
    }

    if (a > 0 && saturation <= 42 && r >= 218 && g >= 218 && b >= 218) {
      const whiteness = (r + g + b) / 3;
      const opacityScale = Math.max(0, Math.min(1, (238 - whiteness) / 20));
      data[offset + 3] = Math.round(a * opacityScale);
    }
  }

  const cleaned = new Uint8Array(data);
  const neighborOffsets = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0], [1, 0],
    [-1, 1], [0, 1], [1, 1]
  ];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const pixelIndex = y * width + x;
      const offset = pixelIndex * channels;
      if (data[offset + 3] === 0) continue;
      let transparentNeighbors = 0;
      for (const [dx, dy] of neighborOffsets) {
        const nextOffset = ((y + dy) * width + (x + dx)) * channels;
        if (data[nextOffset + 3] <= 12) transparentNeighbors += 1;
      }
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const isPaleResidue = max - min <= 52 && r >= 205 && g >= 205 && b >= 205;
      if (isPaleResidue && transparentNeighbors >= 4) {
        cleaned[offset + 3] = 0;
      }
    }
  }

  return sharp(cleaned, { raw: { width, height, channels } }).png().toBuffer();
}

async function imageBufferWithSubjectMaskCutout(imgBuffer, maskPath, targetWidth = 450, targetHeight = 450, subjectBox = null) {
  const sourceMeta = await sharp(imgBuffer).metadata();
  const sourceWidth = sourceMeta.width || targetWidth;
  const sourceHeight = sourceMeta.height || targetHeight;
  const safeBox = clampBoxToImage(subjectBox, sourceWidth, sourceHeight);
  const padding = Math.max(sourceWidth, sourceHeight) * 0.08;
  const cropBox = safeBox
    ? clampBoxToImage({
        x: safeBox.x - padding,
        y: safeBox.y - padding,
        width: safeBox.width + padding * 2,
        height: safeBox.height + padding * 2
      }, sourceWidth, sourceHeight)
    : null;
  const extract = cropBox
    ? {
        left: Math.round(cropBox.x),
        top: Math.round(cropBox.y),
        width: Math.max(1, Math.round(cropBox.width)),
        height: Math.max(1, Math.round(cropBox.height))
      }
    : null;
  const input = sharp(imgBuffer).rotate().ensureAlpha();
  const mask = sharp(maskPath).rotate().greyscale();
  const croppedInput = extract ? input.extract(extract) : input;
  const croppedMask = extract ? mask.extract(extract) : mask;
  const resizedInput = await croppedInput
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: sharp.kernel.lanczos3
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const resizedMask = await croppedMask
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: "contain",
      background: { r: 0, g: 0, b: 0 },
      kernel: sharp.kernel.lanczos3
    })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const data = Buffer.from(resizedInput.data);
  const channels = resizedInput.info.channels;
  for (let index = 0; index < targetWidth * targetHeight; index += 1) {
    const alphaOffset = index * channels + 3;
    const maskAlpha = resizedMask.data[index] || 0;
    data[alphaOffset] = Math.min(data[alphaOffset], maskAlpha > 18 ? maskAlpha : 0);
  }
  return sharp(data, { raw: { width: targetWidth, height: targetHeight, channels } }).png().toBuffer();
}

async function persistAigcResult(resultUrl, mediaType, options = {}) {
  if (!/^https?:\/\//i.test(resultUrl)) return null;
  const response = await axios.get(resultUrl, {
    responseType: "arraybuffer",
    timeout: 120000,
    maxContentLength: options.maxContentLengthBytes || 200 * 1024 * 1024,
    maxBodyLength: options.maxContentLengthBytes || 200 * 1024 * 1024
  });
  await ensureDir(STORAGE_DIR);
  const ext = options.transparentWhite ? ".png" : inferAigcFileExt(resultUrl, mediaType, response.headers?.["content-type"]);
  const filename = `aigc_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
  const filePath = path.join(STORAGE_DIR, filename);
  const rawBuffer = Buffer.from(response.data);
  const outputBuffer = options.transparentWhite
    ? await imageBufferWithTransparentWhiteBackground(rawBuffer, options.resize)
    : rawBuffer;
  await fs.writeFile(filePath, outputBuffer);
  return `/static/${filename}`;
}

async function resizeStaticImageToTarget(staticUrl, targetWidth, targetHeight, options = {}) {
  const sourcePath = staticUrlToLocalPath(staticUrl);
  await fs.access(sourcePath);
  const sourceMeta = await sharp(sourcePath).metadata();
  if (sourceMeta.width === targetWidth && sourceMeta.height === targetHeight) {
    return staticUrl;
  }
  await ensureDir(STORAGE_DIR);
  const quality = Number(options.quality) || 88;
  const outputFilename = `aigc_image_adapt_${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${targetWidth}x${targetHeight}.jpg`;
  const outputPath = path.join(STORAGE_DIR, outputFilename);
  const normalized = sharp(sourcePath).rotate().flatten({ background: "#ffffff" }).toColorspace("srgb");
  const background = await normalized
    .clone()
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: "cover",
      position: "center",
      kernel: sharp.kernel.lanczos3
    })
    .blur(24)
    .modulate({ brightness: 0.96, saturation: 0.9 })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();
  const foreground = await normalized
    .clone()
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: "contain",
      position: "center",
      kernel: sharp.kernel.lanczos3
    })
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();
  await sharp(background)
    .composite([{ input: foreground, gravity: "center" }])
    .jpeg({ quality, mozjpeg: true })
    .toFile(outputPath);
  return `/static/${outputFilename}`;
}

async function localVideoPathFromUrl(videoUrl, options = {}) {
  const publicStaticPath = publicUrlToStaticUrl(videoUrl, options.publicBaseUrl);
  const staticUrl = videoUrl?.startsWith("/static/") ? videoUrl : publicStaticPath;
  if (staticUrl) {
    const sourcePath = staticUrlToLocalPath(staticUrl);
    await fs.access(sourcePath);
    return sourcePath;
  }

  if (!/^https?:\/\//i.test(videoUrl || "")) {
    throw new Error("视频精准裁剪仅支持 http(s) URL 或本站 /static 路径");
  }

  const response = await axios.get(videoUrl, {
    responseType: "arraybuffer",
    timeout: 120000,
    maxContentLength: 500 * 1024 * 1024,
    maxBodyLength: 500 * 1024 * 1024
  });
  await ensureDir(STORAGE_DIR);
  const inferredExt = inferAigcFileExt(videoUrl, options.mediaType, response.headers?.["content-type"]);
  const ext = inferredExt === ".dat" ? ".mp4" : inferredExt;
  const filename = `aigc_video_source_${Date.now()}_${crypto.randomBytes(4).toString("hex")}${ext}`;
  const filePath = path.join(STORAGE_DIR, filename);
  await fs.writeFile(filePath, Buffer.from(response.data));
  return filePath;
}

async function preciseCropVideoToTarget(videoUrl, targetWidth, targetHeight, options = {}) {
  const sourcePath = await localVideoPathFromUrl(videoUrl, options);
  await ensureDir(STORAGE_DIR);
  const outputFilename = `aigc_video_precise_${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${targetWidth}x${targetHeight}.mp4`;
  const outputPath = path.join(STORAGE_DIR, outputFilename);
  await resizeVideoToDimensions(sourcePath, targetWidth, targetHeight, outputPath, { keepAudio: true });
  const outputStats = await fs.stat(outputPath);
  return {
    url: `/static/${outputFilename}`,
    width: targetWidth,
    height: targetHeight,
    sizeMB: Number((outputStats.size / 1024 / 1024).toFixed(2))
  };
}

async function createAigcExpandInputVideo(sourcePath, maxSide, options = {}) {
  await ensureDir(AIGC_INPUTS_DIR);
  const outputFilename = `video_expand_input_${Date.now()}_${crypto.randomBytes(4).toString("hex")}_max${maxSide}.mp4`;
  const outputPath = path.join(AIGC_INPUTS_DIR, outputFilename);
  await resizeVideoToMaxSide(sourcePath, maxSide, outputPath, {
    maxDurationSec: options.maxDurationSec,
    fps: options.fps
  });
  const outputStats = await fs.stat(outputPath);
  return {
    path: outputPath,
    staticUrl: `/static/aigc-inputs/${outputFilename}`,
    maxSide,
    sizeMB: Number((outputStats.size / 1024 / 1024).toFixed(2))
  };
}

async function prepareVideoInputForAigcExpand(videoUrl, aigcTarget, options = {}) {
  const publicBaseUrl = options.publicBaseUrl || "";
  const localStaticUrl = videoUrl?.startsWith("/static/")
    ? videoUrl
    : publicUrlToStaticUrl(videoUrl, publicBaseUrl);
  let sourcePath = "";

  if (localStaticUrl && hasAigcStandardVideoExt(localStaticUrl)) {
    sourcePath = staticUrlToLocalPath(localStaticUrl);
  } else if (/^https?:\/\//i.test(videoUrl || "") && hasAigcStandardVideoExt(videoUrl)) {
    sourcePath = await localVideoPathFromUrl(videoUrl, { publicBaseUrl, mediaType: "video/mp4" });
  }

  if (!sourcePath) {
    return { url: videoUrl, inputMode: "url", preprocessed: null };
  }

  const preprocessed = await createAigcExpandInputVideo(sourcePath, AIGC_VIDEO_EXPAND_MAX_SIDE, {
    maxDurationSec: options.maxDurationSec,
    fps: options.fps
  });
  const observerConfig = getObserverConfig();
  if (observerConfig.accessId && observerConfig.biz && observerConfig.cdnDomain) {
    return {
      url: await uploadLocalVideoToObserverUrl(preprocessed.path),
      inputMode: "observer-url-preprocessed",
      preprocessed
    };
  }

  if (!publicBaseUrl) {
    throw new Error("AI 视频扩展需要公网视频 URL。当前本地未配置 OBSERVER_* 上传中转，也未配置 AIGC_PUBLIC_BASE_URL，任务无法投递到美图后台。");
  }

  return {
    url: publicStaticUrl(preprocessed.staticUrl, publicBaseUrl),
    inputMode: "public-static-preprocessed",
    preprocessed
  };
}

async function resolveOpenapiAdaptVideoUrl(videoUrl, context = {}) {
  const config = context.config || getAigcConfig();
  const publicBaseUrl = context.publicBaseUrl || config.publicBaseUrl || "";
  if (/^https?:\/\//i.test(videoUrl || "")) return videoUrl;
  if (!videoUrl?.startsWith("/static/")) {
    throw new Error("视频输入需要是 http(s) URL 或本站 /static 路径");
  }
  if (publicBaseUrl) {
    return publicStaticUrl(videoUrl, publicBaseUrl);
  }
  const observerConfig = getObserverConfig();
  if (observerConfig.accessId && observerConfig.biz && observerConfig.cdnDomain) {
    return uploadStaticVideoToObserverUrl(videoUrl);
  }
  throw new Error("当前未配置 AIGC_PUBLIC_BASE_URL 或 OBSERVER_*，无法将本地视频投递给美图算法");
}

async function locallyRemoveWhiteBackgroundFromVideo(videoUrl, options = {}) {
  const sourcePath = await localVideoPathFromUrl(videoUrl, {
    publicBaseUrl: options.publicBaseUrl,
    mediaType: "video/mp4"
  });
  await ensureDir(STORAGE_DIR);
  const outputFilename = `video_subject_cutout_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.webm`;
  const outputPath = path.join(STORAGE_DIR, outputFilename);
  await removeWhiteBackgroundFromVideo(sourcePath, outputPath, {
    similarity: options.similarity,
    blend: options.blend,
    fps: options.fps,
    maxDurationSec: options.maxDurationSec,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight
  });
  return {
    resultUrl: `/static/${outputFilename}`,
    method: "local-white-key"
  };
}

async function cutoutVideoForegroundWithAigc(videoUrl, options = {}) {
  const config = options.config || getAigcConfig();
  const warnings = [];

  if (config.videoCutoutTask) {
    try {
      const inputVideoUrl = await resolveOpenapiAdaptVideoUrl(videoUrl, {
        config,
        publicBaseUrl: options.publicBaseUrl
      });
      const providerResult = await submitDirectOpenapiMediaTask({
        task: config.videoCutoutTask,
        parameter: {
          rsp_media_type: "url",
          ...(options.prompt ? { prompt: options.prompt } : {})
        },
        mediaInfoList: [mediaInfoFromUrl(inputVideoUrl)],
        extra: {},
        initialDelayMs: 3000,
        pollIntervalMs: 5000,
        maxPolls: 120,
        config
      });
      if (providerResult?.resultUrl) {
        return {
          ok: true,
          resultUrl: providerResult.resultUrl,
          remoteResultUrl: providerResult.remoteResultUrl,
          method: "provider-cutout",
          warnings,
          raw: providerResult.raw
        };
      }
      warnings.push("provider-cutout-returned-empty-result");
    } catch (err) {
      warnings.push(`provider-cutout-failed: ${err.message}`);
      console.warn("[AIGC Video Cutout] provider failed, fallback to local white key:", err.message);
    }
  } else {
    warnings.push("provider-cutout-skipped: AIGC_VIDEO_CUTOUT_TASK not configured");
  }

  const fallback = await locallyRemoveWhiteBackgroundFromVideo(videoUrl, {
    publicBaseUrl: options.publicBaseUrl,
    similarity: options.similarity,
    blend: options.blend,
    fps: options.fps,
    maxDurationSec: options.maxDurationSec,
    maxWidth: options.maxWidth,
    maxHeight: options.maxHeight
  });
  return {
    ok: true,
    resultUrl: fallback.resultUrl,
    remoteResultUrl: "",
    method: fallback.method,
    warnings
  };
}

async function pushAigcTask({
  task,
  params,
  mediaInfoList = [],
  extra,
  taskType = "mtlab",
  rspMediaType = "url",
  publicBaseUrl,
  mediaOptions
}) {
  const config = getAigcConfig();
  if (!config.publicBaseUrl && publicBaseUrl) {
    config.publicBaseUrl = publicBaseUrl.replace(/\/+$/, "");
  }
  if (!config.ak || !config.sk) {
    throw new Error("后端缺少 AIGC_AK / AIGC_SK 环境变量");
  }

  const pushUrl = `${config.apiHost}/api/v1/push`;
  const normalizedMediaInfoList = await normalizeMediaInfoListForAigc(mediaInfoList, config, mediaOptions);
  const taskPayload = {
    ...(normalizedMediaInfoList.length ? { media_info_list: normalizedMediaInfoList } : {}),
    ...params,
    ...(extra ? { extra } : {})
  };
  const payload = {
    task,
    task_type: taskType,
    biz: config.biz,
    params: JSON.stringify(taskPayload),
    rsp_media_type: rspMediaType,
    ...(normalizedMediaInfoList.length
      ? {
          media_info_list: normalizedMediaInfoList,
          mediaInfoList: normalizedMediaInfoList
        }
      : {})
  };
  const initImages = initImagesFromMediaInfoList(normalizedMediaInfoList);
  if (initImages.length > 0) payload.init_images = initImages;

  console.log("[AIGC] push start", JSON.stringify({
    task,
    taskType,
    mediaCount: normalizedMediaInfoList.length,
    mediaTypes: normalizedMediaInfoList.map(item => item?.media_profiles?.media_data_type || "unknown")
  }));
  const pushed = await aigcJsonRequest(pushUrl, "POST", payload, config);
  if (pushed?.code !== 0) {
    throw new Error(pushed?.message || pushed?.error_msg || `AIGC 任务投递失败: ${JSON.stringify(pushed)}`);
  }
  const taskId = pushed?.data?.task_id;
  if (!taskId) {
    throw new Error("AIGC 投递成功但未返回 task_id");
  }
  console.log("[AIGC] push success", JSON.stringify({ task, taskId }));

  return {
    taskId,
    config,
    raw: pushed,
    payload,
    taskPayload,
    normalizedMediaInfoList
  };
}

function createAigcTaskFailureError(statusData, taskId) {
  const taskData = statusData?.data || {};
  const resultError = taskData.result?.msg || taskData.result?.data?.ErrorMsg || taskData.result?.mtlab_res?.ErrorMsg || "";
  const error = new Error(resultError || taskData.message || statusData?.message || statusData?.error_msg || `AIGC task failed: ${JSON.stringify(statusData)}`);
  error.taskId = taskId;
  return error;
}

async function getAigcTaskResultOnce(taskId, options = {}) {
  const config = options.config || getAigcConfig();
  if (!config.ak || !config.sk) {
    throw new Error("后端缺少 AIGC_AK / AIGC_SK 环境变量");
  }

  const statusUrl = `${config.apiHost}/api/v1/sdk/status`;
  const queryUrl = `${statusUrl}?${new URLSearchParams({ task_id: taskId }).toString()}`;
  const statusData = await aigcJsonRequest(queryUrl, "GET", null, config);
  const mediaInfoList = extractAigcResultMedia(statusData);
  const state = getAigcTaskState(statusData);
  if (state === "success" && mediaInfoList.length > 0) {
    const resultUrl = mediaInfoList[0].media_data || mediaInfoList[0].media_url || "";
    let storedUrl = "";
    try {
      storedUrl = await persistAigcResult(resultUrl, mediaInfoList[0].media_type, options.persistOptions);
    } catch (err) {
      console.warn("[AIGC] result persistence failed, using remote URL:", err.message);
    }
    return {
      status: "success",
      taskId,
      resultUrl: storedUrl || resultUrl,
      remoteResultUrl: resultUrl,
      mediaInfo: mediaInfoList[0],
      raw: statusData
    };
  }
  return {
    status: state === "success" ? (options.emptySuccessStatus || "processing") : state,
    taskId,
    summary: summarizeAigcTaskStatus(statusData),
    raw: statusData
  };
}

async function submitAigcTask({
  task,
  params,
  mediaInfoList = [],
  extra,
  taskType = "mtlab",
  rspMediaType = "url",
  initialDelayMs = 0,
  pollIntervalMs,
  maxPolls,
  persistOptions,
  publicBaseUrl,
  mediaOptions
}) {
  const { taskId, config } = await pushAigcTask({
    task,
    taskType,
    params,
    mediaInfoList,
    extra,
    rspMediaType,
    publicBaseUrl,
    mediaOptions
  });

  if (initialDelayMs > 0) {
    await sleep(initialDelayMs);
  }

  const pollingInterval = Math.max(500, Number(pollIntervalMs || config.pollIntervalMs));
  const pollingMax = Math.max(1, Number(maxPolls || config.maxPolls));
  for (let index = 0; index < pollingMax; index += 1) {
    await sleep(pollingInterval);
    let result;
    try {
      result = await getAigcTaskResultOnce(taskId, { config, persistOptions });
    } catch (err) {
      if (isAigcTimeoutError(err)) {
        console.warn(`[AIGC] status polling timeout, continuing: task=${taskId}, poll=${index + 1}/${pollingMax}, error=${err.message}`);
        continue;
      }
      throw err;
    }
    if (result.status === "success") return result;
    if (result.status === "failed") throw createAigcTaskFailureError(result.raw, taskId);
  }

  throw new Error(`AIGC 任务超时未完成: ${taskId}`);
}

async function submitAigcDirectRequest(endpoint, payload) {
  const config = getAigcConfig();
  if (!config.ak || !config.sk) {
    throw new Error("后端缺少 AIGC_AK / AIGC_SK 环境变量");
  }
  const url = `${config.apiHost}${endpoint}`;
  const raw = await aigcJsonRequest(url, "POST", payload, config);
  const errorCode = raw?.error_code ?? raw?.code;
  if (![undefined, 0].includes(errorCode)) {
    throw new Error(raw?.error_msg || raw?.message || "AIGC 同步接口调用失败");
  }
  const remoteResultUrl = extractAigcDirectResultUrl(raw);
  let resultUrl = remoteResultUrl;
  if (remoteResultUrl) {
    try {
      resultUrl = await persistAigcResult(remoteResultUrl, raw?.data?.media_type);
    } catch (err) {
      console.warn("[AIGC] direct result persistence failed, using remote URL:", err.message);
    }
  }
  return { resultUrl, remoteResultUrl, raw };
}

async function submitAigcExpandTask({
  imageUrl,
  targetRatio = "16:9",
  prompt,
  seed = -1,
  publicBaseUrl,
  mediaOptions,
  persistOptions
}) {
  const conservativePrompt = [
    AIGC_CONSERVATIVE_ADAPT_EXPAND_PROMPT,
    "This is not an image generation task. It is background-only outpainting for an existing poster.",
    "Use only visual information already present in the uploaded image. Empty/simple background is preferred over adding content.",
    prompt || AIGC_DEFAULT_PROMPT
  ].filter(Boolean).join(" ");
  const params = {
    parameter: {
      base_model_name: "miracle_vision_edit",
      prompt: conservativePrompt,
      negative_prompt: AIGC_NO_NEW_CONTENT_NEGATIVE_PROMPT,
      rsp_media_type: "url",
      seed: Number.isFinite(Number(seed)) ? Number(seed) : -1,
      extra_pipe_inputs: {
        task_type: "outpainting",
        target_ratio: targetRatio
      }
    }
  };
  return submitAigcTask({
    task: AIGC_TASKS.dispatcher,
    params,
    mediaInfoList: [mediaInfoFromUrl(imageUrl)],
    publicBaseUrl,
    mediaOptions,
    persistOptions
  });
}

async function submitAigcSmartCropTask({
  imageUrl,
  targetWidth,
  targetHeight,
  baseModelName = "miracle_vision_edit",
  publicBaseUrl,
  mediaOptions,
  persistOptions
}) {
  return submitAigcTask({
    task: AIGC_TASKS.dispatcher,
    params: {
      parameter: {
        base_model_name: baseModelName,
        rsp_media_type: "url",
        extra_pipe_inputs: {
          task_type: "smart_crop",
          target_width: toPositiveInt(targetWidth),
          target_height: toPositiveInt(targetHeight)
        }
      }
    },
    mediaInfoList: [mediaInfoFromUrl(imageUrl)],
    publicBaseUrl,
    mediaOptions,
    persistOptions
  });
}

async function ensureStaticImageUrlForResize(imageUrl) {
  if (!imageUrl || typeof imageUrl !== "string") return imageUrl;
  if (imageUrl.startsWith("/static/")) return imageUrl;
  if (!/^https?:\/\//i.test(imageUrl)) return imageUrl;
  const stored = await persistAigcResult(imageUrl);
  return stored || imageUrl;
}

async function persistBase64Image(base64Value, prefix = "aigc_mask") {
  if (!base64Value || typeof base64Value !== "string") return "";
  const cleaned = base64Value.replace(/^data:image\/\w+;base64,/, "");
  if (!/^[A-Za-z0-9+/=\r\n]+$/.test(cleaned.trim())) return "";
  const buffer = Buffer.from(cleaned, "base64");
  if (!buffer.length) return "";
  await ensureDir(STORAGE_DIR);
  const filename = `${prefix}_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.png`;
  const outputPath = path.join(STORAGE_DIR, filename);
  await sharp(buffer).png().toFile(outputPath);
  return `/static/${filename}`;
}

function isLikelyBase64Image(value = "") {
  return typeof value === "string" && !/^https?:\/\//i.test(value) && !value.startsWith("/static/") && value.length > 80;
}

async function persistProviderImageValue(value, prefix = "aigc_provider") {
  if (!value || typeof value !== "string") return "";
  if (value.startsWith("/static/")) return value;
  if (/^https?:\/\//i.test(value)) {
    try {
      return await persistAigcResult(value);
    } catch (err) {
      console.warn(`[AdaptImage] failed to persist ${prefix} URL:`, err.message);
      return value;
    }
  }
  if (isLikelyBase64Image(value)) {
    try {
      return await persistBase64Image(value, prefix);
    } catch (err) {
      console.warn(`[AdaptImage] failed to persist ${prefix} base64:`, err.message);
    }
  }
  return "";
}

async function maskUrlToGrayRaw(maskUrl, width, height) {
  if (!maskUrl) return null;
  const localPath = maskUrl.startsWith("/static/") ? staticUrlToLocalPath(maskUrl) : null;
  if (!localPath) return null;
  const { data, info } = await sharp(localPath)
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

async function mergeProtectedMasks(maskUrls = [], width, height) {
  const validUrls = maskUrls.filter(Boolean);
  if (!validUrls.length || !width || !height) return null;
  const merged = Buffer.alloc(width * height, 0);
  let used = 0;
  for (const maskUrl of validUrls) {
    try {
      const raw = await maskUrlToGrayRaw(maskUrl, width, height);
      if (!raw) continue;
      for (let index = 0; index < merged.length; index += 1) {
        if (raw.data[index] > merged[index]) merged[index] = raw.data[index];
      }
      used += 1;
    } catch (err) {
      console.warn("[AdaptImage] mask merge skipped:", err.message);
    }
  }
  if (!used) return null;
  await ensureDir(STORAGE_DIR);
  const protectedFilename = `protected_mask_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.png`;
  const protectedPath = path.join(STORAGE_DIR, protectedFilename);
  await sharp(merged, { raw: { width, height, channels: 1 } }).png().toFile(protectedPath);

  const editable = Buffer.alloc(merged.length);
  for (let index = 0; index < merged.length; index += 1) {
    editable[index] = 255 - merged[index];
  }
  const editableFilename = `editable_mask_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.png`;
  const editablePath = path.join(STORAGE_DIR, editableFilename);
  await sharp(editable, { raw: { width, height, channels: 1 } }).png().toFile(editablePath);

  return {
    protectedMaskUrl: `/static/${protectedFilename}`,
    editableMaskUrl: `/static/${editableFilename}`,
    sourceCount: used
  };
}

const ADAPT_API_STYLES = {
  openapi: "openapi",
  aiPlatform: "ai-platform"
};

const ADAPT_ENDPOINTS = {
  openapi: {
    saliency: "sod",
    logo: "logo_seg",
    text: "textdetect_img",
    posterLayer: "poster_edit_layer_async",
    posterDesign: "poster_trans_design_async",
    expand: "image_extension_async",
    inpaint: "image_manipulation_fl_async",
    crop: "image_cropping_async"
  },
  "ai-platform": {
    saliency: "/v1/vision/saliency/saliency_segmentation",
    logo: "/v1/vision/logo/logo_segmentation",
    text: "/v1/vision/ocr/text_detection",
    expand: "/v2/ai_ext/outpainting",
    inpaint: "/v2/ai_ext/inpainting",
    crop: "/v2/ai_ext/image_cropping_async"
  }
};

const OPENAPI_DIRECT_ASYNC_ENDPOINTS = new Set([
  "mtimage_expand_v4_async",
  "image_extension_async",
  "image_manipulation_fl_async",
  "image_cropping_async",
  "ltx_2_async",
  "poster_edit_layer_async",
  "poster_trans_design_async"
]);

function resolveOpenapiEndpointUrl(apiName, config) {
  if (/^https?:\/\//i.test(apiName)) return apiName;
  if (apiName === "mtimage_expand_v4_async") {
    return `${config.mtlabApiHost}/v1/${apiName}`;
  }
  if (apiName === "image_extension_async") {
    return `${config.mtlabApiHost}/v1/${apiName}`;
  }
  if (apiName === "ltx_2_async") {
    return `${config.mtlabApiHost}/v1/${apiName}`;
  }
  if (apiName === "poster_edit_layer_async") {
    return `${config.mtlabApiHost}/v1/${apiName}`;
  }
  if (apiName === "poster_trans_design_async") {
    return `${config.mtlabApiHost}/v1/${apiName}`;
  }
  if (apiName === "logo_seg") {
    return `${config.aiApiHost}/v1/${apiName}`;
  }
  if (apiName === "textdetect_img") {
    return `${config.mtlabApiHost}/v1/textdetect_img`;
  }
  return `${config.apiHost}/v1/${apiName}`;
}

function resolveOpenapiEndpointCandidates(apiName, config) {
  if (apiName === "textdetect_img") {
    const hosts = [
      config.mtlabApiHost,
      config.aiApiHost,
      config.apiHost
    ].filter(Boolean).map(host => String(host).replace(/\/+$/, ""));
    const paths = ["/v1/textdetect_img", "/v1/textdetect", "/v1/vision/ocr/text_detection"];
    return [
      ...new Set(hosts.flatMap(host => paths.map(endpointPath => `${host}${endpointPath}`)))
    ];
  }
  return [resolveOpenapiEndpointUrl(apiName, config)];
}

function isProviderNoRouteError(raw) {
  const message = normalizeProviderMessage(raw).toLowerCase();
  return message.includes("no route found") || message.includes("404");
}

function isProviderPollEndpointMismatch(raw) {
  const message = normalizeProviderMessage(raw).toLowerCase();
  return message.includes("invalid arguments") || message.includes("invalid argument");
}

function isProviderTaskNotFound(raw) {
  const message = normalizeProviderMessage(raw).toLowerCase();
  return message.includes("task not found") || message.includes("not found");
}

function summarizePollProbeResult(endpoint, raw) {
  const code = raw?.code ?? raw?.error_code ?? raw?.status_code ?? raw?.httpStatus ?? "";
  const status = raw?.data?.status ?? raw?.status ?? "";
  const message = normalizeProviderMessage(raw) || "";
  return {
    endpoint,
    code,
    status,
    message: String(message).slice(0, 180)
  };
}

function shouldUseOpenapiMessageEnvelope(apiName) {
  return false;
}

function getAdaptApiStyle(config = getAigcConfig()) {
  if (config.apiStyle === ADAPT_API_STYLES.aiPlatform || config.authMode === "platform_header" || config.authMode === "header") {
    return ADAPT_API_STYLES.aiPlatform;
  }
  return ADAPT_API_STYLES.openapi;
}

function normalizeProviderCode(raw) {
  if (!raw || typeof raw !== "object") return undefined;
  return raw?.code ?? raw?.error_code ?? raw?.status_code ?? 0;
}

function normalizeProviderMessage(raw) {
  if (typeof raw === "string") return raw;
  return raw?.message || raw?.error_msg || raw?.msg || raw?.data?.message || raw?.data?.error_msg || raw?.data?.msg || "";
}

function isTransientUpstreamMessage(message = "") {
  return /upstream connect error|disconnect\/reset before headers|connection termination|connection reset|reset reason|econnreset|socket hang up|gateway timeout|bad gateway|service unavailable|temporarily unavailable/i.test(String(message || ""));
}

function extractOpenapiTaskTraceId(raw) {
  return raw?.data?.task_id
    || raw?.task_id
    || raw?.data?.trace_id
    || raw?.trace_id
    || raw?.data?.request_id
    || raw?.request_id
    || raw?.data?.traceId
    || raw?.traceId
    || "";
}

function isProviderPermissionError(raw) {
  const text = JSON.stringify(raw || {}).toLowerCase();
  return text.includes("permission") || text.includes("unauthorized") || text.includes("forbidden") || text.includes("no auth") || text.includes("no_permission");
}

function isProviderPermissionException(err) {
  if (!err) return false;
  return Boolean(err.permission) || isProviderPermissionError(err.providerRaw) || /forbidden|permission|unauthorized|no auth|no_permission/i.test(err.message || "");
}

function isProviderSuccess(raw) {
  if (!raw || typeof raw !== "object") return false;
  const code = normalizeProviderCode(raw);
  return [null, 0, "0"].includes(code) || raw?.data?.status === "completed";
}

function createProviderError(stage, endpoint, raw) {
  const message = normalizeProviderMessage(raw) || `${stage} 调用失败`;
  const error = new Error(`${stage}/${endpoint}: ${message}`);
  error.stage = stage;
  error.endpoint = endpoint;
  error.providerRaw = raw;
  error.permission = isProviderPermissionError(raw);
  error.transientUpstream = isTransientUpstreamMessage(message);
  return error;
}

function summarizeMediaInfoList(mediaInfoList = []) {
  return (Array.isArray(mediaInfoList) ? mediaInfoList : []).map((item, index) => {
    const mediaData = item?.media_data;
    const mediaType = item?.media_profiles?.media_data_type || "unknown";
    const isHttp = typeof mediaData === "string" && /^https?:\/\//i.test(mediaData);
    const isStatic = typeof mediaData === "string" && mediaData.startsWith("/static/");
    return {
      index,
      mediaType,
      source: isHttp ? "http" : isStatic ? "static" : "inline",
      size: typeof mediaData === "string" ? mediaData.length : 0,
      preview: typeof mediaData === "string"
        ? isHttp || isStatic
          ? mediaData.slice(0, 120)
          : `${mediaData.slice(0, 24)}...`
        : ""
    };
  });
}

function summarizeAdaptPayload(payload = {}) {
  return {
    parameterKeys: Object.keys(payload?.parameter || {}),
    bodyKeys: Object.keys(payload?.body || {}),
    mediaCount: Array.isArray(payload?.media_info_list) ? payload.media_info_list.length : 0,
    mediaList: summarizeMediaInfoList(payload?.media_info_list || [])
  };
}

function summarizeProviderRaw(raw) {
  const data = raw?.data || {};
  const mediaList = extractAigcResultMedia(raw);
  return {
    code: normalizeProviderCode(raw),
    message: normalizeProviderMessage(raw),
    dataKeys: Object.keys(data || {}),
    mediaListCount: Array.isArray(mediaList) ? mediaList.length : 0,
    hasMsgId: Boolean(raw?.msg_id || data?.msg_id),
    hasTaskId: Boolean(raw?.task_id || data?.task_id),
    status: data?.status || raw?.status || ""
  };
}

function summarizeLtxSubmitPayload(payload = {}) {
  const mediaList = Array.isArray(payload?.media_info_list) ? payload.media_info_list : [];
  return {
    parameterKeys: Object.keys(payload?.parameter || {}),
    taskType: payload?.parameter?.task_type || "",
    promptLength: typeof payload?.parameter?.prompt === "string" ? payload.parameter.prompt.length : 0,
    mediaCount: mediaList.length,
    mediaList: summarizeMediaInfoList(mediaList)
  };
}

function summarizeLtxSubmitResponse(raw) {
  return {
    code: normalizeProviderCode(raw),
    message: normalizeProviderMessage(raw),
    taskId: raw?.data?.task_id || raw?.task_id || "",
    msgId: raw?.data?.msg_id || raw?.msg_id || "",
    dataKeys: Object.keys(raw?.data || {})
  };
}

function summarizeLtxPollResponse(raw) {
  const mediaList = extractAigcResultMedia(raw);
  return {
    state: getOpenapiPollState(raw),
    code: normalizeProviderCode(raw),
    message: normalizeProviderMessage(raw),
    dataKeys: Object.keys(raw?.data || {}),
    mediaCount: mediaList.length,
    firstMedia: mediaList[0]
      ? {
          mediaType: mediaList[0]?.media_type || "",
          mediaUrl: mediaList[0]?.media_url || mediaList[0]?.media_data || ""
        }
      : null
  };
}

function logOpenapiRequestDebug(label, url, payload, method = "POST") {
  try {
    const bodyText = JSON.stringify(payload, null, 2);
    const bodySize = JSON.stringify(payload).length;
    console.log(`[${label}] 🔍 请求详情`);
    console.log(`[${label}]   URL: ${url}`);
    console.log(`[${label}]   Method: ${method}`);
    console.log(`[${label}]   Body:`);
    console.log(bodyText);
    console.log(`[${label}]   Body Size: ${bodySize} bytes`);
  } catch (err) {
    console.log(`[${label}] 🔍 请求详情打印失败: ${err.message}`);
  }
}

function logOpenapiPollDebug(label, url, taskId, method) {
  console.log(`[${label}] 🔍 轮询详情`);
  console.log(`[${label}]   URL: ${url}`);
  console.log(`[${label}]   task_id: ${taskId}`);
  console.log(`[${label}]   Method: ${method}`);
}

async function debugPollEndpoints(host, msgId, apiKey, apiSecret) {
  const endpoints = [
    {
      name: "endpoint-1: /openapi-poll/query_result (GET)",
      build: () => ({
        method: "GET",
        url: `${host}/openapi-poll/query_result?api_key=${apiKey}&api_secret=${apiSecret}&msg_id=${msgId}`,
        parseJson: true
      })
    },
    {
      name: "endpoint-2: /v1/algorithm/poll (POST)",
      build: () => ({
        method: "POST",
        url: `${host}/v1/algorithm/poll?api_key=${apiKey}&api_secret=${apiSecret}&msg_id=${msgId}`,
        body: { body: { msg_id: msgId } },
        parseJson: true
      })
    },
    {
      name: "endpoint-3: /v1/mtimage_expand_v4/result (GET)",
      build: () => ({
        method: "GET",
        url: `${host}/v1/mtimage_expand_v4/result?api_key=${apiKey}&api_secret=${apiSecret}&msg_id=${msgId}`,
        parseJson: true
      })
    },
    {
      name: "endpoint-4: /api/v1/sdk/status (GET, msg_id)",
      build: () => ({
        method: "GET",
        url: `${host}/api/v1/sdk/status?api_key=${apiKey}&api_secret=${apiSecret}&msg_id=${msgId}`,
        parseJson: true
      })
    },
    {
      name: "endpoint-5: /api/v1/sdk/status (GET, task_id)",
      build: () => ({
        method: "GET",
        url: `${host}/api/v1/sdk/status?api_key=${apiKey}&api_secret=${apiSecret}&task_id=${msgId}`,
        parseJson: true
      })
    }
  ];

  console.log(`\n[POLL-DEBUG] 开始探测 ${endpoints.length} 个轮询路径，task_msg_id=${msgId}\n`);

  for (const endpoint of endpoints) {
    const spec = endpoint.build();
    console.log(`[POLL-DEBUG] ====== ${endpoint.name} ======`);
    console.log(`[POLL-DEBUG]   ${spec.method} ${spec.url}`);
    try {
      const response = await fetch(spec.url, {
        method: spec.method,
        ...(spec.body
          ? { body: JSON.stringify(spec.body), headers: { "Content-Type": "application/json" } }
          : {})
      });
      console.log(`[POLL-DEBUG]   HTTP Status: ${response.status} ${response.statusText}`);
      console.log("[POLL-DEBUG]   Headers:");
      console.log("               ", Object.fromEntries(response.headers.entries()));
      const raw = await response.text();
      console.log(`[POLL-DEBUG]   Raw Body (${raw.length} chars):`);
      console.log(raw.slice(0, 2000));
      if (raw.length > 2000) {
        console.log(`              ... [截断，总长 ${raw.length} 字符]`);
      }
      if (spec.parseJson) {
        try {
          const parsed = JSON.parse(raw);
          console.log("[POLL-DEBUG]   Parsed JSON Keys:", Object.keys(parsed));
          if (parsed.code !== undefined) console.log("[POLL-DEBUG]   code:", parsed.code);
          if (parsed.status !== undefined) console.log("[POLL-DEBUG]   status:", parsed.status);
          if (parsed.error !== undefined) console.log("[POLL-DEBUG]   error:", JSON.stringify(parsed.error));
          if (parsed.message !== undefined) console.log("[POLL-DEBUG]   message:", parsed.message);
        } catch {}
      }
    } catch (err) {
      console.log(`[POLL-DEBUG]   ❌ ERROR: ${err.message}`);
    }
    console.log();
  }
}

async function debugPollEndpointsV2(host, msgId, apiKey, apiSecret) {
  const endpoints = [
    {
      name: "A: /api/v1/sdk/status (task_id + msg_id)",
      method: "GET",
      url: `${host}/api/v1/sdk/status?api_key=${apiKey}&api_secret=${apiSecret}&task_id=${msgId}&msg_id=${msgId}`
    },
    {
      name: "B: /api/v1/sdk/task_status",
      method: "GET",
      url: `${host}/api/v1/sdk/task_status?api_key=${apiKey}&api_secret=${apiSecret}&task_id=${msgId}`
    },
    {
      name: "C: /api/v1/sdk/status (POST, body)",
      method: "POST",
      url: `${host}/api/v1/sdk/status?api_key=${apiKey}&api_secret=${apiSecret}`,
      body: { task_id: msgId }
    },
    {
      name: "D: /v1/algorithm/status",
      method: "GET",
      url: `${host}/v1/algorithm/status?api_key=${apiKey}&api_secret=${apiSecret}&task_id=${msgId}`
    },
    {
      name: "E: /v1/task/result",
      method: "GET",
      url: `${host}/v1/task/result?api_key=${apiKey}&api_secret=${apiSecret}&task_id=${msgId}`
    },
    {
      name: "F: /api/v1/sdk/task_id (msg_id 查 task_id)",
      method: "GET",
      url: `${host}/api/v1/sdk/task_id?api_key=${apiKey}&api_secret=${apiSecret}&msg_id=${msgId}`
    }
  ];

  console.log(`\n[POLL-V2] 探测 ${endpoints.length} 个新路径\n`);

  for (const endpoint of endpoints) {
    console.log(`[POLL-V2] ====== ${endpoint.name} ======`);
    console.log(`[POLL-V2]   ${endpoint.method} ${endpoint.url.replace(apiKey, "***").replace(apiSecret, "***")}`);
    try {
      const response = await fetch(endpoint.url, {
        method: endpoint.method,
        ...(endpoint.body
          ? {
              body: JSON.stringify(endpoint.body),
              headers: { "Content-Type": "application/json" }
            }
          : {})
      });
      console.log(`[POLL-V2]   HTTP: ${response.status} ${response.statusText}`);
      const raw = await response.text();
      console.log(`[POLL-V2]   Body: ${raw.slice(0, 500)}`);
      if (response.status === 200) {
        try {
          const parsed = JSON.parse(raw);
          if ([0, 200, 20000].includes(parsed.code) || parsed.status === "finished") {
            console.log("[POLL-V2]   ✅ ✅ ✅ 命中！");
          }
        } catch {}
      }
    } catch (err) {
      console.log(`[POLL-V2]   ❌ ${err.message}`);
    }
    console.log();
  }
}

function buildOpenapiDirectBody(payload = {}, options = {}) {
  const mediaList = payload.media_info_list || [];
  const parameter = payload.parameter || {};
  const message = {
    ...(payload.body || {}),
    ...(Object.keys(parameter).length ? { parameter } : {}),
    ...(mediaList.length ? { media_info_list: mediaList } : {})
  };
  return options.wrapMessage ? { message } : message;
}

function buildOpenapiAsyncBody(payload = {}, options = {}) {
  const mediaList = payload.media_info_list || [];
  const parameter = payload.parameter && typeof payload.parameter === "object" ? payload.parameter : {};
  if (options.wrapMessage) {
    return {
      message: {
        ...(payload.body || {}),
        ...(Object.keys(parameter).length ? { parameter } : {}),
        ...(mediaList.length ? { media_info_list: mediaList } : {})
      }
    };
  }
  const flattenedParameter = { ...parameter };
  if (flattenedParameter.parameter && typeof flattenedParameter.parameter === "object") {
    Object.assign(flattenedParameter, flattenedParameter.parameter);
    delete flattenedParameter.parameter;
  }

  return {
    ...(payload.body || {}),
    ...flattenedParameter,
    ...(mediaList.length ? { media_info_list: mediaList } : {})
  };
}

async function callOpenapiV3Sync(apiName, payload, options = {}) {
  const config = options.config || getAigcConfig();
  if (!config.ak || !config.sk) throw new Error("后端缺少 AIGC_AK / AIGC_SK 环境变量");
  const requestPayload = buildOpenapiDirectBody(payload, { wrapMessage: shouldUseOpenapiMessageEnvelope(apiName) });
  const debugLabelMap = {
    sod: "SOD",
    logo_seg: "LOGO",
    textdetect_img: "TEXT"
  };
  const debugLabel = debugLabelMap[apiName];
  const candidates = resolveOpenapiEndpointCandidates(apiName, config);
  let lastRaw = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const url = candidates[index];
    const requestUrl = withAigcQueryAuth(url, config, { withMsgId: true });
    if (debugLabel) {
      if (candidates.length > 1) {
        console.log(`[${debugLabel}] route candidate ${index + 1}/${candidates.length}: ${url}`);
      }
      logOpenapiRequestDebug(debugLabel, requestUrl, requestPayload, "POST");
    }
    const raw = await aigcJsonRequest(requestUrl, "POST", requestPayload, { ...config, authMode: "none" });
    if (isProviderSuccess(raw)) return raw?.data || raw;
    lastRaw = raw;
    if (!isProviderNoRouteError(raw) || index === candidates.length - 1) {
      throw createProviderError("openapi-sync", apiName, raw);
    }
  }

  throw createProviderError("openapi-sync", apiName, lastRaw || { message: "no route found" });
}

async function submitOpenapiV3Async(apiName, payload, options = {}) {
  const config = options.config || getAigcConfig();
  if (!config.ak || !config.sk) throw new Error("后端缺少 AIGC_AK / AIGC_SK 环境变量");
  if (OPENAPI_DIRECT_ASYNC_ENDPOINTS.has(apiName)) {
    const url = resolveOpenapiEndpointUrl(apiName, config);
    const requestPayload = options.preserveBody
      ? {
          ...(payload && typeof payload === "object" ? payload : {}),
          ...(payload?.extra_params && !payload?.extra
            ? { extra: payload.extra_params }
            : {})
        }
      : buildOpenapiAsyncBody(payload, { wrapMessage: shouldUseOpenapiMessageEnvelope(apiName) });
    if (!options.preserveBody && payload.extra_params && Object.keys(payload.extra_params).length) {
      requestPayload.extra_params = payload.extra_params;
    }
    const requestUrl = withAigcQueryAuth(url, config);
    if (apiName === "mtimage_expand_v4_async") {
      logOpenapiRequestDebug("EXPAND", requestUrl, requestPayload, "POST");
    }
    if (apiName === "ltx_2_async") {
      logOpenapiRequestDebug("LTX", requestUrl, requestPayload, "POST");
      console.log("[LTX] submit payload summary", JSON.stringify(summarizeLtxSubmitPayload(requestPayload)));
    }
    const raw = await aigcJsonRequest(requestUrl, "POST", requestPayload, { ...config, authMode: "none" });
    if (apiName === "ltx_2_async") {
      console.log("[LTX] submit response summary", JSON.stringify(summarizeLtxSubmitResponse(raw)));
    }
    if (apiName === "mtimage_expand_v4_async") {
      console.log("[EXPAND] 🔍 提交响应");
      console.log("[EXPAND]   keys:", Object.keys(raw || {}));
      console.log("[EXPAND]   task_id:", raw?.data?.task_id || raw?.task_id || "");
      console.log("[EXPAND]   msg_id:", raw?.data?.msg_id || raw?.msg_id || "");
      console.log("[EXPAND]   data keys:", Object.keys(raw?.data || {}));
    }
    if (!isProviderSuccess(raw)) throw createProviderError("openapi-submit", apiName, raw);
    const directTaskId = raw?.data?.task_id || raw?.task_id || "";
    const directMsgId = raw?.data?.msg_id || raw?.msg_id || "";
    const pollId = directTaskId || directMsgId;
    if (!pollId) throw createProviderError("openapi-submit", apiName, { ...raw, message: "No task_id or msg_id in response" });
    if (apiName === "mtimage_expand_v4_async" && directMsgId) {
      console.log("[EXPAND] submit success, msg_id:", directMsgId);
      await debugPollEndpoints(new URL(url).origin, directMsgId, config.ak, config.sk);
      await debugPollEndpointsV2(new URL(url).origin, directMsgId, config.ak, config.sk);
    }
    return {
      taskId: pollId,
      pollId,
      pollParamName: directTaskId ? "task_id" : "msg_id",
      raw,
      pollMode: "task_query_result",
      pollHost: new URL(url).origin
    };
  }

  const configuredAlgorithmHost = options.algorithmHost || config.mtlabApiHost;
  const algorithmHost = (
    configuredAlgorithmHost && configuredAlgorithmHost !== config.apiHost
      ? configuredAlgorithmHost
      : "https://openapi.mtlab.meitu.com"
  ).replace(/\/+$/, "");
  const url = `${algorithmHost}/v1/algorithm/submit`;
  const requestPayload = {
    api_name: options.algorithmApiName || apiName,
    body: options.preserveBody ? payload : buildOpenapiAsyncBody(payload),
    extra_params: payload.extra_params || {}
  };
  if (options.preserveBody) {
    console.log("[OpenAPI Submit] algorithm submit", JSON.stringify({
      apiName: requestPayload.api_name,
      url,
      mediaCount: Array.isArray(payload?.media_info_list) ? payload.media_info_list.length : 0,
      parameterKeys: Object.keys(payload?.parameter || {})
    }));
  }
  const raw = await aigcJsonRequest(withAigcQueryAuth(url, config), "POST", requestPayload, { ...config, authMode: "none" });
  if (!isProviderSuccess(raw)) throw createProviderError("openapi-submit", apiName, raw);
  const msgId = raw?.data?.msg_id || raw?.msg_id || raw?.data?.task_id || raw?.task_id;
  if (!msgId) throw createProviderError("openapi-submit", apiName, { ...raw, message: "No msg_id in response" });
  return { msgId, raw, pollMode: "algorithm_poll", pollHost: algorithmHost };
}

function getOpenapiPollState(raw) {
  const code = raw?.error_code ?? raw?.code;
  const status = String(raw?.data?.status || raw?.status || "").toLowerCase();
  const numericStatus = Number(raw?.data?.status ?? raw?.status);
  const mediaList = extractAigcResultMedia(raw);
  if ((code === 0 || code === "0") && mediaList.length > 0) return "finished";
  if ((numericStatus === 9 || numericStatus === 10) && mediaList.length > 0) return "finished";
  if (numericStatus === 0 || numericStatus === 1 || numericStatus === 9) return "processing";
  if (status === "finished" || status === "completed" || status === "success") return "finished";
  if ((code === 0 || code === "0") && mediaList.length === 0) return "processing";
  if (code === 1 || code === 29901 || code === "29901" || status === "processing" || status === "pending" || status === "queued") return "processing";
  if (code === 2 || numericStatus === 2 || numericStatus === -1 || status === "failed" || status === "error") return "failed";
  if (![undefined, null, "", 0, "0"].includes(code)) return "failed";
  return "unknown";
}

async function pollOpenapiSdkStatusAsync(taskId, options = {}) {
  const config = options.config || getAigcConfig();
  const initialDelay = Math.max(500, Number(options.initialDelayMs || 3000));
  const pollInterval = Math.max(500, Number(options.pollIntervalMs || config.pollIntervalMs || 2000));
  const maxPolls = Math.max(1, Number(options.maxPolls || config.maxPolls || 90));
  const pollUrl = `${config.apiHost}/api/v1/sdk/status?${new URLSearchParams({ task_id: taskId }).toString()}`;
  const signedConfig = { ...config, authMode: "sdk_header" };

  await sleep(initialDelay);
  for (let index = 0; index < maxPolls; index += 1) {
    logOpenapiPollDebug("POSTER-LAYER-POLL", pollUrl, taskId, "GET");
    const raw = await aigcJsonRequest(pollUrl, "GET", null, signedConfig);
    const state = getOpenapiPollState(raw);
    if (state === "finished") return raw;
    if (state === "failed") throw createProviderError("openapi-poll", "api/v1/sdk/status(task_id)", raw);
    await sleep(pollInterval);
  }
  throw new Error(`OpenAPI poster layer task timed out: ${taskId}`);
}

async function callOpenapiTaskGateway(apiName, payload, options = {}) {
  const config = options.config || getAigcConfig();
  if (!config.ak || !config.sk) {
    throw new Error("后端缺少 AIGC_AK / AIGC_SK 环境变量");
  }

  const task = apiName.startsWith("/") ? apiName : `/v1/${apiName}`;
  const params = {
    ...(payload.body && typeof payload.body === "object" ? payload.body : {}),
    ...(payload.parameter && typeof payload.parameter === "object" ? { parameter: payload.parameter } : {})
  };

  return submitAigcTask({
    task,
    taskType: "mtlab",
    params,
    mediaInfoList: payload.media_info_list || [],
    extra: payload.extra_params,
    rspMediaType: payload?.parameter?.rsp_media_type || payload?.rsp_media_type || "url",
    publicBaseUrl: options.publicBaseUrl,
    mediaOptions: options.mediaOptions,
    pollIntervalMs: options.pollIntervalMs,
    maxPolls: options.maxPolls,
    persistOptions: options.persistOptions
  });
}

async function pollOpenapiV3Async(msgId, options = {}) {
  const config = options.config || getAigcConfig();
  if (options.pollMode === "task_query_result") {
    const pollHost = options.pollHost || config.mtlabApiHost || config.apiHost;
    const queryAuth = { ...config, authMode: "none" };
    const taskId = options.taskId || msgId;
    const callbackMsgId = options.msgId || msgId;
    const initialDelay = Math.max(500, Number(options.initialDelayMs || 3000));
    const pollInterval = Math.max(500, Number(options.pollIntervalMs || config.pollIntervalMs || 2000));
    const maxPolls = Math.max(1, Number(options.maxPolls || config.maxPolls || 90));
    const configuredPollHosts = [config.mtlabApiHost, pollHost, config.apiHost].filter(Boolean);
    const documentedMtlabPollHosts = ["https://openapi.mtlab.meitu.com"];
    if (configuredPollHosts.some(host => /pre/i.test(String(host)))) {
      documentedMtlabPollHosts.push("https://openapi-pre.mtlab.meitu.com");
    }
    const pollHosts = [
      ...new Set(
        [...documentedMtlabPollHosts, ...configuredPollHosts]
          .filter(Boolean)
          .map(host => String(host).replace(/\/+$/, ""))
      )
    ];
    const candidatePollers = [
      ...pollHosts.map(host => ({
        key: `v1/query(msg_id)@${new URL(host).host}`,
        run: async () => {
          const pollUrl = withAigcQueryAuth(`${host}/v1/query`, config);
          const finalUrl = `${pollUrl}&${new URLSearchParams({ msg_id: callbackMsgId }).toString()}`;
          logOpenapiPollDebug("EXPAND-POLL", finalUrl, callbackMsgId, "POST");
          return aigcJsonRequest(finalUrl, "POST", {}, queryAuth);
        }
      })),
      ...pollHosts.map(host => ({
        key: `openapi-poll/query_result(msg_id)@${new URL(host).host}`,
        run: async () => {
          const baseUrl = withAigcQueryAuth(`${host}/openapi-poll/query_result`, config);
          const pollUrl = `${baseUrl}&${new URLSearchParams({ msg_id: callbackMsgId }).toString()}`;
          logOpenapiPollDebug("EXPAND-POLL", pollUrl, callbackMsgId, "GET");
          return aigcJsonRequest(pollUrl, "GET", null, queryAuth);
        }
      })),
      {
        key: "api/v1/sdk/status(task_id)",
        run: async () => {
          const pollUrl = `${config.apiHost}/api/v1/sdk/status?${new URLSearchParams({ task_id: taskId }).toString()}`;
          logOpenapiPollDebug("EXPAND-POLL", pollUrl, taskId, "GET");
          return aigcJsonRequest(pollUrl, "GET", null, config);
        }
      },
      {
        key: "v1/task_query_result(task_id)",
        run: async () => {
          const baseUrl = withAigcQueryAuth(`${pollHost}/v1/task_query_result`, config);
          const pollUrl = `${baseUrl}&${new URLSearchParams({ task_id: taskId }).toString()}`;
          logOpenapiPollDebug("EXPAND-POLL", pollUrl, taskId, "GET");
          return aigcJsonRequest(pollUrl, "GET", null, queryAuth);
        }
      },
      {
        key: "v1/query_result(task_id)",
        run: async () => {
          const baseUrl = withAigcQueryAuth(`${pollHost}/v1/query_result`, config);
          const pollUrl = `${baseUrl}&${new URLSearchParams({ task_id: taskId }).toString()}`;
          logOpenapiPollDebug("EXPAND-POLL", pollUrl, taskId, "GET");
          return aigcJsonRequest(pollUrl, "GET", null, queryAuth);
        }
      },
      {
        key: "v1/query_result(msg_id)",
        run: async () => {
          const baseUrl = withAigcQueryAuth(`${pollHost}/v1/query_result`, config);
          const pollUrl = `${baseUrl}&${new URLSearchParams({ msg_id: callbackMsgId }).toString()}`;
          logOpenapiPollDebug("EXPAND-POLL", pollUrl, callbackMsgId, "GET");
          return aigcJsonRequest(pollUrl, "GET", null, queryAuth);
        }
      },
      {
        key: "v1/algorithm/poll(msg_id)",
        run: async () => {
          const pollUrl = withAigcQueryAuth(`${pollHost}/v1/algorithm/poll`, config);
          logOpenapiPollDebug("EXPAND-POLL", pollUrl, callbackMsgId, "POST");
          return aigcJsonRequest(pollUrl, "POST", { body: { msg_id: callbackMsgId } }, queryAuth);
        }
      },
      {
        key: "v1/mtimage_expand_v4/result(task_id)",
        run: async () => {
          const baseUrl = withAigcQueryAuth(`${pollHost}/v1/mtimage_expand_v4/result`, config);
          const pollUrl = `${baseUrl}&${new URLSearchParams({ task_id: taskId }).toString()}`;
          logOpenapiPollDebug("EXPAND-POLL", pollUrl, taskId, "GET");
          return aigcJsonRequest(pollUrl, "GET", null, queryAuth);
        }
      }
    ];
    let activePoller = candidatePollers[0];
    await sleep(initialDelay);
    for (let index = 0; index < maxPolls; index += 1) {
      let raw = await activePoller.run();
      if (isProviderNoRouteError(raw) || isProviderPollEndpointMismatch(raw) || isProviderTaskNotFound(raw)) {
        const nextPoller = candidatePollers.find(candidate => candidate.key !== activePoller.key);
        const remainingPollers = candidatePollers.filter(candidate => candidate.key !== activePoller.key);
        const probeResults = [summarizePollProbeResult(activePoller.key, raw)];
        let switched = false;
        for (const candidate of remainingPollers) {
          const probe = await candidate.run();
          probeResults.push(summarizePollProbeResult(candidate.key, probe));
          if (!isProviderNoRouteError(probe) && !isProviderPollEndpointMismatch(probe) && !isProviderTaskNotFound(probe)) {
            activePoller = candidate;
            raw = probe;
            switched = true;
            console.log("[OpenAPI Poll] switched poll endpoint", JSON.stringify({ endpoint: candidate.key, taskId }));
            break;
          }
        }
        if (!switched && nextPoller) {
          throw createProviderError("openapi-poll", "all-candidates", {
            code: raw?.code ?? raw?.error_code ?? raw?.status_code,
            message: `all poll candidates failed: ${probeResults.map(item => `${item.endpoint} -> ${item.message || item.code || item.status || "unknown"}`).join("; ")}`,
            attempts: probeResults
          });
        }
      }
      const state = getOpenapiPollState(raw);
      if (state === "finished") return raw?.data || raw;
      if (state === "failed") throw createProviderError("openapi-poll", activePoller.key, raw);
      await sleep(pollInterval);
    }
    throw new Error(`OpenAPI 任务超时未完成: ${msgId}`);
  }
  if (options.pollMode === "algorithm_poll") {
    const pollHost = (options.pollHost || config.mtlabApiHost || "https://openapi.mtlab.meitu.com").replace(/\/+$/, "");
    const url = withAigcQueryAuth(`${pollHost}/openapi-poll/query_result`, config);
    const initialDelay = Math.max(500, Number(options.initialDelayMs || 3000));
    const pollInterval = Math.max(500, Number(options.pollIntervalMs || config.pollIntervalMs || 2000));
    const maxPolls = Math.max(1, Number(options.maxPolls || config.maxPolls || 90));
    await sleep(initialDelay);
    for (let index = 0; index < maxPolls; index += 1) {
      const pollUrl = `${url}&${new URLSearchParams({ msg_id: msgId }).toString()}`;
      const raw = await aigcJsonRequest(pollUrl, "GET", null, { ...config, authMode: "none" });
      const state = getOpenapiPollState(raw);
      if (state === "finished") return raw?.data || raw;
      if (state === "failed") throw createProviderError("openapi-poll", "openapi-poll/query_result", raw);
      await sleep(pollInterval);
    }
    throw new Error(`OpenAPI 任务超时未完成: ${msgId}`);
  }

  const url = `${config.apiHost}/v1/query_result?${new URLSearchParams({
    msg_id: msgId,
    api_key: config.ak,
    api_secret: config.sk
  }).toString()}`;
  const initialDelay = Math.max(500, Number(options.initialDelayMs || 3000));
  const pollInterval = Math.max(500, Number(options.pollIntervalMs || config.pollIntervalMs || 2000));
  const maxPolls = Math.max(1, Number(options.maxPolls || config.maxPolls || 90));
  await sleep(initialDelay);
  for (let index = 0; index < maxPolls; index += 1) {
    const raw = await aigcJsonRequest(url, "GET", null, { ...config, authMode: "none" });
    const state = getOpenapiPollState(raw);
    if (state === "finished") return raw?.data || raw;
    if (state === "failed") throw createProviderError("openapi-poll", "query_result", raw);
    await sleep(pollInterval);
  }
  throw new Error(`OpenAPI 任务超时未完成: ${msgId}`);
}

async function callOpenapiV3Async(apiName, payload, options = {}) {
  const submitted = await submitOpenapiV3Async(apiName, payload, options);
  const jobId = submitted.pollId || submitted.taskId || submitted.msgId;
  return pollOpenapiV3Async(jobId, {
    ...options,
    pollMode: submitted.pollMode,
    pollHost: submitted.pollHost,
    pollParamName: submitted.pollParamName
  });
}

async function submitDirectOpenapiMediaTask({
  task,
  parameter = {},
  mediaInfoList = [],
  extra = {},
  initialDelayMs = 0,
  pollIntervalMs,
  maxPolls,
  persistOptions,
  config
}) {
  const normalizedTask = String(task || "").replace(/^\/v1\//, "").replace(/^\//, "");
  const payload = {
    parameter,
    media_info_list: mediaInfoList,
    extra
  };
  const submitted = await submitOpenapiV3Async(normalizedTask, payload, {
    config,
    preserveBody: true
  });
  const jobId = submitted.pollId || submitted.taskId || submitted.msgId;
  const raw = await pollOpenapiV3Async(jobId, {
    config,
    pollMode: submitted.pollMode,
    pollHost: submitted.pollHost,
    pollParamName: submitted.pollParamName,
    initialDelayMs,
    pollIntervalMs,
    maxPolls
  });
  if (normalizedTask === "ltx_2_async") {
    console.log("[LTX] poll response summary", JSON.stringify(summarizeLtxPollResponse(raw)));
  }
  const mediaInfo = extractAigcResultMedia(raw)[0] || null;
  const remoteResultUrl = mediaInfo?.media_data || mediaInfo?.media_url || extractAigcDirectResultUrl(raw) || "";
  let resultUrl = remoteResultUrl;
  if (/^https?:\/\//i.test(remoteResultUrl || "")) {
    try {
      resultUrl = (await persistAigcResult(remoteResultUrl, mediaInfo?.media_type, persistOptions)) || remoteResultUrl;
    } catch (err) {
      console.warn("[AIGC] direct result persistence failed, using remote URL:", err.message);
    }
  }
  return {
    ok: true,
    task: task.startsWith("/") ? task : `/v1/${normalizedTask}`,
    resultUrl,
    remoteResultUrl,
    mediaInfo,
    raw
  };
}

function publicAigcImageUrl(imageUrl, config, publicBaseUrl = "") {
  const normalizedImageUrl = normalizeMediaUrlString(imageUrl);
  const baseUrl = publicBaseUrl || config.publicBaseUrl;
  if (typeof normalizedImageUrl === "string" && normalizedImageUrl.startsWith("/static/")) {
    return publicStaticUrl(normalizedImageUrl, baseUrl);
  }
  return normalizedImageUrl;
}

async function mediaInfoForOpenapiAdaptImage(imageUrl, context = {}) {
  const config = context.config || getAigcConfig();
  const publicBaseUrl = context.publicBaseUrl || config.publicBaseUrl || "";
  const normalizedImageUrl = normalizeMediaUrlString(imageUrl);
  const localStaticUrl = normalizedImageUrl?.startsWith("/static/")
    ? normalizedImageUrl
    : publicUrlToStaticUrl(normalizedImageUrl || "", publicBaseUrl);

  if (localStaticUrl && hasAigcStandardImageExt(localStaticUrl)) {
    const standardizedStaticUrl = await standardizeStaticImageForAigc(localStaticUrl);
    if (hasObserverUploadConfig()) {
      const observerUrl = await uploadStaticImageToObserverUrl(standardizedStaticUrl);
      return mediaInfoFromUrl(observerUrl);
    }
    const imageBase64 = await standardizeStaticImageToBase64ForAigc(standardizedStaticUrl);
    return mediaInfoWithBase64(mediaInfoFromUrl(standardizedStaticUrl), imageBase64);
  }

  return mediaInfoFromUrl(publicAigcImageUrl(normalizedImageUrl, config, publicBaseUrl));
}

async function resolveOpenapiAdaptImageUrl(imageUrl, context = {}) {
  const config = context.config || getAigcConfig();
  const publicBaseUrl = context.publicBaseUrl || config.publicBaseUrl || "";
  const normalizedImageUrl = normalizeMediaUrlString(imageUrl);
  const localStaticUrl = normalizedImageUrl?.startsWith("/static/")
    ? normalizedImageUrl
    : publicUrlToStaticUrl(normalizedImageUrl || "", publicBaseUrl);

  if (localStaticUrl) {
    const standardizedStaticUrl = await standardizeStaticImageForAigc(localStaticUrl);

    if (hasObserverUploadConfig()) {
      return uploadStaticImageToObserverUrl(standardizedStaticUrl);
    }

    const publicUrl = publicStaticUrl(standardizedStaticUrl, publicBaseUrl);
    if (/^https?:\/\//i.test(publicUrl || "")) {
      return publicUrl;
    }
  }

  return normalizedImageUrl;
}

function boxFromProvider(value, width, height) {
  if (!value || typeof value !== "object") return null;
  const x = Number(value.x ?? value.left ?? value.top_x ?? value.xmin);
  const y = Number(value.y ?? value.top ?? value.top_y ?? value.ymin);
  const w = Number(value.width ?? value.w);
  const h = Number(value.height ?? value.h);
  if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
    return { x, y, width: w, height: h };
  }
  const right = Number(value.right ?? value.bottom_x ?? value.xmax);
  const bottom = Number(value.bottom ?? value.bottom_y ?? value.ymax);
  if ([x, y, right, bottom].every(Number.isFinite) && right > x && bottom > y) {
    return { x, y, width: right - x, height: bottom - y };
  }
  const polygon = value.polygon || value.points;
  if (Array.isArray(polygon) && polygon.length > 0) {
    return boxFromPolygon(polygon);
  }
  if (width && height) return { x: 0, y: 0, width, height };
  return null;
}

function boxFromPolygon(points = []) {
  const flat = points
    .map(point => Array.isArray(point) ? point : [point?.x, point?.y])
    .filter(point => Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
    .map(point => ({ x: Number(point[0]), y: Number(point[1]) }));
  if (!flat.length) return null;
  const minX = Math.min(...flat.map(point => point.x));
  const minY = Math.min(...flat.map(point => point.y));
  const maxX = Math.max(...flat.map(point => point.x));
  const maxY = Math.max(...flat.map(point => point.y));
  if (maxX <= minX || maxY <= minY) return null;
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function denormalizeBox(box, width, height) {
  if (!box) return null;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return box;
  }
  const maxX = Math.max(box.x, box.x + box.width);
  const maxY = Math.max(box.y, box.y + box.height);
  const looksNormalized = maxX <= 1.01 && maxY <= 1.01;
  if (!looksNormalized) return box;
  return {
    x: box.x * width,
    y: box.y * height,
    width: box.width * width,
    height: box.height * height
  };
}

function normalizeBox(box, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  if (!box || !sourceWidth || !sourceHeight || !targetWidth || !targetHeight) return box || null;
  const sourceBox = denormalizeBox(box, sourceWidth, sourceHeight);
  return {
    x: (sourceBox.x / sourceWidth) * targetWidth,
    y: (sourceBox.y / sourceHeight) * targetHeight,
    width: (sourceBox.width / sourceWidth) * targetWidth,
    height: (sourceBox.height / sourceHeight) * targetHeight
  };
}

function isBoxInsideSafeArea(box, width, height, marginRatio = 0.1) {
  if (!box || !width || !height) return true;
  const marginX = width * marginRatio;
  const marginY = height * marginRatio;
  return (
    box.x >= marginX &&
    box.y >= marginY &&
    box.x + box.width <= width - marginX &&
    box.y + box.height <= height - marginY
  );
}

const STANDARD_SPLASH_INFO_SAFE_MARGIN_PX = 346;

function isBoxInsidePixelSafeArea(box, width, height, marginPx = STANDARD_SPLASH_INFO_SAFE_MARGIN_PX) {
  if (!box || !width || !height) return true;
  const margin = Math.min(Number(marginPx) || 0, width / 2, height / 2);
  return (
    box.x >= margin &&
    box.y >= margin &&
    box.x + box.width <= width - margin &&
    box.y + box.height <= height - margin
  );
}

function textRecall(beforeTexts = [], afterTexts = []) {
  const before = beforeTexts.join("").replace(/\s/g, "");
  const after = afterTexts.join("").replace(/\s/g, "");
  if (!before) return 1;
  let matched = 0;
  const remaining = after.split("");
  for (const char of before) {
    const index = remaining.indexOf(char);
    if (index >= 0) {
      matched += 1;
      remaining.splice(index, 1);
    }
  }
  return matched / before.length;
}

async function maskedAverageHash(imageUrl, maskUrl, width = 16, height = 16) {
  if (!imageUrl?.startsWith("/static/") || !maskUrl?.startsWith("/static/")) return null;
  const imagePath = staticUrlToLocalPath(imageUrl);
  const maskPath = staticUrlToLocalPath(maskUrl);
  const image = await sharp(imagePath)
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const mask = await sharp(maskPath)
    .resize(width, height, { fit: "fill" })
    .greyscale()
    .raw()
    .toBuffer();
  const values = [];
  for (let index = 0; index < image.length; index += 1) {
    if (mask[index] > 24) values.push(image[index]);
  }
  if (!values.length) return null;
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.map(value => value >= avg ? 1 : 0);
}

function hashSimilarity(a, b) {
  if (!a || !b || a.length !== b.length || !a.length) return null;
  let same = 0;
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] === b[index]) same += 1;
  }
  return same / a.length;
}

function targetRatioLabel(width, height) {
  const w = toPositiveInt(width);
  const h = toPositiveInt(height);
  if (!w || !h) return "1:1";
  return `${w}:${h}`;
}

function normalizeOpenapiAspectRatio(width, height) {
  const w = toPositiveInt(width);
  const h = toPositiveInt(height);
  if (!w || !h) return "1:1";
  const target = w / h;
  const supportedRatios = [
    { label: "1:1", value: 1 },
    { label: "3:4", value: 3 / 4 },
    { label: "4:3", value: 4 / 3 },
    { label: "9:16", value: 9 / 16 },
    { label: "16:9", value: 16 / 9 }
  ];
  let best = supportedRatios[0];
  let bestDelta = Math.abs(target - best.value);
  for (const candidate of supportedRatios.slice(1)) {
    const delta = Math.abs(target - candidate.value);
    if (delta < bestDelta) {
      best = candidate;
      bestDelta = delta;
    }
  }
  return best.label;
}

function computeRatioDelta(sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  if (!Number.isFinite(sourceRatio) || !Number.isFinite(targetRatio) || sourceRatio <= 0 || targetRatio <= 0) {
    return 0;
  }
  return Math.abs(Math.log2(sourceRatio / targetRatio));
}

function planAdaptStrategy(sourceWidth, sourceHeight, targetWidth, targetHeight, options = {}) {
  const ratioDelta = computeRatioDelta(sourceWidth, sourceHeight, targetWidth, targetHeight);
  const exactSize = sourceWidth === targetWidth && sourceHeight === targetHeight;
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;
  const { analysis = null, context = {} } = options;
  const sourceOrientation = sourceRatio > 1.08 ? "landscape" : sourceRatio < 0.92 ? "portrait" : "square";
  const targetOrientation = targetRatio > 1.08 ? "landscape" : targetRatio < 0.92 ? "portrait" : "square";
  const infoSafeArea = evaluateSplashInfoSafeAreaForAdapt(
    analysis,
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    context
  );
  const isSameDirectionalAdapt =
    sourceOrientation !== "square" &&
    targetOrientation !== "square" &&
    sourceOrientation === targetOrientation;
  const isCrossDirectionalAdapt =
    sourceOrientation !== "square" &&
    targetOrientation !== "square" &&
    sourceOrientation !== targetOrientation;
  let strategy = "crop";
  if (exactSize) strategy = "direct";
  else if (isSameDirectionalAdapt) strategy = "outpaint";
  else if (isCrossDirectionalAdapt) strategy = "relayout";
  else if (ratioDelta < 0.05) strategy = "crop";
  else if (ratioDelta < 0.35) strategy = "outpaint";
  else strategy = "relayout";
  const layoutIntent = isSameDirectionalAdapt && infoSafeArea?.passed
    ? "center_expand_safe_info_only"
    : isSameDirectionalAdapt
      ? "center_expand_only"
      : isCrossDirectionalAdapt
        ? "cross_direction_relayout"
        : "ratio_based";
  return {
    strategy,
    ratioDelta,
    sourceRatio,
    targetRatio,
    sourceOrientation,
    targetOrientation,
    orientationChange: exactSize ? "exact" : isSameDirectionalAdapt ? "same-direction" : isCrossDirectionalAdapt ? "cross-direction" : "neutral",
    layoutIntent,
    infoSafeArea,
    steps: strategy === "direct"
      ? ["resize"]
      : strategy === "crop"
        ? ["detect", "merge_masks", "ai_crop", "qa"]
        : isCrossDirectionalAdapt
          ? ["detect", "merge_masks", "split_text_logo_layers", "cross_direction_relayout", "background_extension", "qa"]
          : infoSafeArea?.passed
            ? ["detect", "text_logo_safe_area_check", "center_original", "background_extension", "final_safe_area_qa"]
            : ["detect", "merge_masks", "center_original", "background_extension", "protected_crop", "qa"],
    reasons: [
      exactSize ? "源图尺寸与目标尺寸一致" : `比例差异 ${(ratioDelta * 100).toFixed(1)}%`,
      isSameDirectionalAdapt ? "源图与目标模板同为横版或同为竖版，优先整图居中并只向四周扩图，不拆文案和 Logo" : "",
      isSameDirectionalAdapt && infoSafeArea?.passed ? `开屏文字/Logo 已满足 ${infoSafeArea.marginPx}px 安全边距，只扩展背景` : "",
      isSameDirectionalAdapt && infoSafeArea && !infoSafeArea.passed ? `开屏文字/Logo 未满足 ${infoSafeArea.marginPx}px 安全边距，需要安全区调整` : "",
      isCrossDirectionalAdapt ? "源图与目标模板横竖方向互转，才进入智能排版" : "",
      strategy === "relayout" ? "跨方向适配时优先保留原 Logo/文案完整，再做背景延展和图层排版" : ""
    ].filter(Boolean)
  };
}

async function runPlatformTask(endpoint, payload, options = {}) {
  const config = options.config || getAigcConfig();
  if (!config.ak || !config.sk) {
    throw new Error("后端缺少 AIGC_AK / AIGC_SK 环境变量");
  }
  const url = `${config.apiHost}${endpoint}`;
  const raw = await aigcJsonRequest(url, "POST", payload, config);
  if (!isProviderSuccess(raw)) throw createProviderError("platform-submit", endpoint, raw);
  const taskId = raw?.data?.task_id || raw?.task_id || raw?.data?.msg_id || raw?.msg_id;
  if (!taskId) return raw;

  const template = config.pollEndpointTemplate || "/v2/task/{taskId}";
  const pollPath = template.replace("{taskId}", encodeURIComponent(taskId));
  const pollUrl = `${config.apiHost}${pollPath}`;
  const initialDelay = Math.max(500, Number(options.initialDelayMs || 2000));
  const pollInterval = Math.max(500, Number(options.pollIntervalMs || 3000));
  const maxPolls = Math.max(1, Number(options.maxPolls || 60));
  await sleep(initialDelay);
  for (let index = 0; index < maxPolls; index += 1) {
    const statusRaw = await aigcJsonRequest(pollUrl, "GET", null, config);
    const status = String(statusRaw?.data?.status || statusRaw?.status || "").toLowerCase();
    if (status === "completed" || status === "success" || status === "succeeded") return statusRaw;
    if (status === "failed" || status === "error") throw createProviderError("platform-poll", endpoint, statusRaw);
    await sleep(pollInterval);
  }
  throw new Error(`AI Platform 任务超时未完成: ${taskId}`);
}

async function runAdaptProvider(endpointName, payload, options = {}) {
  const config = options.config || getAigcConfig();
  const apiStyle = getAdaptApiStyle(config);
  const endpoint = ADAPT_ENDPOINTS[apiStyle]?.[endpointName];
  if (!endpoint) throw new Error(`未知算法 endpoint: ${apiStyle}/${endpointName}`);
  const isAsync = apiStyle === ADAPT_API_STYLES.aiPlatform ? true : endpoint.endsWith("_async");
  const useTaskGateway = apiStyle === ADAPT_API_STYLES.openapi && isAsync;
  const maxAttempts = Math.max(1, Number(options.providerAttempts || 3));
  console.log("[AdaptImage] request", JSON.stringify({
    endpointName,
    apiStyle,
    endpoint,
    isAsync,
    useTaskGateway,
    maxAttempts,
    payload: summarizeAdaptPayload(payload)
  }));
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const raw = apiStyle === ADAPT_API_STYLES.aiPlatform
        ? await runPlatformTask(endpoint, payload, { ...options, config })
        : useTaskGateway
          ? await callOpenapiTaskGateway(endpoint, payload, { ...options, config })
          : isAsync
          ? await callOpenapiV3Async(endpoint, payload, { ...options, config })
          : await callOpenapiV3Sync(endpoint, payload, { ...options, config });
      console.log("[AdaptImage] response", JSON.stringify({
        endpointName,
        apiStyle,
        endpoint,
        attempt,
        ...summarizeProviderRaw(raw)
      }));
      return raw;
    } catch (err) {
      lastError = err;
      const message = err?.message || String(err);
      const shouldRetry = attempt < maxAttempts && (err?.transientUpstream || isTransientUpstreamMessage(message));
      console.warn("[AdaptImage] failed", JSON.stringify({
        endpointName,
        apiStyle,
        endpoint,
        isAsync,
        attempt,
        maxAttempts,
        retrying: shouldRetry,
        message,
        stage: err?.stage || "",
        provider: err?.providerRaw ? summarizeProviderRaw(err.providerRaw) : null
      }));
      if (!shouldRetry) throw err;
      await sleep(Math.min(6000, 1000 * attempt));
    }
  }
  throw lastError;
}

function extractResultUrls(raw) {
  const mediaList = extractAigcResultMedia(raw?.raw || raw);
  const urls = mediaList
    .map(item => item?.media_data || item?.media_url)
    .filter(url => typeof url === "string" && url);
  const data = raw?.data || raw?.raw?.data || {};
  const resultUrls = [
    raw?.resultUrl,
    raw?.remoteResultUrl,
    data.image_url,
    data.result_url,
    data.mask_url,
    data.crop_url,
    data.inpaint_url,
    ...(Array.isArray(data.results) ? data.results.map(item => item?.image_url || item?.url || item?.result_url) : [])
  ].filter(url => typeof url === "string" && url);
  return Array.from(new Set([...urls, ...resultUrls]));
}

function extractProviderMediaValues(raw) {
  const source = raw?.raw || raw;
  const mediaList = extractAigcResultMedia(source);
  const values = mediaList
    .map(item => item?.media_data || item?.media_url)
    .filter(value => typeof value === "string" && value);
  const data = source?.data || raw?.data || {};
  [
    data.image_url,
    data.result_url,
    data.mask_url,
    data.crop_url,
    data.inpaint_url,
    data.media_data,
    ...(Array.isArray(data.results) ? data.results.map(item => item?.image_url || item?.url || item?.result_url || item?.media_data) : [])
  ].forEach(value => {
    if (typeof value === "string" && value) values.push(value);
  });
  return Array.from(new Set(values));
}

async function persistFirstProviderImage(raw, prefix = "aigc_provider") {
  const values = extractProviderMediaValues(raw);
  for (const value of values) {
    const persisted = await persistProviderImageValue(value, prefix);
    if (persisted) return persisted;
  }
  return "";
}

async function persistFirstProviderUrl(raw, options = {}) {
  const urls = extractResultUrls(raw);
  const remoteResultUrl = urls.find(url => /^https?:\/\//i.test(url)) || "";
  if (!remoteResultUrl) return { resultUrl: urls[0] || "", remoteResultUrl: "" };
  let resultUrl = remoteResultUrl;
  try {
    resultUrl = await persistAigcResult(remoteResultUrl, undefined, options);
  } catch (err) {
    console.warn("[AdaptImage] provider result persistence failed:", err.message);
  }
  return { resultUrl, remoteResultUrl };
}

async function detectSaliencyForAdapt(imageUrl, context) {
  const config = context.config;
  const publicUrl = publicAigcImageUrl(imageUrl, config, context.publicBaseUrl);
  const apiStyle = getAdaptApiStyle(config);
  const mediaInfo = apiStyle === ADAPT_API_STYLES.openapi
    ? await mediaInfoForOpenapiAdaptImage(imageUrl, context)
    : null;
  const payload = apiStyle === ADAPT_API_STYLES.aiPlatform
    ? { image_url: publicUrl, return_mask: true, return_crop: true, return_binary: false }
    : {
        media_info_list: [mediaInfo],
        parameter: { rsp_media_type: "url", nMask: true, nbox: true, model_type: 1 }
      };
  const raw = await runAdaptProvider("saliency", payload, context);
  const data = raw?.data || raw?.raw?.data || {};
  const parameter = raw?.parameter || raw?.raw?.parameter || data?.parameter || {};
  const width = data.width || context.sourceWidth;
  const height = data.height || context.sourceHeight;
  const box = boxFromProvider({
    top_x: parameter.top_x,
    top_y: parameter.top_y,
    bottom_x: parameter.bottom_x,
    bottom_y: parameter.bottom_y
  }, width, height);
  const maskUrl = data.mask_url
    ? await persistProviderImageValue(data.mask_url, "subject_mask")
    : await persistFirstProviderImage(raw, "subject_mask");
  return {
    ok: true,
    exists: data.exists ?? parameter.exist_salient ?? Boolean(box || maskUrl),
    kind: parameter.Kind,
    box,
    maskUrl,
    cropUrl: data.crop_url || "",
    raw
  };
}

async function detectLogoForAdapt(imageUrl, context) {
  const config = context.config;
  const publicUrl = publicAigcImageUrl(imageUrl, config, context.publicBaseUrl);
  const apiStyle = getAdaptApiStyle(config);
  const openapiImageUrl = apiStyle === ADAPT_API_STYLES.openapi
    ? await resolveOpenapiAdaptImageUrl(imageUrl, context)
    : "";
  const mediaInfo = apiStyle === ADAPT_API_STYLES.openapi
    ? /^https?:\/\//i.test(openapiImageUrl || "")
      ? mediaInfoFromUrl(openapiImageUrl)
      : await mediaInfoForOpenapiAdaptImage(imageUrl, context)
    : null;
  const payload = apiStyle === ADAPT_API_STYLES.aiPlatform
    ? { image_url: publicUrl, task: "logo_seg", inpaint: false, return_mask: true }
    : {
        media_info_list: [mediaInfo],
        parameter: { inpaint: false, requester: "design_studio", task: "logo_seg", userboxes: [] }
      };
  const raw = await runAdaptProvider("logo", payload, context);
  const data = raw?.data || raw?.raw?.data || {};
  const parameter = raw?.parameter || raw?.raw?.parameter || data?.parameter || {};
  const regions = Array.isArray(data.logo_regions) ? data.logo_regions : [];
  const detectedBoxes = Array.isArray(data.detected_boxes)
    ? data.detected_boxes
    : Array.isArray(parameter.detected_boxes)
      ? parameter.detected_boxes
      : [];
  const boxes = [
    ...regions.map(region => boxFromProvider(region)),
    ...detectedBoxes.map(item => boxFromPolygon(item?.box || item?.polygon || item?.points || []))
  ]
    .filter(Boolean)
    .map(box => denormalizeBox(box, context.sourceWidth, context.sourceHeight));
  const maskUrl = data.mask_url
    ? await persistProviderImageValue(data.mask_url, "logo_mask")
    : await persistFirstProviderImage(raw, "logo_mask");
  return {
    ok: true,
    hasTarget: (data.has_target ?? parameter.has_target ?? boxes.length > 0) || Boolean(maskUrl),
    boxes,
    maskUrl,
    raw
  };
}

async function detectTextForAdapt(imageUrl, context) {
  const config = context.config;
  const publicUrl = publicAigcImageUrl(imageUrl, config, context.publicBaseUrl);
  const apiStyle = getAdaptApiStyle(config);
  const openapiImageUrl = apiStyle === ADAPT_API_STYLES.openapi
    ? await resolveOpenapiAdaptImageUrl(imageUrl, context)
    : "";
  const mediaInfo = apiStyle === ADAPT_API_STYLES.openapi
    ? /^https?:\/\//i.test(openapiImageUrl || "")
      ? mediaInfoFromUrl(openapiImageUrl)
      : await mediaInfoForOpenapiAdaptImage(imageUrl, context)
    : null;
  const payload = apiStyle === ADAPT_API_STYLES.aiPlatform
    ? { image_url: publicUrl, return_polygon: true, return_text: true }
    : {
        media_info_list: [mediaInfo],
        parameter: { rsp_media_type: "url" }
      };
  const raw = await runAdaptProvider("text", payload, context);
  const data = raw?.data || raw?.raw?.data || {};
  const textRegions = Array.isArray(data.text_regions) ? data.text_regions : [];
  const boxes = textRegions.map(region => boxFromPolygon(region.polygon)).filter(Boolean);
  const maskUrl = data.mask_url
    ? await persistProviderImageValue(data.mask_url, "text_mask")
    : await persistFirstProviderImage(raw, "text_mask");
  return {
    ok: true,
    hasText: boxes.length > 0 || Boolean(maskUrl),
    boxes,
    maskUrl,
    texts: textRegions.map(region => region.text).filter(Boolean),
    raw
  };
}

async function analyzeAdImageForAdapt(imageUrl, context) {
  const stages = [
    ["subject", detectSaliencyForAdapt],
    ["logo", detectLogoForAdapt],
    ["text", detectTextForAdapt]
  ];
  console.log("[AdaptImage] Step1 start", JSON.stringify({
    stages: stages.map(([key]) => key),
    imageUrl,
    sourceWidth: context.sourceWidth,
    sourceHeight: context.sourceHeight
  }));
  const settled = await Promise.allSettled(stages.map(([, fn]) => fn(imageUrl, context)));
  const analysis = {
    subject: null,
    logo: null,
    text: null,
    warnings: []
  };
  settled.forEach((item, index) => {
    const key = stages[index][0];
    if (item.status === "fulfilled") {
      analysis[key] = item.value;
      console.log(`[AdaptImage] Step1 ✓ ${key}`, JSON.stringify({
        hasMask: Boolean(item.value?.maskUrl),
        boxCount: Array.isArray(item.value?.boxes) ? item.value.boxes.length : item.value?.box ? 1 : 0,
        textCount: Array.isArray(item.value?.texts) ? item.value.texts.length : 0,
        exists: item.value?.exists,
        hasTarget: item.value?.hasTarget
      }));
    } else {
      const err = item.reason;
      analysis.warnings.push(`${key} 检测不可用：${err?.message || String(err)}`);
      console.warn(`[AdaptImage] Step1 ✗ ${key}`, err?.message || String(err));
    }
  });
  console.log("[AdaptImage] Step1 done", JSON.stringify({
    success: stages.filter((_, index) => settled[index].status === "fulfilled").map(([key]) => key),
    failed: stages.filter((_, index) => settled[index].status === "rejected").map(([key]) => key)
  }));
  return analysis;
}

async function buildProtectedMaskForAdapt(analysis, width, height) {
  const protectedMaskUrls = [
    analysis.subject?.maskUrl,
    analysis.logo?.maskUrl,
    analysis.text?.maskUrl
  ].filter(Boolean);
  const removableMaskUrls = [
    analysis.logo?.maskUrl,
    analysis.text?.maskUrl
  ].filter(Boolean);
  const mergedProtected = await mergeProtectedMasks(protectedMaskUrls, width, height);
  const mergedRemovable = await mergeProtectedMasks(removableMaskUrls, width, height);
  console.log("[AdaptImage] Step2 masks", JSON.stringify({
    protectedSources: protectedMaskUrls.length,
    removableSources: removableMaskUrls.length,
    protectedMaskUrl: mergedProtected?.protectedMaskUrl || "",
    removableMaskUrl: mergedRemovable?.protectedMaskUrl || ""
  }));
  return {
    protectedMaskUrl: mergedProtected?.protectedMaskUrl || "",
    editableMaskUrl: mergedProtected?.editableMaskUrl || "",
    sourceCount: mergedProtected?.sourceCount || 0,
    removableMaskUrl: mergedRemovable?.protectedMaskUrl || "",
    removableEditableMaskUrl: mergedRemovable?.editableMaskUrl || "",
    removableSourceCount: mergedRemovable?.sourceCount || 0
  };
}

async function maskIouFromUrls(beforeMaskUrl, afterMaskUrl, width, height, threshold = 24) {
  if (!beforeMaskUrl || !afterMaskUrl || !width || !height) return null;
  const beforeRaw = await maskUrlToGrayRaw(beforeMaskUrl, width, height);
  const afterRaw = await maskUrlToGrayRaw(afterMaskUrl, width, height);
  if (!beforeRaw?.data || !afterRaw?.data || beforeRaw.data.length !== afterRaw.data.length) return null;
  let intersection = 0;
  let union = 0;
  for (let index = 0; index < beforeRaw.data.length; index += 1) {
    const beforeOn = beforeRaw.data[index] > threshold;
    const afterOn = afterRaw.data[index] > threshold;
    if (beforeOn && afterOn) intersection += 1;
    if (beforeOn || afterOn) union += 1;
  }
  return union ? (intersection / union) : null;
}

function protectedBoxesForAdapt(analysis, width, height) {
  return [
    analysis?.subject?.box,
    ...(analysis?.logo?.boxes || []),
    ...(analysis?.text?.boxes || [])
  ]
    .map(box => clampBoxToImage(denormalizeBox(box, width, height), width, height))
    .filter(Boolean);
}

function unionAbsoluteBoxesNoPaddingForAdapt(boxes = [], width, height) {
  const valid = boxes.map(box => clampBoxToImage(box, width, height)).filter(Boolean);
  if (!valid.length) return null;
  const minX = Math.min(...valid.map(box => box.x));
  const minY = Math.min(...valid.map(box => box.y));
  const maxX = Math.max(...valid.map(box => box.x + box.width));
  const maxY = Math.max(...valid.map(box => box.y + box.height));
  return clampBoxToImage({ x: minX, y: minY, width: maxX - minX, height: maxY - minY }, width, height);
}

async function cropImageToTargetProtectingBoxesForAdapt(imageUrl, targetWidth, targetHeight, boxes = [], options = {}) {
  const sourcePath = imageUrl.startsWith("/static/") ? staticUrlToLocalPath(imageUrl) : null;
  if (!sourcePath) return resizeStaticImageToTarget(imageUrl, targetWidth, targetHeight, options);
  await fs.access(sourcePath);
  const meta = await sharp(sourcePath).metadata();
  const sourceWidth = meta.width || targetWidth;
  const sourceHeight = meta.height || targetHeight;
  const targetAspect = targetWidth / Math.max(1, targetHeight);
  const sourceAspect = sourceWidth / Math.max(1, sourceHeight);
  const safeBoxes = boxes.map(box => clampBoxToImage(box, sourceWidth, sourceHeight)).filter(Boolean);
  const union = unionAbsoluteBoxesNoPaddingForAdapt(safeBoxes, sourceWidth, sourceHeight);
  const padding = Math.max(sourceWidth, sourceHeight) * 0.04;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let left = 0;
  let top = 0;

  if (sourceAspect > targetAspect) {
    cropHeight = sourceHeight;
    cropWidth = Math.min(sourceWidth, Math.round(sourceHeight * targetAspect));
    const centerX = union ? union.x + union.width / 2 : sourceWidth / 2;
    left = centerX - cropWidth / 2;
    if (union && cropWidth >= union.width + padding * 2) {
      left = Math.min(left, union.x - padding);
      left = Math.max(left, union.x + union.width + padding - cropWidth);
    }
    left = clampNumber(left, 0, sourceWidth - cropWidth);
  } else if (sourceAspect < targetAspect) {
    cropWidth = sourceWidth;
    cropHeight = Math.min(sourceHeight, Math.round(sourceWidth / targetAspect));
    const centerY = union ? union.y + union.height / 2 : sourceHeight / 2;
    top = centerY - cropHeight / 2;
    if (union && cropHeight >= union.height + padding * 2) {
      top = Math.min(top, union.y - padding);
      top = Math.max(top, union.y + union.height + padding - cropHeight);
    }
    top = clampNumber(top, 0, sourceHeight - cropHeight);
  }

  await ensureDir(STORAGE_DIR);
  const outputFilename = `aigc_protected_crop_${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${targetWidth}x${targetHeight}.jpg`;
  const outputPath = path.join(STORAGE_DIR, outputFilename);
  await sharp(sourcePath)
    .rotate()
    .extract({
      left: Math.round(left),
      top: Math.round(top),
      width: Math.max(1, Math.round(cropWidth)),
      height: Math.max(1, Math.round(cropHeight))
    })
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: "fill",
      kernel: sharp.kernel.lanczos3
    })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: Number(options.quality) || 90, mozjpeg: true })
    .toFile(outputPath);
  return `/static/${outputFilename}`;
}

async function validateCriticalContentForAdapt(resultUrl, analysis, targetWidth, targetHeight, context) {
  const issues = [];
  if ((analysis?.text?.texts || []).length > 0) {
    try {
      const afterText = await detectTextForAdapt(resultUrl, { ...context, sourceWidth: targetWidth, sourceHeight: targetHeight });
      const recall = textRecall(analysis.text.texts, afterText.texts || []);
      if (recall < 0.8) issues.push(`text recall ${(recall * 100).toFixed(1)}% below 80%`);
    } catch (err) {
      issues.push(`text check unavailable: ${err.message}`);
    }
  }
  if ((analysis?.logo?.boxes || []).length > 0 || analysis?.logo?.hasTarget) {
    try {
      const afterLogo = await detectLogoForAdapt(resultUrl, { ...context, sourceWidth: targetWidth, sourceHeight: targetHeight });
      if (!afterLogo?.hasTarget && !(afterLogo?.boxes || []).length) issues.push("logo not detected after crop");
    } catch (err) {
      issues.push(`logo check unavailable: ${err.message}`);
    }
  }
  return { ok: issues.length === 0, issues };
}

async function cropWithFallbackForAdapt(imageUrl, targetWidth, targetHeight, context, analysis = null) {
  try {
    const cropped = await suggestCroppingForAdapt(imageUrl, targetWidth, targetHeight, context);
    if (cropped.resultUrl) {
      const validation = await validateCriticalContentForAdapt(cropped.resultUrl, analysis, targetWidth, targetHeight, context);
      if (validation.ok) return cropped.resultUrl;
      context.fallbackWarnings = context.fallbackWarnings || [];
      context.fallbackWarnings.push(`AI crop rejected to preserve logo/text: ${validation.issues.join("; ")}`);
      console.warn("[AdaptImage] AI cropping rejected", JSON.stringify({ issues: validation.issues }));
    }
  } catch (err) {
    console.warn("[AdaptImage] AI cropping skipped:", err.message);
  }
  const sourceWidth = context.sourceWidth || targetWidth;
  const sourceHeight = context.sourceHeight || targetHeight;
  const boxes = protectedBoxesForAdapt(analysis, sourceWidth, sourceHeight);
  return cropImageToTargetProtectingBoxesForAdapt(imageUrl, targetWidth, targetHeight, boxes, { quality: 90 });
}

async function ensureFinalAdaptSize(resultUrl, targetWidth, targetHeight, context = null, analysis = null) {
  if (!resultUrl?.startsWith("/static/")) return resultUrl;
  const localPath = staticUrlToLocalPath(resultUrl);
  const meta = await sharp(localPath).metadata();
  if (meta.width === targetWidth && meta.height === targetHeight) {
    return resultUrl;
  }
  if (context && analysis) {
    const boxes = protectedBoxesForAdapt(analysis, meta.width || targetWidth, meta.height || targetHeight);
    return cropImageToTargetProtectingBoxesForAdapt(resultUrl, targetWidth, targetHeight, boxes, { quality: 90 });
  }
  return cropImageToTargetForAdapt(resultUrl, targetWidth, targetHeight, { quality: 88 });
}

async function inpaintForBackgroundPrep(imageUrl, masks, context) {
  if (!masks?.removableMaskUrl) {
    console.log("[AdaptImage] Step3 inpaint skipped", JSON.stringify({ reason: "no removable mask" }));
    return imageUrl;
  }
  console.log("[AdaptImage] Step3 inpaint start", JSON.stringify({ imageUrl, maskUrl: masks.removableMaskUrl }));
  const inpainted = await inpaintImageForAdapt(
    imageUrl,
    masks.removableMaskUrl,
    context,
    "remove logo and text layers, rebuild a clean natural background only"
  );
  console.log("[AdaptImage] Step3 inpaint done", JSON.stringify({ resultUrl: inpainted || imageUrl, changed: Boolean(inpainted) }));
  return inpainted || imageUrl;
}

function clampBoxToImage(box, width, height) {
  if (!box || !width || !height) return null;
  const x1 = Math.max(0, Math.min(width, Number(box.x) || 0));
  const y1 = Math.max(0, Math.min(height, Number(box.y) || 0));
  const x2 = Math.max(0, Math.min(width, (Number(box.x) || 0) + (Number(box.width) || 0)));
  const y2 = Math.max(0, Math.min(height, (Number(box.y) || 0) + (Number(box.height) || 0)));
  if (x2 <= x1 || y2 <= y1) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

function unionBoxesForAdapt(boxes = [], width, height, paddingRatio = 0.06) {
  const valid = boxes
    .map(box => clampBoxToImage(denormalizeBox(box, width, height), width, height))
    .filter(Boolean);
  if (!valid.length) return null;
  const minX = Math.min(...valid.map(box => box.x));
  const minY = Math.min(...valid.map(box => box.y));
  const maxX = Math.max(...valid.map(box => box.x + box.width));
  const maxY = Math.max(...valid.map(box => box.y + box.height));
  const padding = Math.max(width, height) * paddingRatio;
  return clampBoxToImage({
    x: minX - padding,
    y: minY - padding,
    width: (maxX - minX) + padding * 2,
    height: (maxY - minY) + padding * 2
  }, width, height);
}

function padBoxForAdapt(box, width, height, paddingRatio = 0.04) {
  const safe = clampBoxToImage(box, width, height);
  if (!safe) return null;
  const padding = Math.max(width, height) * paddingRatio;
  return clampBoxToImage({
    x: safe.x - padding,
    y: safe.y - padding,
    width: safe.width + padding * 2,
    height: safe.height + padding * 2
  }, width, height);
}

function buildZoneLayerSplitBoxForAdapt(zone, width, height) {
  const baseBox = clampBoxToImage(zone?.box, width, height);
  if (!baseBox) return null;
  const paddingRatio = zone.type === "info" ? 0.035 : zone.type === "logo" ? 0.055 : 0.045;
  return padBoxForAdapt(baseBox, width, height, paddingRatio) || baseBox;
}

function buildLayerSplitBoxForAdapt(analysis, width, height) {
  const boxes = [
    analysis.subject?.box,
    ...(analysis.logo?.boxes || []),
    ...(analysis.text?.boxes || [])
  ].filter(Boolean);
  const union = unionBoxesForAdapt(boxes, width, height, 0.055);
  if (union) return union;
  const fallbackW = width * 0.78;
  const fallbackH = height * 0.78;
  return {
    x: (width - fallbackW) / 2,
    y: (height - fallbackH) / 2,
    width: fallbackW,
    height: fallbackH
  };
}

function boxToCoord(box) {
  return [
    Math.max(0, Math.round(box.x)),
    Math.max(0, Math.round(box.y)),
    Math.max(1, Math.round(box.x + box.width)),
    Math.max(1, Math.round(box.y + box.height))
  ];
}

async function inspectStaticImageLayer(staticUrl) {
  if (!staticUrl?.startsWith("/static/")) return null;
  const localPath = staticUrlToLocalPath(staticUrl);
  const meta = await sharp(localPath).metadata();
  return {
    url: staticUrl,
    path: localPath,
    width: meta.width || 0,
    height: meta.height || 0,
    hasAlpha: Boolean(meta.hasAlpha),
    channels: meta.channels || 0
  };
}

function inferLayerRole(media, index) {
  const text = JSON.stringify({
    index,
    media_extra: media?.media_extra,
    extra: media?.extra,
    profiles: media?.media_profiles,
    type: media?.type,
    name: media?.name,
    layer: media?.layer
  }).toLowerCase();
  if (/(background|bg|clean|base|back)/.test(text)) return "background";
  if (/(foreground|fg|front|subject|layer|alpha)/.test(text)) return "foreground";
  return "";
}

async function normalizePosterLayerResult(raw) {
  const mediaList = extractAigcResultMedia(raw);
  const layers = [];
  for (let index = 0; index < mediaList.length; index += 1) {
    const media = mediaList[index];
    const value = media?.media_data || media?.media_url;
    const storedUrl = await persistProviderImageValue(value, `poster_layer_${index}`);
    if (!storedUrl) continue;
    try {
      const inspected = await inspectStaticImageLayer(storedUrl);
      if (inspected) {
        layers.push({
          ...inspected,
          index,
          roleHint: inferLayerRole(media, index),
          media
        });
      }
    } catch (err) {
      console.warn("[AdaptImage] poster layer inspect skipped:", err.message);
    }
  }

  const foreground =
    layers.find(layer => layer.roleHint === "foreground") ||
    layers.find(layer => layer.hasAlpha) ||
    layers[0] ||
    null;
  const background =
    layers.find(layer => layer.roleHint === "background" && layer.url !== foreground?.url) ||
    layers.find(layer => !layer.hasAlpha && layer.url !== foreground?.url) ||
    layers.find(layer => layer.url !== foreground?.url) ||
    null;

  return { foreground, background, layers, raw };
}

async function splitPosterLayersForAdapt(imageUrl, layerBox, context) {
  const config = context.config;
  const apiStyle = getAdaptApiStyle(config);
  if (apiStyle !== ADAPT_API_STYLES.openapi) {
    throw new Error("poster layer split is currently only configured for OpenAPI style");
  }
  const openapiImageUrl = await resolveOpenapiAdaptImageUrl(imageUrl, context);
  const mediaInfo = /^https?:\/\//i.test(openapiImageUrl || "")
    ? mediaInfoFromUrl(openapiImageUrl)
    : await mediaInfoForOpenapiAdaptImage(imageUrl, context);
  const endpoint = ADAPT_ENDPOINTS.openapi.posterLayer;
  const requestPayload = {
    parameter: {
      input_type: "box",
      box_coord: boxToCoord(layerBox),
      json_file: "",
      subject_protect: true,
      only_text_eliminate: false,
      eliminate_type: "v0421"
    },
    extra: {},
    media_info_list: [mediaInfo]
  };
  console.log("[AdaptImage] Step3 layer split start", JSON.stringify({
    endpoint,
    boxCoord: requestPayload.parameter.box_coord,
    media: summarizeMediaInfoList([mediaInfo])[0]
  }));
  const submitted = await submitOpenapiV3Async(endpoint, requestPayload, {
    ...context,
    config,
    algorithmHost: config.mtlabApiHost,
    algorithmApiName: `/v1/${endpoint}`,
    preserveBody: true
  });
  const msgId = submitted.msgId || submitted.pollId || submitted.taskId;
  const raw = await pollOpenapiV3Async(msgId, {
    ...context,
    pollMode: submitted.pollMode,
    pollHost: submitted.pollHost,
    initialDelayMs: 3000,
    pollIntervalMs: config.pollIntervalMs,
    maxPolls: config.maxPolls,
    config
  });
  const normalized = await normalizePosterLayerResult(raw);
  if (!normalized.foreground?.url || !normalized.background?.url) {
    throw new Error(`poster layer split did not return usable foreground/background layers, mediaCount=${normalized.layers.length}`);
  }
  console.log("[AdaptImage] Step3 layer split done", JSON.stringify({
    foreground: normalized.foreground.url,
    background: normalized.background.url,
    layerCount: normalized.layers.length
  }));
  return normalized;
}

async function parseProviderJsonValue(value) {
  if (!value || typeof value !== "string") return null;
  try {
    if (/^https?:\/\//i.test(value)) {
      const response = await axios.get(value, { timeout: 60000, responseType: "text" });
      return typeof response.data === "string" ? JSON.parse(response.data) : response.data;
    }
    const cleaned = value.replace(/^data:application\/json;base64,/, "");
    if (/^\s*[\[{]/.test(cleaned)) return JSON.parse(cleaned);
    if (isLikelyBase64Image(cleaned)) {
      const decoded = Buffer.from(cleaned, "base64").toString("utf-8");
      if (/^\s*[\[{]/.test(decoded)) return JSON.parse(decoded);
    }
  } catch (err) {
    console.warn("[AdaptImage] design json parse skipped:", err.message);
  }
  return null;
}

function collectObjectsDeep(value, output = [], depth = 0) {
  if (!value || depth > 8) return output;
  if (Array.isArray(value)) {
    value.forEach(item => collectObjectsDeep(item, output, depth + 1));
    return output;
  }
  if (typeof value === "object") {
    output.push(value);
    Object.values(value).forEach(item => collectObjectsDeep(item, output, depth + 1));
  }
  return output;
}

function classifyDesignLayer(value = {}) {
  const text = JSON.stringify({
    type: value.type,
    layer_type: value.layer_type,
    layerType: value.layerType,
    element_type: value.element_type,
    elementType: value.elementType,
    category: value.category,
    class: value.class,
    tag: value.tag,
    name: value.name,
    label: value.label,
    role: value.role,
    attr: value.attr,
    attribute: value.attribute,
    attributes: value.attributes,
    text: value.text,
    content: value.content,
    value: value.value
  }).toLowerCase();
  if (/(logo|brand|trademark)/.test(text)) return "logo";
  if (/(text|word|copy|title|subtitle|slogan|ocr|文字|文案|标题)/.test(text)) return "text";
  if (/(subject|person|product|foreground|main|主体|商品|人物)/.test(text)) return "subject";
  return "";
}

function boxFromAnyLayer(value, width, height) {
  const candidates = [
    value?.box,
    value?.bbox,
    value?.bounding_box,
    value?.boundingBox,
    value?.text_box,
    value?.textBox,
    value?.rect,
    value?.frame,
    value?.bounds,
    value?.bound,
    value?.position,
    value?.coord,
    value?.coords,
    value?.box_coord,
    value?.boxCoord,
    value?.points,
    value?.polygon,
    value
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (Array.isArray(candidate) && candidate.length >= 4) {
      const [left, top, right, bottom] = candidate.map(Number);
      if ([left, top, right, bottom].every(Number.isFinite) && right > left && bottom > top) {
        return clampBoxToImage({ x: left, y: top, width: right - left, height: bottom - top }, width, height);
      }
    }
    const box = clampBoxToImage(denormalizeBox(boxFromProvider(candidate), width, height), width, height);
    if (box) return box;
  }
  return null;
}

async function analyzePosterDesignForAdapt(imageUrl, context) {
  const config = context.config;
  if (getAdaptApiStyle(config) !== ADAPT_API_STYLES.openapi) {
    return { layers: [], raw: null, warnings: ["poster design analysis skipped for non-openapi style"] };
  }
  const endpoint = ADAPT_ENDPOINTS.openapi.posterDesign;
  const openapiImageUrl = await resolveOpenapiAdaptImageUrl(imageUrl, context);
  const mediaInfo = /^https?:\/\//i.test(openapiImageUrl || "")
    ? mediaInfoFromUrl(openapiImageUrl)
    : await mediaInfoForOpenapiAdaptImage(imageUrl, context);
  const requestPayload = {
    parameter: {
      rsp_media_type: "url",
      ori_lang: "zh",
      lang_ori: "zh"
    },
    extra: {},
    media_info_list: [mediaInfo]
  };
  console.log("[AdaptImage] design analysis start", JSON.stringify({
    endpoint,
    media: summarizeMediaInfoList([mediaInfo])[0]
  }));
  const submitted = await submitOpenapiV3Async(endpoint, requestPayload, {
    ...context,
    config,
    algorithmHost: config.mtlabApiHost,
    algorithmApiName: `/v1/${endpoint}`,
    preserveBody: true
  });
  const msgId = submitted.msgId || submitted.pollId || submitted.taskId;
  const raw = await pollOpenapiV3Async(msgId, {
    ...context,
    pollMode: submitted.pollMode,
    pollHost: submitted.pollHost,
    initialDelayMs: 3000,
    pollIntervalMs: config.pollIntervalMs,
    maxPolls: config.maxPolls,
    config
  });

  const parsedPayloads = [raw];
  const mediaList = extractAigcResultMedia(raw);
  for (const media of mediaList) {
    const parsed = await parseProviderJsonValue(media?.media_data || media?.media_url);
    if (parsed) parsedPayloads.push(parsed);
  }
  const objects = parsedPayloads.flatMap(payload => collectObjectsDeep(payload));
  const layers = objects
    .map(item => {
      const type = classifyDesignLayer(item);
      const box = boxFromAnyLayer(item, context.sourceWidth, context.sourceHeight);
      if (!type || !box) return null;
      return {
        type,
        box,
        text: item.text || item.content || item.value || "",
        raw: item
      };
    })
    .filter(Boolean);
  console.log("[AdaptImage] design analysis done", JSON.stringify({
    mediaCount: mediaList.length,
    layerCount: layers.length,
    counts: layers.reduce((acc, layer) => {
      acc[layer.type] = (acc[layer.type] || 0) + 1;
      return acc;
    }, {})
  }));
  return { layers, raw, mediaCount: mediaList.length, warnings: [] };
}

function buildRelayoutZonesForAdapt(analysis, designAnalysis, width, height) {
  const zones = [];
  if (analysis.subject?.box) {
    zones.push({ id: "subject-0", type: "subject", box: clampBoxToImage(denormalizeBox(analysis.subject.box, width, height), width, height), source: "saliency" });
  }
  (analysis.logo?.boxes || []).forEach((box, index) => {
    zones.push({ id: `logo-${index}`, type: "logo", box: clampBoxToImage(denormalizeBox(box, width, height), width, height), source: "logo" });
  });
  (analysis.text?.boxes || []).forEach((box, index) => {
    zones.push({ id: `text-${index}`, type: "text", box: clampBoxToImage(denormalizeBox(box, width, height), width, height), source: "text", text: analysis.text?.texts?.[index] || "" });
  });
  (designAnalysis?.layers || []).forEach((layer, index) => {
    zones.push({ id: `design-${layer.type}-${index}`, type: layer.type, box: clampBoxToImage(layer.box, width, height), source: "poster-design", text: layer.text || "" });
  });
  const infoGroups = buildInfoGroupZonesForAdapt(zones, width, height);
  const groupedMemberIds = new Set(infoGroups.flatMap(group => (group.members || []).map(member => member.id)));
  const validZones = zones
    .filter(zone => zone.box)
    .filter(zone => !groupedMemberIds.has(zone.id))
    .concat(infoGroups)
    .sort((a, b) => {
      const priority = { subject: 0, info: 1, logo: 2, text: 3 };
      return (priority[a.type] ?? 9) - (priority[b.type] ?? 9);
    });
  const deduped = [];
  for (const zone of validZones) {
    const duplicate = deduped.some(existing => existing.type === zone.type && boxIou(existing.box, zone.box) > 0.72);
    if (!duplicate) deduped.push(zone);
  }
  return deduped.slice(0, 6);
}

function boxIou(a, b) {
  if (!a || !b) return 0;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const union = a.width * a.height + b.width * b.height - intersection;
  return union > 0 ? intersection / union : 0;
}

function boxIntersectionCoverage(a, b) {
  if (!a || !b) return 0;
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);
  const intersection = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const smallerArea = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
  return intersection / smallerArea;
}

function absoluteBoxGap(a, b) {
  if (!a || !b) return { x: Infinity, y: Infinity };
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  return {
    x: Math.max(0, Math.max(a.x, b.x) - Math.min(ax2, bx2)),
    y: Math.max(0, Math.max(a.y, b.y) - Math.min(ay2, by2))
  };
}

function unionAbsoluteBoxesForAdapt(boxes = [], width, height, paddingRatio = 0.025) {
  const valid = boxes.map(box => clampBoxToImage(box, width, height)).filter(Boolean);
  if (!valid.length) return null;
  const minX = Math.min(...valid.map(box => box.x));
  const minY = Math.min(...valid.map(box => box.y));
  const maxX = Math.max(...valid.map(box => box.x + box.width));
  const maxY = Math.max(...valid.map(box => box.y + box.height));
  const padding = Math.max(width, height) * paddingRatio;
  return clampBoxToImage({
    x: minX - padding,
    y: minY - padding,
    width: (maxX - minX) + padding * 2,
    height: (maxY - minY) + padding * 2
  }, width, height);
}

function areInfoZonesRelatedForAdapt(a, b, width, height) {
  if (!a?.box || !b?.box) return false;
  if (boxIntersectionCoverage(a.box, b.box) > 0.08 || boxIntersectionCoverage(b.box, a.box) > 0.08) return true;
  const gap = absoluteBoxGap(a.box, b.box);
  const centerAY = a.box.y + a.box.height / 2;
  const centerBY = b.box.y + b.box.height / 2;
  const centerAX = a.box.x + a.box.width / 2;
  const centerBX = b.box.x + b.box.width / 2;
  const sameRow = Math.abs(centerAY - centerBY) < height * 0.075 && gap.x < width * 0.12;
  const sameColumn = Math.abs(centerAX - centerBX) < width * 0.18 && gap.y < height * 0.08;
  const closeBrandStack = gap.x < width * 0.20 && gap.y < height * 0.10;
  return sameRow || sameColumn || closeBrandStack;
}

function buildInfoGroupZonesForAdapt(zones = [], width, height) {
  const candidates = zones
    .filter(zone => (zone.type === "logo" || zone.type === "text") && zone.box)
    .map(zone => ({ ...zone }));
  if (candidates.length < 2) return [];
  const groups = [];
  const used = new Set();
  for (let i = 0; i < candidates.length; i += 1) {
    if (used.has(i)) continue;
    const groupIndexes = new Set([i]);
    let changed = true;
    while (changed) {
      changed = false;
      for (let j = 0; j < candidates.length; j += 1) {
        if (groupIndexes.has(j) || used.has(j)) continue;
        const matches = [...groupIndexes].some(index => areInfoZonesRelatedForAdapt(candidates[index], candidates[j], width, height));
        if (matches) {
          groupIndexes.add(j);
          changed = true;
        }
      }
    }
    const members = [...groupIndexes].map(index => candidates[index]);
    if (members.length < 2) continue;
    const union = unionAbsoluteBoxesForAdapt(members.map(member => member.box), width, height, 0.025);
    if (!union) continue;
    const areaRatio = (union.width * union.height) / Math.max(1, width * height);
    if (areaRatio > 0.36) continue;
    groupIndexes.forEach(index => used.add(index));
    groups.push({
      id: `info-${groups.length}`,
      type: "info",
      box: union,
      source: members.some(member => member.source === "poster-design") ? "poster-design-group" : "detected-info-group",
      text: members.map(member => member.text).filter(Boolean).join(" "),
      members: members.map(member => ({ id: member.id, type: member.type, source: member.source, box: member.box }))
    });
  }
  return groups;
}

function summarizeRelayoutBoxForAdapt(box, width, height) {
  const safe = clampBoxToImage(box, width, height);
  if (!safe) return null;
  return {
    x: Math.round(safe.x),
    y: Math.round(safe.y),
    width: Math.round(safe.width),
    height: Math.round(safe.height),
    areaRatio: Number(((safe.width * safe.height) / Math.max(1, width * height)).toFixed(4))
  };
}

function summarizeRelayoutZoneForAdapt(zone, width, height) {
  if (!zone) return null;
  return {
    id: zone.id,
    type: zone.type,
    source: zone.source,
    text: zone.text || "",
    box: summarizeRelayoutBoxForAdapt(zone.box, width, height),
    memberCount: zone.members?.length || 0,
    members: (zone.members || []).map(member => ({
      id: member.id,
      type: member.type,
      source: member.source,
      box: summarizeRelayoutBoxForAdapt(member.box, width, height)
    }))
  };
}

function buildRelayoutDiagnosticsForAdapt({
  zones = [],
  selectedZones = [],
  skippedZones = [],
  layerErrors = [],
  multiLayerItems = [],
  designAnalysis = null,
  width = 0,
  height = 0
} = {}) {
  const infoGroups = zones.filter(zone => zone.type === "info");
  return {
    designLayerCount: designAnalysis?.layers?.length || 0,
    designWarnings: designAnalysis?.warnings || [],
    zoneCounts: zones.reduce((acc, zone) => {
      acc[zone.type] = (acc[zone.type] || 0) + 1;
      return acc;
    }, {}),
    infoGroups: infoGroups.map(zone => summarizeRelayoutZoneForAdapt(zone, width, height)),
    selectedZones: selectedZones.map(zone => summarizeRelayoutZoneForAdapt(zone, width, height)),
    skippedZones,
    layerErrors,
    compositedItems: multiLayerItems.map(item => ({
      id: item.id,
      type: item.type,
      source: item.source,
      memberCount: item.members?.length || 0,
      box: summarizeRelayoutBoxForAdapt(item.box, width, height),
      layout: item.layout
    }))
  };
}

async function trimForegroundLayerForAdapt(foregroundUrl) {
  if (!foregroundUrl?.startsWith("/static/")) return { url: foregroundUrl, meta: null };
  const sourcePath = staticUrlToLocalPath(foregroundUrl);
  const meta = await sharp(sourcePath).metadata();
  if (!meta.hasAlpha) return { url: foregroundUrl, meta };
  await ensureDir(STORAGE_DIR);
  const outputFilename = `poster_foreground_trim_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.png`;
  const outputPath = path.join(STORAGE_DIR, outputFilename);
  try {
    await sharp(sourcePath)
      .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 }, threshold: 8 })
      .png()
      .toFile(outputPath);
    const trimmedMeta = await sharp(outputPath).metadata();
    return { url: `/static/${outputFilename}`, meta: trimmedMeta };
  } catch (err) {
    console.warn("[AdaptImage] foreground trim skipped:", err.message);
    return { url: foregroundUrl, meta };
  }
}

function planLayerPlacementForAdapt(foregroundMeta, targetWidth, targetHeight) {
  const sourceWidth = Math.max(1, foregroundMeta?.width || targetWidth);
  const sourceHeight = Math.max(1, foregroundMeta?.height || targetHeight);
  const maxWidth = targetWidth * 0.82;
  const maxHeight = targetHeight * 0.82;
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, 1.15);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  return {
    x: Math.round((targetWidth - width) / 2),
    y: Math.round((targetHeight - height) / 2),
    width,
    height,
    scale
  };
}

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function fitSizeWithinLimit(width, height, maxSide = 2048, minSide = 64) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const scale = Math.min(1, maxSide / Math.max(safeWidth, safeHeight));
  return {
    width: Math.max(minSide, Math.round(safeWidth * scale)),
    height: Math.max(minSide, Math.round(safeHeight * scale))
  };
}

async function buildRelayoutBackgroundBuffer(backgroundPath, targetWidth, targetHeight) {
  return sharp(backgroundPath)
    .rotate()
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: "cover",
      position: "center",
      kernel: sharp.kernel.lanczos3
    })
    .jpeg({ quality: 91, mozjpeg: true })
    .toBuffer();
}

function isStandardFocalWindowTemplateForAdapt(context = {}) {
  const templateId = String(context.templateId || "").toLowerCase();
  const templateName = String(context.templateName || "");
  const appName = String(context.appName || "");
  if (/^(mt|my|wk)-f-\d+/.test(templateId)) return true;
  const text = `${appName}${templateName}${templateId}`.toLowerCase();
  if (!/(焦点视窗|focal)/i.test(text)) return false;
  return !/(破框|3d|多态|跃动|焕新|翻卡|画廊|break|refresh|polymorphic|gallery)/i.test(text);
}

function isStandardSplashTemplateForAdapt(context = {}) {
  const templateId = String(context.templateId || "").toLowerCase();
  const templateName = String(context.templateName || "");
  const appName = String(context.appName || "");
  if (/^(mt|my|wk)-s-\d+/.test(templateId)) return true;
  const text = `${appName}${templateName}${templateId}`.toLowerCase();
  return /(开屏|splash)/i.test(text) && !/(炫动|杂志|聚光|创新|dynamic|magazine|gallery)/i.test(text);
}

function evaluateSplashInfoSafeAreaForAdapt(analysis, sourceWidth, sourceHeight, targetWidth, targetHeight, context = {}) {
  if (!isStandardSplashTemplateForAdapt(context)) return null;
  if (context.splashSafeAreaAdjustment?.infoSafeArea?.applies) {
    return context.splashSafeAreaAdjustment.infoSafeArea;
  }
  const sourceBoxes = [
    ...(analysis?.logo?.boxes || []).map(box => ({ type: "logo", box })),
    ...(analysis?.text?.boxes || []).map(box => ({ type: "text", box }))
  ];
  const boxes = sourceBoxes
    .map(item => ({
      type: item.type,
      box: normalizeBox(item.box, sourceWidth, sourceHeight, targetWidth, targetHeight)
    }))
    .filter(item => Boolean(item.box));
  const unsafeBoxes = boxes.filter(item => !isBoxInsidePixelSafeArea(
    item.box,
    targetWidth,
    targetHeight,
    STANDARD_SPLASH_INFO_SAFE_MARGIN_PX
  ));
  return {
    applies: true,
    marginPx: STANDARD_SPLASH_INFO_SAFE_MARGIN_PX,
    boxCount: boxes.length,
    unsafeCount: unsafeBoxes.length,
    passed: unsafeBoxes.length === 0,
    safeArea: {
      left: STANDARD_SPLASH_INFO_SAFE_MARGIN_PX,
      top: STANDARD_SPLASH_INFO_SAFE_MARGIN_PX,
      right: Math.max(STANDARD_SPLASH_INFO_SAFE_MARGIN_PX, targetWidth - STANDARD_SPLASH_INFO_SAFE_MARGIN_PX),
      bottom: Math.max(STANDARD_SPLASH_INFO_SAFE_MARGIN_PX, targetHeight - STANDARD_SPLASH_INFO_SAFE_MARGIN_PX)
    },
    boxes: boxes.map(item => ({
      type: item.type,
      x: Math.round(item.box.x),
      y: Math.round(item.box.y),
      width: Math.round(item.box.width),
      height: Math.round(item.box.height),
      inside: isBoxInsidePixelSafeArea(item.box, targetWidth, targetHeight, STANDARD_SPLASH_INFO_SAFE_MARGIN_PX)
    }))
  };
}

function collectSplashInfoSourceBoxesForAdapt(analysis, sourceWidth, sourceHeight) {
  const sourceBoxes = [
    ...(analysis?.logo?.boxes || []).map(box => ({ type: "logo", box })),
    ...(analysis?.text?.boxes || []).map(box => ({ type: "text", box }))
  ];
  return sourceBoxes
    .map(item => ({
      type: item.type,
      box: clampBoxToImage(denormalizeBox(item.box, sourceWidth, sourceHeight), sourceWidth, sourceHeight)
    }))
    .filter(item => Boolean(item.box));
}

function chooseSplashSafeAreaTransformForAdapt(sourceWidth, sourceHeight, targetWidth, targetHeight, boxes, marginPx) {
  if (!sourceWidth || !sourceHeight || !targetWidth || !targetHeight || !boxes.length) return null;
  const maxScale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  if (!Number.isFinite(maxScale) || maxScale <= 0) return null;
  const minScale = Math.min(maxScale, 0.12);
  const margin = Math.min(Number(marginPx) || 0, targetWidth / 2, targetHeight / 2);

  const findTransform = (scale) => {
    const scaledWidth = sourceWidth * scale;
    const scaledHeight = sourceHeight * scale;
    let minX = 0;
    let maxX = targetWidth - scaledWidth;
    let minY = 0;
    let maxY = targetHeight - scaledHeight;

    for (const item of boxes) {
      const box = item.box;
      minX = Math.max(minX, margin - box.x * scale);
      maxX = Math.min(maxX, targetWidth - margin - (box.x + box.width) * scale);
      minY = Math.max(minY, margin - box.y * scale);
      maxY = Math.min(maxY, targetHeight - margin - (box.y + box.height) * scale);
    }

    if (minX > maxX || minY > maxY) return null;
    const centeredX = (targetWidth - scaledWidth) / 2;
    const centeredY = (targetHeight - scaledHeight) / 2;
    return {
      scale,
      width: Math.max(1, Math.round(scaledWidth)),
      height: Math.max(1, Math.round(scaledHeight)),
      x: Math.round(clampNumber(centeredX, minX, maxX)),
      y: Math.round(clampNumber(centeredY, minY, maxY))
    };
  };

  const fullFit = findTransform(maxScale);
  if (fullFit) return fullFit;

  let low = minScale;
  let high = maxScale;
  let best = null;
  for (let index = 0; index < 32; index += 1) {
    const mid = (low + high) / 2;
    const candidate = findTransform(mid);
    if (candidate) {
      best = candidate;
      low = mid;
    } else {
      high = mid;
    }
  }
  return best || findTransform(minScale);
}

async function buildSplashSafeAreaCanvasForAdapt(imageUrl, targetWidth, targetHeight, context, analysis) {
  if (!isStandardSplashTemplateForAdapt(context)) return null;
  const sourceStaticUrl = await ensureStaticImageUrlForResize(imageUrl);
  const sourcePath = sourceStaticUrl?.startsWith("/static/") ? staticUrlToLocalPath(sourceStaticUrl) : "";
  if (!sourcePath) return null;
  const sourceMeta = await sharp(sourcePath).metadata();
  const sourceWidth = sourceMeta.width || context.sourceWidth || targetWidth;
  const sourceHeight = sourceMeta.height || context.sourceHeight || targetHeight;
  const boxes = collectSplashInfoSourceBoxesForAdapt(analysis, sourceWidth, sourceHeight);
  if (!boxes.length) return null;

  const transform = chooseSplashSafeAreaTransformForAdapt(
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    boxes,
    STANDARD_SPLASH_INFO_SAFE_MARGIN_PX
  );
  if (!transform) return null;

  const mappedBoxes = boxes.map(item => ({
    type: item.type,
    box: {
      x: item.box.x * transform.scale + transform.x,
      y: item.box.y * transform.scale + transform.y,
      width: item.box.width * transform.scale,
      height: item.box.height * transform.scale
    }
  }));
  const unsafeBoxes = mappedBoxes.filter(item => !isBoxInsidePixelSafeArea(
    item.box,
    targetWidth,
    targetHeight,
    STANDARD_SPLASH_INFO_SAFE_MARGIN_PX
  ));

  await ensureDir(STORAGE_DIR);
  const filename = `splash_safe_area_${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${targetWidth}x${targetHeight}.jpg`;
  const outputPath = path.join(STORAGE_DIR, filename);
  const foregroundBuffer = await sharp(sourcePath)
    .rotate()
    .resize({
      width: transform.width,
      height: transform.height,
      fit: "fill",
      kernel: sharp.kernel.lanczos3
    })
    .jpeg({ quality: 94, mozjpeg: true })
    .toBuffer();

  await sharp(sourcePath)
    .rotate()
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: "cover",
      position: "center",
      kernel: sharp.kernel.lanczos3
    })
    .blur(14)
    .modulate({ saturation: 0.92, brightness: 0.98 })
    .jpeg({ quality: 92, mozjpeg: true })
    .composite([{ input: foregroundBuffer, left: transform.x, top: transform.y }])
    .toFile(outputPath);

  const infoSafeArea = {
    applies: true,
    marginPx: STANDARD_SPLASH_INFO_SAFE_MARGIN_PX,
    adjusted: true,
    boxCount: mappedBoxes.length,
    unsafeCount: unsafeBoxes.length,
    passed: unsafeBoxes.length === 0,
    safeArea: {
      left: STANDARD_SPLASH_INFO_SAFE_MARGIN_PX,
      top: STANDARD_SPLASH_INFO_SAFE_MARGIN_PX,
      right: Math.max(STANDARD_SPLASH_INFO_SAFE_MARGIN_PX, targetWidth - STANDARD_SPLASH_INFO_SAFE_MARGIN_PX),
      bottom: Math.max(STANDARD_SPLASH_INFO_SAFE_MARGIN_PX, targetHeight - STANDARD_SPLASH_INFO_SAFE_MARGIN_PX)
    },
    boxes: mappedBoxes.map(item => ({
      type: item.type,
      x: Math.round(item.box.x),
      y: Math.round(item.box.y),
      width: Math.round(item.box.width),
      height: Math.round(item.box.height),
      inside: isBoxInsidePixelSafeArea(item.box, targetWidth, targetHeight, STANDARD_SPLASH_INFO_SAFE_MARGIN_PX)
    }))
  };

  return {
    url: `/static/${filename}`,
    sourceUrl: sourceStaticUrl,
    transform,
    infoSafeArea
  };
}

function planZonePlacementForAdapt(zone, sourceMeta, targetWidth, targetHeight, indexByType = 0, sourceCanvasWidth = 0, sourceCanvasHeight = 0, context = {}) {
  const sourceWidth = Math.max(1, sourceMeta?.width || zone.box?.width || targetWidth);
  const sourceHeight = Math.max(1, sourceMeta?.height || zone.box?.height || targetHeight);
  const canvasWidth = Math.max(1, sourceCanvasWidth || targetWidth);
  const canvasHeight = Math.max(1, sourceCanvasHeight || targetHeight);
  const sourceAspect = canvasWidth / canvasHeight;
  const targetAspect = targetWidth / targetHeight;
  const isLandscapeToPortrait = sourceAspect > 1.12 && targetAspect < 0.78;
  const isPortraitToLandscape = sourceAspect < 0.78 && targetAspect > 1.12;
  const isFocalLeftRight = isStandardFocalWindowTemplateForAdapt(context);
  const focalLeftCenterX = targetWidth * 0.24;
  const marginX = targetWidth * 0.05;
  const marginY = targetHeight * 0.05;
  const normalizedCenterX = zone.box ? (zone.box.x + zone.box.width / 2) / canvasWidth : 0.5;
  const normalizedCenterY = zone.box ? (zone.box.y + zone.box.height / 2) / canvasHeight : 0.5;
  let maxWidth = targetWidth * 0.78;
  let maxHeight = targetHeight * 0.58;
  let centerX = normalizedCenterX * targetWidth;
  let centerY = normalizedCenterY * targetHeight;
  let maxScale = 1.08;

  if (zone.type === "logo") {
    maxWidth = targetWidth * 0.46;
    maxHeight = targetHeight * 0.16;
    if (isFocalLeftRight) {
      maxWidth = targetWidth * 0.43;
      maxHeight = targetHeight * 0.16;
      centerX = focalLeftCenterX;
      centerY = targetHeight * (0.28 + indexByType * 0.08);
    } else if (isPortraitToLandscape) {
      maxWidth = targetWidth * 0.46;
      maxHeight = targetHeight * 0.18;
      centerX = targetWidth * 0.28;
      centerY = targetHeight * (0.24 + indexByType * 0.07);
    } else if (isLandscapeToPortrait) {
      maxWidth = targetWidth * 0.78;
      maxHeight = targetHeight * 0.16;
      centerX = targetWidth / 2;
      centerY = targetHeight * 0.13 + indexByType * targetHeight * 0.06;
    } else {
      centerX = clampNumber(centerX, marginX + maxWidth / 2, targetWidth - marginX - maxWidth / 2);
      centerY = clampNumber(centerY + indexByType * targetHeight * 0.04, marginY + maxHeight / 2, targetHeight * 0.34);
    }
    maxScale = 1.08;
  } else if (zone.type === "info") {
    maxWidth = targetWidth * 0.88;
    maxHeight = targetHeight * 0.25;
    if (isFocalLeftRight) {
      maxWidth = targetWidth * 0.43;
      maxHeight = targetHeight * 0.48;
      centerX = focalLeftCenterX;
      centerY = targetHeight * 0.43;
    } else if (isPortraitToLandscape) {
      maxWidth = targetWidth * 0.42;
      maxHeight = targetHeight * 0.44;
      centerX = targetWidth * 0.29;
      centerY = targetHeight * 0.46;
    } else if (isLandscapeToPortrait) {
      maxWidth = targetWidth * 0.88;
      maxHeight = targetHeight * 0.24;
      centerX = targetWidth / 2;
      centerY = targetHeight * 0.19;
    } else {
      centerX = clampNumber(centerX, marginX + maxWidth / 2, targetWidth - marginX - maxWidth / 2);
      centerY = clampNumber(centerY, marginY + maxHeight / 2, targetHeight * 0.40);
    }
    maxScale = 1.08;
  } else if (zone.type === "text") {
    maxWidth = targetWidth * 0.90;
    maxHeight = targetHeight * 0.24;
    if (isFocalLeftRight) {
      maxWidth = targetWidth * 0.42;
      maxHeight = targetHeight * 0.24;
      centerX = focalLeftCenterX;
      centerY = targetHeight * (0.42 + indexByType * 0.13);
    } else if (isPortraitToLandscape) {
      maxWidth = targetWidth * 0.40;
      maxHeight = targetHeight * 0.24;
      centerX = targetWidth * 0.29;
      centerY = targetHeight * (0.43 + indexByType * 0.14);
    } else if (isLandscapeToPortrait) {
      maxWidth = targetWidth * 0.90;
      maxHeight = targetHeight * 0.22;
      centerX = targetWidth / 2;
      centerY = targetHeight * (0.23 + indexByType * 0.075);
    } else {
      centerX = clampNumber(centerX, marginX + maxWidth / 2, targetWidth - marginX - maxWidth / 2);
      centerY = clampNumber(centerY + indexByType * targetHeight * 0.055, targetHeight * 0.12, targetHeight * 0.86);
    }
    maxScale = 1.10;
  } else if (zone.type === "subject") {
    maxWidth = targetWidth * 0.84;
    maxHeight = targetHeight * 0.64;
    if (isFocalLeftRight) {
      maxWidth = targetWidth * 0.58;
      maxHeight = targetHeight * 0.94;
      centerX = targetWidth * 0.74;
      centerY = targetHeight * 0.54;
    } else if (isPortraitToLandscape) {
      maxWidth = targetWidth * 0.54;
      maxHeight = targetHeight * 0.92;
      centerX = targetWidth * 0.73;
      centerY = targetHeight * 0.52;
    } else if (isLandscapeToPortrait) {
      maxWidth = targetWidth * 0.92;
      maxHeight = targetHeight * 0.66;
      centerX = targetWidth / 2;
      centerY = targetHeight * 0.74;
    } else {
      centerX = clampNumber(centerX, targetWidth * 0.25, targetWidth * 0.75);
      centerY = clampNumber(centerY, targetHeight * 0.28, targetHeight * 0.66);
    }
    maxScale = 1.22;
  }

  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, maxScale);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const itemMarginX = zone.type === "subject" ? 0 : marginX;
  const itemMarginTop = zone.type === "subject" ? 0 : marginY;
  const itemMarginBottom = zone.type === "subject" ? 0 : marginY;
  let x = Math.round(clampNumber(centerX - width / 2, itemMarginX, targetWidth - itemMarginX - width));
  let y = Math.round(clampNumber(centerY - height / 2, itemMarginTop, targetHeight - itemMarginBottom - height));
  if (zone.type === "subject" && isLandscapeToPortrait) {
    y = Math.round(clampNumber(targetHeight - height, 0, targetHeight - height));
  }
  if (zone.type === "subject" && isPortraitToLandscape) {
    x = Math.round(clampNumber(targetWidth - width, 0, targetWidth - width));
  }
  return {
    x,
    y,
    width,
    height,
    scale
  };
}

async function composeMultiLayerRelayoutForAdapt(backgroundUrl, layerItems, targetWidth, targetHeight) {
  const backgroundStatic = await ensureStaticImageUrlForResize(backgroundUrl);
  if (!backgroundStatic?.startsWith("/static/")) {
    throw new Error("multi-layer relayout requires a local static background layer");
  }
  const composites = [];
  for (const item of layerItems) {
    const foregroundStatic = await ensureStaticImageUrlForResize(item.url);
    if (!foregroundStatic?.startsWith("/static/")) continue;
    const foregroundPath = staticUrlToLocalPath(foregroundStatic);
    const buffer = await sharp(foregroundPath)
      .rotate()
      .resize({
        width: item.layout.width,
        height: item.layout.height,
        fit: "contain",
        withoutEnlargement: false,
        kernel: sharp.kernel.lanczos3
      })
      .png()
      .toBuffer();
    composites.push({
      input: buffer,
      left: Math.round(item.layout.x),
      top: Math.round(item.layout.y),
      blend: "over"
    });
  }
  if (!composites.length) {
    throw new Error("multi-layer relayout produced no compositable foreground layers");
  }
  await ensureDir(STORAGE_DIR);
  const outputFilename = `aigc_multilayer_relayout_${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${targetWidth}x${targetHeight}.jpg`;
  const outputPath = path.join(STORAGE_DIR, outputFilename);
  const backgroundBuffer = await buildRelayoutBackgroundBuffer(staticUrlToLocalPath(backgroundStatic), targetWidth, targetHeight);
  await sharp(backgroundBuffer)
    .composite(composites)
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outputPath);
  return `/static/${outputFilename}`;
}

async function composeLayeredRelayoutForAdapt(backgroundUrl, foregroundUrl, targetWidth, targetHeight, layout) {
  const backgroundStatic = await ensureStaticImageUrlForResize(backgroundUrl);
  const foregroundStatic = await ensureStaticImageUrlForResize(foregroundUrl);
  if (!backgroundStatic?.startsWith("/static/") || !foregroundStatic?.startsWith("/static/")) {
    throw new Error("layered relayout requires local static background and foreground layers");
  }
  const backgroundPath = staticUrlToLocalPath(backgroundStatic);
  const foregroundPath = staticUrlToLocalPath(foregroundStatic);
  const foregroundBuffer = await sharp(foregroundPath)
    .rotate()
    .resize({
      width: layout.width,
      height: layout.height,
      fit: "contain",
      withoutEnlargement: false,
      kernel: sharp.kernel.lanczos3
    })
    .png()
    .toBuffer();
  await ensureDir(STORAGE_DIR);
  const outputFilename = `aigc_layered_relayout_${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${targetWidth}x${targetHeight}.jpg`;
  const outputPath = path.join(STORAGE_DIR, outputFilename);
  const backgroundBuffer = await buildRelayoutBackgroundBuffer(backgroundPath, targetWidth, targetHeight);
  await sharp(backgroundBuffer)
    .composite([{
      input: foregroundBuffer,
      left: Math.round(layout.x),
      top: Math.round(layout.y),
      blend: "over"
    }])
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toFile(outputPath);
  return `/static/${outputFilename}`;
}

function expandBoxForCleanup(box, width, height, paddingRatio = 0.018) {
  const safe = clampBoxToImage(box, width, height);
  if (!safe) return null;
  const padding = Math.max(width, height) * paddingRatio;
  return clampBoxToImage({
    x: safe.x - padding,
    y: safe.y - padding,
    width: safe.width + padding * 2,
    height: safe.height + padding * 2
  }, width, height);
}

async function createCleanupMaskFromBoxesForAdapt(boxes, width, height, paddingRatio = 0.018) {
  const validBoxes = (boxes || [])
    .map(box => expandBoxForCleanup(box, width, height, paddingRatio))
    .filter(Boolean);
  if (!validBoxes.length) return "";
  const svgRects = validBoxes.map(box => (
    `<rect x="${box.x.toFixed(2)}" y="${box.y.toFixed(2)}" width="${box.width.toFixed(2)}" height="${box.height.toFixed(2)}" rx="${Math.max(2, Math.min(box.width, box.height) * 0.08).toFixed(2)}" fill="white"/>`
  )).join("");
  const svg = Buffer.from(`<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="black"/>${svgRects}</svg>`);
  await ensureDir(STORAGE_DIR);
  const filename = `relayout_cleanup_mask_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.png`;
  const outputPath = path.join(STORAGE_DIR, filename);
  await sharp(svg).png().toFile(outputPath);
  return `/static/${filename}`;
}

function filterCleanupBoxesOutsideSubject(boxes = [], subjectBox = null, width = 0, height = 0, sourceWidth = width, sourceHeight = height) {
  const mappedSubject = subjectBox ? normalizeBox(subjectBox, sourceWidth, sourceHeight, width, height) : null;
  const subject = mappedSubject ? padBoxForAdapt(mappedSubject, width, height, 0.09) : null;
  return boxes.filter(box => {
    const safeBox = clampBoxToImage(box, width, height);
    if (!safeBox) return false;
    if (!subject) return true;
    return boxIntersectionCoverage(safeBox, subject) < 0.01;
  });
}

async function inpaintTextLogoBackgroundForRelayout(imageUrl, analysis, context, designAnalysis = null) {
  const sourceWidth = context.sourceWidth;
  const sourceHeight = context.sourceHeight;
  const boxes = [
    ...(analysis.logo?.boxes || []),
    ...(analysis.text?.boxes || []),
    ...((designAnalysis?.layers || [])
      .filter(layer => layer.type === "logo" || layer.type === "text")
      .map(layer => layer.box))
  ]
    .map(box => clampBoxToImage(denormalizeBox(box, sourceWidth, sourceHeight), sourceWidth, sourceHeight))
    .filter(Boolean);
  const cleanupBoxes = filterCleanupBoxesOutsideSubject(
    boxes,
    analysis.subject?.box,
    sourceWidth,
    sourceHeight,
    sourceWidth,
    sourceHeight
  );
  if (!cleanupBoxes.length) {
    console.log("[AdaptImage] relayout source cleanup skipped", JSON.stringify({ reason: "no safe text/logo boxes outside subject" }));
    return imageUrl;
  }
  const maskUrl = await createCleanupMaskFromBoxesForAdapt(cleanupBoxes, sourceWidth, sourceHeight, 0.012);
  if (!maskUrl) return imageUrl;
  console.log("[AdaptImage] relayout source cleanup start", JSON.stringify({
    imageUrl,
    maskUrl,
    boxCount: cleanupBoxes.length
  }));
  const cleanedUrl = await inpaintImageForAdapt(
    imageUrl,
    maskUrl,
    context,
    "remove only the original text and logo inside the mask; keep product, subject, packaging, shadows, edges and all unmasked pixels unchanged; fill removed area with nearby background texture only"
  );
  console.log("[AdaptImage] relayout source cleanup done", JSON.stringify({
    resultUrl: cleanedUrl || imageUrl,
    changed: Boolean(cleanedUrl)
  }));
  return cleanedUrl || imageUrl;
}

async function cleanupGeneratedTextLogoBackgroundForAdapt(backgroundUrl, targetWidth, targetHeight, context, analysis, maxPasses = 2) {
  const qaContext = { ...context, sourceWidth: targetWidth, sourceHeight: targetHeight };
  let workingUrl = backgroundUrl;
  const passes = [];
  for (let pass = 1; pass <= maxPasses; pass += 1) {
    const cleanupBoxes = [];
    const details = { pass, textBoxes: 0, logoBoxes: 0, cleaned: false };
    try {
      const bgText = await detectTextForAdapt(workingUrl, qaContext);
      const textBoxes = filterCleanupBoxesOutsideSubject(
        bgText.boxes || [],
        analysis.subject?.box,
        targetWidth,
        targetHeight,
        context.sourceWidth,
        context.sourceHeight
      );
      cleanupBoxes.push(...textBoxes);
      details.textBoxes = textBoxes.length;
      details.texts = (bgText.texts || []).filter(Boolean).slice(0, 3);
    } catch (err) {
      console.warn("[AdaptImage] background text cleanup detection skipped:", err.message);
    }
    try {
      const bgLogo = await detectLogoForAdapt(workingUrl, qaContext);
      const logoBoxes = filterCleanupBoxesOutsideSubject(
        bgLogo.boxes || [],
        analysis.subject?.box,
        targetWidth,
        targetHeight,
        context.sourceWidth,
        context.sourceHeight
      );
      cleanupBoxes.push(...logoBoxes);
      details.logoBoxes = logoBoxes.length;
    } catch (err) {
      console.warn("[AdaptImage] background logo cleanup detection skipped:", err.message);
    }
    if (!cleanupBoxes.length) {
      passes.push(details);
      return { url: workingUrl, passes, cleaned: passes.some(item => item.cleaned) };
    }
    const maskUrl = await createCleanupMaskFromBoxesForAdapt(cleanupBoxes, targetWidth, targetHeight, 0.012);
    if (!maskUrl) {
      passes.push(details);
      break;
    }
    const cleanedUrl = await inpaintImageForAdapt(
      workingUrl,
      maskUrl,
      context,
      "remove generated text, generated logo, fake letters and brand-like artifacts only; fill the removed area with seamless clean background matching nearby color, texture, light and perspective"
    );
    details.cleaned = Boolean(cleanedUrl);
    details.maskUrl = maskUrl;
    details.resultUrl = cleanedUrl || workingUrl;
    passes.push(details);
    if (!cleanedUrl) break;
    workingUrl = cleanedUrl;
  }
  return { url: workingUrl, passes, cleaned: passes.some(item => item.cleaned) };
}

async function executeLayeredRelayoutForAdapt(imageUrl, targetWidth, targetHeight, context, analysis, masks, prompt = "") {
  const layerBox = buildLayerSplitBoxForAdapt(analysis, context.sourceWidth, context.sourceHeight);
  const useFocalLeftRightLayout = isStandardFocalWindowTemplateForAdapt(context);
  let designAnalysis = { layers: [], warnings: ["poster design analysis not executed"] };
  try {
    designAnalysis = await analyzePosterDesignForAdapt(imageUrl, context);
  } catch (err) {
    designAnalysis = { layers: [], warnings: [err.message] };
    console.warn("[AdaptImage] design analysis fallback:", err.message);
  }
  let cleanBackgroundUrl = imageUrl;
  try {
    cleanBackgroundUrl = await inpaintTextLogoBackgroundForRelayout(imageUrl, analysis, context, designAnalysis);
  } catch (err) {
    console.warn("[AdaptImage] text/logo background cleanup skipped:", err.message);
    throw new Error(`text/logo background cleanup failed: ${err.message}`);
  }
  let backgroundUrl = cleanBackgroundUrl;
  let expandedBackgroundUrl = "";
  try {
    const backgroundPrompt = [
      useFocalLeftRightLayout
        ? "这是标准素材看板焦点视窗模板的左右排版背景延展：只延展原图已有背景和主体周围环境，不要设计新的左侧信息底，不要生成任何新文字、Logo、按钮、图标或品牌元素；原图文案和 Logo 会以原始图层方式放到左侧并水平居中。"
        : "",
      "这是用于后续合成的纯背景层，输入图中的文字和 Logo 已经被移除。",
      "输出结果必须保持为无文字、无 Logo、无品牌标识、无按钮、无图标、无包装文字、无伪字母、无乱码和无类似商标图案的背景层。",
      "围绕输入海报的主体物和原始背景进行目标尺寸延展，主体物保留在画面中，不要把主体物抠出后重新生成。",
      "延展区域必须沿着原背景的色彩、光影、材质、纹理、透视和空间关系自然连续。",
      "不允许新增、复制、重画、补全、改写、翻译或仿造任何文字、slogan、Logo、品牌标识、包装文字、促销信息或按钮文案。",
      "不要补出任何新的前景主体、商品、人物、装饰、图标、按钮、包装、标签、水印或额外视觉元素。",
      "原文案、原 slogan、原 Logo 会由后续图层排版合成，背景延展阶段如果需要填补空间，只能使用原图背景纹理，不能使用文字或图形元素填补。",
      "不能有拼接边界、分层边界、模糊框、重复纹理、涂抹痕迹、残影或明显 AI 生成物。"
    ].filter(Boolean).join(" ");
    expandedBackgroundUrl = await expandImageV4ForAdapt(backgroundUrl, targetWidth, targetHeight, context, backgroundPrompt);
    if (expandedBackgroundUrl) backgroundUrl = expandedBackgroundUrl;
    console.log("[AdaptImage] relayout background extended", JSON.stringify({
      source: cleanBackgroundUrl,
      result: backgroundUrl
    }));
    const cleanup = await cleanupGeneratedTextLogoBackgroundForAdapt(
      backgroundUrl,
      targetWidth,
      targetHeight,
      context,
      analysis,
      useFocalLeftRightLayout ? 6 : 2
    );
    backgroundUrl = cleanup.url || backgroundUrl;
    context.relayoutBackgroundCleanup = cleanup;
    console.log("[AdaptImage] relayout background cleanup", JSON.stringify({
      cleaned: cleanup.cleaned,
      result: backgroundUrl,
      passes: cleanup.passes
    }));
  } catch (err) {
    console.warn("[AdaptImage] relayout background extension failed:", err.message);
    throw new Error(`background extension failed: ${err.message}`);
  }
  const zones = buildRelayoutZonesForAdapt(analysis, designAnalysis, context.sourceWidth, context.sourceHeight);
  const sourceAspect = context.sourceWidth / Math.max(1, context.sourceHeight);
  const targetAspect = targetWidth / Math.max(1, targetHeight);
  const isPortraitToLandscape = sourceAspect < 0.78 && targetAspect > 1.12;
  const primarySubjectZone = zones.find(zone => zone.type === "subject");
  const selectedZones = [];
  const selectedCounts = {};
  const skippedZones = [];
  const layerErrors = [];
  for (const zone of zones) {
    if (zone.type === "subject") {
      skippedZones.push({ id: zone.id, type: zone.type, reason: "subject is preserved by background pipeline" });
      continue;
    }
    if (selectedZones.some(item => item.type === "info") && (zone.type === "logo" || zone.type === "text")) {
      skippedZones.push({ id: zone.id, type: zone.type, reason: "covered by selected info group" });
      continue;
    }
    if (
      isPortraitToLandscape &&
      primarySubjectZone &&
      zone.type !== "subject" &&
      boxIntersectionCoverage(zone.box, primarySubjectZone.box) > 0.42
    ) {
      console.log("[AdaptImage] skip overlapping zone for portrait-to-landscape", JSON.stringify({
        id: zone.id,
        type: zone.type,
        source: zone.source,
        overlapWithSubject: Number(boxIntersectionCoverage(zone.box, primarySubjectZone.box).toFixed(3))
      }));
      skippedZones.push({
        id: zone.id,
        type: zone.type,
        reason: "overlaps primary subject in portrait-to-landscape relayout",
        overlapWithSubject: Number(boxIntersectionCoverage(zone.box, primarySubjectZone.box).toFixed(3))
      });
      continue;
    }
    selectedCounts[zone.type] = selectedCounts[zone.type] || 0;
    const limit = useFocalLeftRightLayout
      ? zone.type === "info"
        ? 1
        : zone.type === "text"
          ? (selectedZones.some(item => item.type === "logo") ? 1 : 2)
          : 1
      : zone.type === "text"
        ? 2
        : zone.type === "info"
          ? 2
          : 1;
    if (selectedCounts[zone.type] >= limit) {
      skippedZones.push({ id: zone.id, type: zone.type, reason: `type limit reached: ${limit}` });
      continue;
    }
    selectedZones.push(zone);
    selectedCounts[zone.type] += 1;
  }
  const multiLayerItems = [];
  const typeIndexes = {};
  for (const zone of selectedZones) {
    try {
      const zoneLayerBox = buildZoneLayerSplitBoxForAdapt(zone, context.sourceWidth, context.sourceHeight) || zone.box;
      const zoneSplit = await splitPosterLayersForAdapt(imageUrl, zoneLayerBox, context);
      const trimmed = await trimForegroundLayerForAdapt(zoneSplit.foreground.url);
      const meta = trimmed.meta || await sharp(staticUrlToLocalPath(trimmed.url)).metadata();
      typeIndexes[zone.type] = typeIndexes[zone.type] || 0;
      const layout = planZonePlacementForAdapt(
        zone,
        meta,
        targetWidth,
        targetHeight,
        typeIndexes[zone.type],
        context.sourceWidth,
        context.sourceHeight,
        context
      );
      typeIndexes[zone.type] += 1;
      multiLayerItems.push({
        id: zone.id,
        type: zone.type,
        source: zone.source,
        text: zone.text || "",
        members: zone.members || [],
        url: trimmed.url,
        rawUrl: zoneSplit.foreground.url,
        box: zone.box,
        layout,
        width: meta.width || 0,
        height: meta.height || 0
      });
    } catch (err) {
      layerErrors.push({
        id: zone.id,
        type: zone.type,
        source: zone.source,
        message: err.message
      });
      console.warn("[AdaptImage] zone layer split skipped", JSON.stringify({
        id: zone.id,
        type: zone.type,
        message: err.message
      }));
    }
  }
  const diagnostics = buildRelayoutDiagnosticsForAdapt({
    zones,
    selectedZones,
    skippedZones,
    layerErrors,
    multiLayerItems,
    designAnalysis,
    width: context.sourceWidth,
    height: context.sourceHeight
  });
  const hasIndependentInfoLayer = multiLayerItems.some(item => item.type === "logo" || item.type === "text" || item.type === "info");
  if (multiLayerItems.length >= 1 && hasIndependentInfoLayer) {
    const resultUrl = await composeMultiLayerRelayoutForAdapt(backgroundUrl, multiLayerItems, targetWidth, targetHeight);
    return {
      resultUrl,
      layerBox,
      layout: { mode: "text-logo-zones-v1", itemCount: multiLayerItems.length },
      zones,
      diagnostics,
      designAnalysis: {
        layerCount: designAnalysis.layers?.length || 0,
        warnings: designAnalysis.warnings || []
      },
      layers: {
        mode: "text-logo-relayout-v1",
        foregroundUrl: "",
        rawForegroundUrl: "",
        backgroundUrl: cleanBackgroundUrl,
        expandedBackgroundUrl,
        backgroundMode: expandedBackgroundUrl ? "ai-extension" : "cover-resize",
        items: multiLayerItems.map(item => ({
          id: item.id,
          type: item.type,
          source: item.source,
          members: item.members,
          url: item.url,
          rawUrl: item.rawUrl,
          box: item.box,
          layout: item.layout,
          width: item.width,
          height: item.height
        }))
      }
    };
  }
  const error = new Error(`text/logo relayout produced no compositable layers, selectedZones=${selectedZones.length}, layerErrors=${layerErrors.length}`);
  error.diagnostics = diagnostics;
  throw error;
}

async function buildProtectedMaskFallback() {
  return {
    protectedMaskUrl: "",
    editableMaskUrl: "",
    sourceCount: 0,
    removableMaskUrl: "",
    removableEditableMaskUrl: "",
    removableSourceCount: 0
  };
}

async function cropImageToTargetForAdapt(imageUrl, targetWidth, targetHeight, options = {}) {
  const sourcePath = imageUrl.startsWith("/static/") ? staticUrlToLocalPath(imageUrl) : null;
  if (!sourcePath) return resizeStaticImageToTarget(imageUrl, targetWidth, targetHeight, options);
  await fs.access(sourcePath);
  await ensureDir(STORAGE_DIR);
  const outputFilename = `aigc_adapt_crop_${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${targetWidth}x${targetHeight}.jpg`;
  const outputPath = path.join(STORAGE_DIR, outputFilename);
  await sharp(sourcePath)
    .rotate()
    .flatten({ background: "#ffffff" })
    .resize({
      width: targetWidth,
      height: targetHeight,
      fit: "cover",
      position: "center",
      kernel: sharp.kernel.lanczos3
    })
    .jpeg({ quality: Number(options.quality) || 88, mozjpeg: true })
    .toFile(outputPath);
  return `/static/${outputFilename}`;
}

async function inpaintImageForAdapt(imageUrl, maskUrl, context, prompt = "") {
  if (!maskUrl) return "";
  const config = context.config;
  const publicImageUrl = publicAigcImageUrl(imageUrl, config, context.publicBaseUrl);
  const publicMaskUrl = publicAigcImageUrl(maskUrl, config, context.publicBaseUrl);
  const apiStyle = getAdaptApiStyle(config);
  const sourceMediaInfo = apiStyle === ADAPT_API_STYLES.openapi
    ? await mediaInfoForOpenapiAdaptImage(imageUrl, context)
    : null;
  const maskMediaInfo = apiStyle === ADAPT_API_STYLES.openapi
    ? await mediaInfoForOpenapiAdaptImage(maskUrl, context)
    : null;
  const payload = apiStyle === ADAPT_API_STYLES.aiPlatform
    ? {
        image_url: publicImageUrl,
        mask_url: publicMaskUrl,
        prompt: prompt || "clean natural background, seamless fill",
        negative_prompt: "distorted text, changed logo, artifacts",
        strength: 0.72,
        num_images: 1,
        quality: "high"
      }
    : {
        media_info_list: [
          sourceMediaInfo,
          maskMediaInfo
        ],
        parameter: {
          task: "inpaint",
          inpaint: true,
          rsp_media_type: "url",
          prompt_pos: prompt || "clean natural background, seamless fill",
          num_samples: 1,
          seed: -1
        }
      };
  const raw = await runAdaptProvider("inpaint", payload, context);
  return persistFirstProviderImage(raw, "adapt_inpaint");
}

async function expandImageV4ForAdapt(imageUrl, targetWidth, targetHeight, context, prompt = "") {
  const config = context.config;
  const ratio = normalizeOpenapiAspectRatio(targetWidth, targetHeight);
  const apiStyle = getAdaptApiStyle(config);
  const extensionSize = fitSizeWithinLimit(targetWidth, targetHeight, 2048, 64);
  const openapiImageUrl = apiStyle === ADAPT_API_STYLES.openapi
    ? await resolveOpenapiAdaptImageUrl(imageUrl, context)
    : "";
  const publicImageUrl = apiStyle === ADAPT_API_STYLES.openapi
    ? openapiImageUrl
    : publicAigcImageUrl(imageUrl, config, context.publicBaseUrl);
  const mediaInfo = apiStyle === ADAPT_API_STYLES.openapi
    ? /^https?:\/\//i.test(openapiImageUrl || "")
      ? mediaInfoFromUrl(openapiImageUrl)
      : await mediaInfoForOpenapiAdaptImage(imageUrl, context)
    : null;
  if (apiStyle === ADAPT_API_STYLES.openapi) {
    console.log("[EXPAND] input media", JSON.stringify({
      publicImageUrl,
      mediaDataType: mediaInfo?.media_profiles?.media_data_type || "",
      isHttpUrl: /^https?:\/\//i.test(mediaInfo?.media_data || "")
    }));
  }
  const payload = apiStyle === ADAPT_API_STYLES.aiPlatform
    ? {
        image_url: publicImageUrl,
        mode: 1,
        ratio,
        position: "center",
        quality: "high"
      }
    : {
        media_info_list: [mediaInfo],
        parameter: {
          base_model_name: "default",
          enable_check_inout_size: false,
          enable_debug_info: true,
          enable_quantization: true,
          enable_teacache_mode: false,
          extra_pipe_inputs: {
            disable_classifier_guidance: true,
            enable_text_render: false,
            enable_vae_tiling: true
          },
          guidance_scale: 1,
          height: extensionSize.height,
          input_image_index: "all",
          negative_prompt: [
            "新增文字", "重复文字", "错误文字", "伪文字", "乱码文字", "新增 slogan",
            "复制文字", "补全文字", "重画文字", "改写文字", "文字残影",
            "新增 logo", "复制 logo", "重画 logo", "新增品牌标识", "新增商品", "新增主体物", "新增人物",
            "额外装饰", "图标", "按钮", "包装", "标签", "贴纸", "水印",
            "重复主体", "多余元素", "AI 生成物", "视觉噪点", "拼接边界",
            "分层边界", "重复纹理", "涂抹痕迹", "残影", "变形主体", "扭曲边缘"
          ].join("，"),
          num_inference_steps: 16,
          prompt: prompt || "保持画面内容不变，进行延展。不要出现原图之外多余元素，不要出现原图之外多余文字，不要出现重复文字。",
          remove_prompt_line_breaks: true,
          resize_mode: -1,
          rsp_media_type: "url",
          sample_num: 1,
          sampler_name: "default",
          seed: -1,
          tea_rel_l1_thresh: 0.3,
          use_input_image_size: false,
          width: extensionSize.width
        }
      };
  const raw = await runAdaptProvider("expand", payload, context);
  let resultUrl = await persistFirstProviderImage(raw, "adapt_expand");
  if (!resultUrl && getAdaptApiStyle(config) === ADAPT_API_STYLES.openapi) {
    try {
      const fallback = await submitAigcExpandTask({
        imageUrl: publicImageUrl,
        targetRatio: ratio,
        prompt,
        seed: -1,
        publicBaseUrl: context.publicBaseUrl,
        mediaOptions: { preferPublicImageUrl: true }
      });
      resultUrl = fallback.resultUrl || "";
    } catch (err) {
      if (!isAigcTimeoutError(err)) throw err;
      context.fallbackWarnings = context.fallbackWarnings || [];
      context.fallbackWarnings.push(`expand fallback timed out and used local resize/crop: ${err.message}`);
      console.warn("[AdaptImage] expand fallback timeout, continue with local resize/crop:", err.message);
    }
  }
  return resultUrl;
}

async function suggestCroppingForAdapt(imageUrl, targetWidth, targetHeight, context) {
  const config = context.config;
  const publicImageUrl = publicAigcImageUrl(imageUrl, config, context.publicBaseUrl);
  const apiStyle = getAdaptApiStyle(config);
  if (apiStyle === ADAPT_API_STYLES.openapi) {
    const smartCrop = await submitAigcSmartCropTask({
      imageUrl: publicImageUrl,
      targetWidth,
      targetHeight,
      publicBaseUrl: context.publicBaseUrl,
      mediaOptions: { preferPublicImageUrl: true }
    });
    return {
      resultUrl: smartCrop.resultUrl || "",
      raw: smartCrop.raw || smartCrop
    };
  }

  const ratio = targetRatioLabel(targetWidth, targetHeight);
  const mediaInfo = apiStyle === ADAPT_API_STYLES.openapi
    ? await mediaInfoForOpenapiAdaptImage(imageUrl, context)
    : null;
  const payload = apiStyle === ADAPT_API_STYLES.aiPlatform
    ? {
        image_url: publicImageUrl,
        mode: 1,
        ratio,
        min_scale: 0.5,
        keep_subject: true
      }
    : {
        media_info_list: [mediaInfo],
        parameter: {
          rsp_media_type: "url",
          mode: 1,
          ratio,
          keep_subject: true
        }
      };
  const raw = await runAdaptProvider("crop", payload, context);
  return {
    resultUrl: await persistFirstProviderImage(raw, "adapt_crop"),
    raw
  };
}

async function executeAdaptPlan(imageUrl, targetWidth, targetHeight, plan, context, prompt, analysis, masks) {
  console.log("[AdaptImage] plan", JSON.stringify({
    strategy: plan.strategy,
    steps: plan.steps,
    reasons: plan.reasons,
    targetWidth,
    targetHeight
  }));
  if (plan.strategy === "direct") {
    console.log("[AdaptImage] execute direct");
    return ensureFinalAdaptSize(imageUrl, targetWidth, targetHeight, context, analysis);
  }
  if (plan.strategy === "crop") {
    console.log("[AdaptImage] execute crop");
    const croppedUrl = await cropWithFallbackForAdapt(imageUrl, targetWidth, targetHeight, context, analysis);
    return ensureFinalAdaptSize(croppedUrl, targetWidth, targetHeight, context, analysis);
  }

  const legacyEnhancedPromptParts = [
    "最高优先级：完整保留原图主体、产品、人物、文案、按钮、Logo 和品牌识别，不裁切、不遮挡、不拉伸、不变形、不改字、不重绘 Logo。",
    "只扩展或修补背景环境，补全区域需要与原图光影、材质、色彩、透视一致。",
    plan.strategy === "relayout"
      ? "目标比例跨度很大，请优先保持所有关键元素完整并处于安全区，允许背景大范围延展，但不要改变文字和 Logo。"
      : "根据目标比例补全背景并优化构图，让核心内容全部出现在安全区域内。",
    prompt || ""
  ].filter(Boolean).join("");
  const enhancedPrompt = [
    AIGC_CONSERVATIVE_ADAPT_EXPAND_PROMPT,
    plan.layoutIntent === "center_expand_safe_info_only"
      ? `Same-orientation standard splash adaptation: the original text/logo already satisfy the ${STANDARD_SPLASH_INFO_SAFE_MARGIN_PX}px target safe margin. Keep the entire original poster centered and unchanged. Only extend the surrounding background naturally to the target canvas. Do not split, move, rewrite, redraw, translate, duplicate, or regenerate any text, logo, product, subject, button, or brand mark.`
      : "",
    plan.layoutIntent === "center_expand_only"
      ? "Same-orientation adaptation: keep the entire original poster as the core centered composition. Do not split, move, rewrite, redraw, translate, or regenerate any text, logo, product, subject, button, or brand mark. Only extend the canvas outward around the original image with seamless background continuation."
      : "",
    plan.strategy === "relayout"
      ? "For large ratio changes, preserve the original logo and all readable text exactly. Keep every brand mark, slogan, button copy, and title visible and uncropped. Extend the background and improve composition without deleting or rewriting text."
      : "For moderate ratio changes, keep the original logo and text intact and only fill missing background area. Do not redesign the poster.",
    prompt || ""
  ].filter(Boolean).join(" ");
  let workingUrl = imageUrl;

  if (plan.orientationChange === "same-direction" && plan.infoSafeArea?.applies && !plan.infoSafeArea.passed) {
    try {
      const adjusted = await buildSplashSafeAreaCanvasForAdapt(workingUrl, targetWidth, targetHeight, context, analysis);
      if (adjusted?.url) {
        context.splashSafeAreaAdjustment = {
          applied: true,
          marginPx: STANDARD_SPLASH_INFO_SAFE_MARGIN_PX,
          ...adjusted
        };
        plan.layoutIntent = "same_direction_safe_area_adjusted";
        plan.steps = ["detect", "text_logo_safe_area_adjust", "compose_target_canvas", "final_safe_area_qa"];
        plan.reasons = [
          ...(plan.reasons || []),
          `已通过整体缩放/位移将开屏文案/Logo 放入 ${STANDARD_SPLASH_INFO_SAFE_MARGIN_PX}px 安全边距`
        ];
        console.log("[AdaptImage] splash safe-area canvas done", JSON.stringify({
          resultUrl: adjusted.url,
          transform: adjusted.transform,
          infoSafeArea: adjusted.infoSafeArea
        }));
        return ensureFinalAdaptSize(adjusted.url, targetWidth, targetHeight, context, analysis);
      }
      console.warn("[AdaptImage] splash safe-area canvas skipped: no adjusted URL");
    } catch (err) {
      console.warn("[AdaptImage] splash safe-area canvas failed:", err.message);
      context.splashSafeAreaAdjustment = {
        applied: false,
        failed: true,
        error: err.message,
        marginPx: STANDARD_SPLASH_INFO_SAFE_MARGIN_PX
      };
    }
  }

  const isFocalLeftRightRelayout = isStandardFocalWindowTemplateForAdapt(context);
  const layeredRelayoutEnabled = context.config?.layeredRelayoutMode === "layered" || isFocalLeftRightRelayout;
  if (plan.strategy === "relayout" && layeredRelayoutEnabled) {
    try {
      const layered = await executeLayeredRelayoutForAdapt(imageUrl, targetWidth, targetHeight, context, analysis, masks, enhancedPrompt);
      context.layeredRelayout = layered;
      console.log("[AdaptImage] layered relayout done", JSON.stringify({
        resultUrl: layered.resultUrl,
        layerBox: layered.layerBox,
        layout: layered.layout
      }));
      return ensureFinalAdaptSize(layered.resultUrl, targetWidth, targetHeight);
    } catch (err) {
      context.layeredRelayout = {
        failed: true,
        error: err.message,
        status: isProviderPermissionException(err) ? "permission_denied" : "failed",
        endpoint: err.endpoint,
        stage: err.stage,
        diagnostics: err.diagnostics
      };
      console.warn("[AdaptImage] layered relayout failed:", err.message);
      const strictError = new Error(`真正智能排版失败，已停止生成：${err.message}`);
      strictError.stage = "layered-relayout";
      strictError.endpoint = err.endpoint;
      throw strictError;
    }
  } else if (plan.strategy === "relayout") {
    context.layeredRelayout = {
      failed: false,
      status: "preserve_expand_crop",
      layout: { mode: "preserve-logo-text-expand-crop" },
      layers: { mode: "preserve-original-logo-text" },
      diagnostics: {
        reason: "layered text/logo relocation disabled by default to prevent missing logo/copy",
        enableWith: "AIGC_LAYERED_RELAYOUT_MODE=layered"
      }
    };
  }

  context.backgroundPrep = {
    skipped: true,
    reason: "preserve original logo and copy; do not inpaint text/logo before extension"
  };
  console.log("[AdaptImage] Step3 inpaint skipped", JSON.stringify(context.backgroundPrep));

  const expandedUrl = await expandImageV4ForAdapt(workingUrl, targetWidth, targetHeight, context, enhancedPrompt);
  console.log("[AdaptImage] Step4 expand done", JSON.stringify({ before: workingUrl, after: expandedUrl || workingUrl }));
  workingUrl = expandedUrl || workingUrl;

  workingUrl = await cropWithFallbackForAdapt(workingUrl, targetWidth, targetHeight, context, analysis);
  console.log("[AdaptImage] Step5 crop done", JSON.stringify({ resultUrl: workingUrl }));
  return ensureFinalAdaptSize(workingUrl, targetWidth, targetHeight, context, analysis);
}

let runAdaptQa = async function runAdaptQa(resultUrl, analysis, plan, targetWidth, targetHeight, sourceWidth, sourceHeight, context, originalImageUrl, masks) {
  const warnings = [];
  const deterministicSplashSafeAreaAdjustment = Boolean(context.splashSafeAreaAdjustment?.applied);
  let actualWidth = null;
  let actualHeight = null;
  try {
    if (resultUrl?.startsWith("/static/")) {
      const meta = await sharp(staticUrlToLocalPath(resultUrl)).metadata();
      actualWidth = meta.width || null;
      actualHeight = meta.height || null;
    }
  } catch (err) {
    warnings.push(`无法读取结果尺寸：${err.message}`);
  }
  const dimensionPassed = actualWidth === targetWidth && actualHeight === targetHeight;
  if (!dimensionPassed) warnings.push(`结果尺寸 ${actualWidth || "?"}x${actualHeight || "?"} 与目标 ${targetWidth}x${targetHeight} 不一致`);

  const protectedBoxes = [
    analysis.subject?.box,
    ...(analysis.logo?.boxes || []),
    ...(analysis.text?.boxes || [])
  ].filter(Boolean);
  const normalizedBoxes = protectedBoxes
    .map(box => normalizeBox(box, sourceWidth, sourceHeight, targetWidth, targetHeight))
    .filter(Boolean);
  const splashInfoSafeArea = evaluateSplashInfoSafeAreaForAdapt(
    analysis,
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    context
  );
  const safeAreaPassed = splashInfoSafeArea?.applies
    ? splashInfoSafeArea.passed
    : normalizedBoxes.every(box => isBoxInsideSafeArea(box, targetWidth, targetHeight, 0.08));
  if (!safeAreaPassed) {
    warnings.push(splashInfoSafeArea?.applies
      ? `开屏文案/Logo 未满足 ${splashInfoSafeArea.marginPx}px 安全边距`
      : "部分受保护区域按比例映射后接近或超出安全区，MVP 无法保证模型输出中完全安全");
  }
  if (analysis.warnings?.length) warnings.push(...analysis.warnings);
  if (plan.strategy === "relayout") warnings.push("智能重排当前为降级实现，尚未执行主体/文字/Logo 分层重新排版");

  let textRecallScore = 1;
  if ((analysis.text?.texts || []).length > 0) {
    try {
      const afterText = await detectTextForAdapt(resultUrl, { ...context, sourceWidth: targetWidth, sourceHeight: targetHeight });
      textRecallScore = textRecall(analysis.text.texts, afterText.texts || []);
      if (textRecallScore < 0.8) warnings.push(`OCR 文案字符召回率 ${(textRecallScore * 100).toFixed(1)}%，低于 80%`);
    } catch (err) {
      textRecallScore = 0;
      warnings.push(`结果 OCR 复检不可用：${err.message}`);
    }
  }

  let logoSimilarity = null;
  if (analysis.logo?.maskUrl && masks?.protectedMaskUrl && !deterministicSplashSafeAreaAdjustment) {
    try {
      const originalStaticUrl = await ensureStaticImageUrlForResize(originalImageUrl);
      const resizedOriginal = originalStaticUrl?.startsWith("/static/")
        ? await resizeStaticImageToTarget(originalStaticUrl, targetWidth, targetHeight, { quality: 92 })
        : "";
      const beforeHash = await maskedAverageHash(resizedOriginal, analysis.logo.maskUrl);
      const afterHash = await maskedAverageHash(resultUrl, analysis.logo.maskUrl);
      logoSimilarity = hashSimilarity(beforeHash, afterHash);
      if (logoSimilarity !== null && logoSimilarity < 0.72) warnings.push(`Logo 感知哈希相似度 ${(logoSimilarity * 100).toFixed(1)}%，低于 72%`);
    } catch (err) {
      warnings.push(`Logo 相似度复检不可用：${err.message}`);
    }
  }

  return {
    passed: dimensionPassed && safeAreaPassed && warnings.length === 0,
    dimensionPassed,
    subjectPreserved: Boolean(analysis.subject?.exists ?? true),
    textPreserved: textRecallScore >= 0.8,
    logoPreserved: logoSimilarity === null ? Boolean(analysis.logo?.hasTarget ?? true) : logoSimilarity >= 0.72,
    safeAreaPassed,
    textRecall: textRecallScore,
    logoSimilarity,
    warnings
  };
};

runAdaptQa = async function runAdaptQaV2(resultUrl, analysis, plan, targetWidth, targetHeight, sourceWidth, sourceHeight, context, originalImageUrl, masks) {
  const warnings = [];
  const deterministicSplashSafeAreaAdjustment = Boolean(context.splashSafeAreaAdjustment?.applied);
  let actualWidth = null;
  let actualHeight = null;
  try {
    if (resultUrl?.startsWith("/static/")) {
      const meta = await sharp(staticUrlToLocalPath(resultUrl)).metadata();
      actualWidth = meta.width || null;
      actualHeight = meta.height || null;
    }
  } catch (err) {
    warnings.push(`result size check unavailable: ${err.message}`);
  }

  const dimensionPassed = actualWidth === targetWidth && actualHeight === targetHeight;
  if (!dimensionPassed) {
    warnings.push(`result size ${actualWidth || "?"}x${actualHeight || "?"} does not match ${targetWidth}x${targetHeight}`);
  }

  const protectedBoxes = [
    analysis.subject?.box,
    ...(analysis.logo?.boxes || []),
    ...(analysis.text?.boxes || [])
  ].filter(Boolean);
  const normalizedBoxes = protectedBoxes
    .map(box => normalizeBox(box, sourceWidth, sourceHeight, targetWidth, targetHeight))
    .filter(Boolean);
  const splashInfoSafeArea = evaluateSplashInfoSafeAreaForAdapt(
    analysis,
    sourceWidth,
    sourceHeight,
    targetWidth,
    targetHeight,
    context
  );
  const safeAreaPassed = splashInfoSafeArea?.applies
    ? splashInfoSafeArea.passed
    : normalizedBoxes.every(box => isBoxInsideSafeArea(box, targetWidth, targetHeight, 0.08));
  if (!safeAreaPassed) {
    warnings.push(splashInfoSafeArea?.applies
      ? `standard splash text/logo safe margin ${splashInfoSafeArea.marginPx}px failed`
      : "some protected regions are too close to the output safe-area edge");
  }
  if (analysis.warnings?.length) warnings.push(...analysis.warnings);
  if (plan.strategy === "relayout" && context.layeredRelayout?.failed) {
    warnings.push(`layered relayout failed: ${context.layeredRelayout.error}`);
  } else if (plan.strategy === "relayout" && !context.layeredRelayout) {
    warnings.push("true layered relayout was not executed");
  }

  let subjectIou = null;
  if (analysis.subject?.maskUrl && !deterministicSplashSafeAreaAdjustment) {
    try {
      const afterSubject = await detectSaliencyForAdapt(resultUrl, { ...context, sourceWidth: targetWidth, sourceHeight: targetHeight });
      subjectIou = await maskIouFromUrls(analysis.subject.maskUrl, afterSubject.maskUrl, targetWidth, targetHeight);
      if (subjectIou !== null && subjectIou < 0.7) warnings.push(`subject mask IoU ${(subjectIou * 100).toFixed(1)}% below 70%`);
    } catch (err) {
      warnings.push(`subject QA unavailable: ${err.message}`);
    }
  }

  let textRecallScore = 1;
  if ((analysis.text?.texts || []).length > 0) {
    try {
      const afterText = await detectTextForAdapt(resultUrl, { ...context, sourceWidth: targetWidth, sourceHeight: targetHeight });
      textRecallScore = textRecall(analysis.text.texts, afterText.texts || []);
      if (textRecallScore < 0.8) warnings.push(`OCR text recall ${(textRecallScore * 100).toFixed(1)}% below 80%`);
    } catch (err) {
      textRecallScore = 0;
      warnings.push(`result OCR check unavailable: ${err.message}`);
    }
  }

  let logoSimilarity = null;
  if (analysis.logo?.maskUrl && !deterministicSplashSafeAreaAdjustment) {
    try {
      const originalStaticUrl = await ensureStaticImageUrlForResize(originalImageUrl);
      const resizedOriginal = originalStaticUrl?.startsWith("/static/")
        ? await resizeStaticImageToTarget(originalStaticUrl, targetWidth, targetHeight, { quality: 92 })
        : "";
      const beforeHash = await maskedAverageHash(resizedOriginal, analysis.logo.maskUrl);
      const afterHash = await maskedAverageHash(resultUrl, analysis.logo.maskUrl);
      logoSimilarity = hashSimilarity(beforeHash, afterHash);
      if (logoSimilarity !== null && logoSimilarity < 0.72) warnings.push(`logo hash similarity ${(logoSimilarity * 100).toFixed(1)}% below 72%`);
    } catch (err) {
      warnings.push(`logo similarity check unavailable: ${err.message}`);
    }
  }

  const subjectPreserved = subjectIou === null ? Boolean(analysis.subject?.exists ?? true) : subjectIou >= 0.7;
  const textPreserved = textRecallScore >= 0.8;
  const logoPreserved = logoSimilarity === null ? Boolean(analysis.logo?.hasTarget ?? true) : logoSimilarity >= 0.72;

  return {
    passed: dimensionPassed && safeAreaPassed && subjectPreserved && textPreserved && logoPreserved,
    dimensionPassed,
    subjectPreserved,
    subjectIou,
    textPreserved,
    logoPreserved,
    safeAreaPassed,
    splashInfoSafeArea,
    textRecall: textRecallScore,
    logoSimilarity,
    warnings
  };
};

async function submitAigcTextToImageTask({
  prompt,
  ratio = "16:9",
  seed = -1,
  baseModelName = "miracle_vision_edit",
  persistOptions
}) {
  return submitAigcTask({
    task: AIGC_TASKS.dispatcher,
    params: {
      media_info_list: [],
      parameter: {
        base_model_name: baseModelName,
        prompt,
        rsp_media_type: "url",
        seed: Number.isFinite(Number(seed)) ? Number(seed) : -1,
        extra_pipe_inputs: { output_image_ratio: ratio }
      }
    },
    persistOptions
  });
}

function validateRemoteOrStaticUrl(value, fieldName) {
  if (!value || typeof value !== "string") return `${fieldName} 缺失`;
  if (!/^https?:\/\//i.test(value) && !value.startsWith("/static/")) {
    return `${fieldName} 必须是 http(s) URL 或本站 /static/ 路径`;
  }
  return "";
}

app.post("/api/aigc/image-expand", async (req, res) => {
  try {
    const { imageUrl, targetWidth, targetHeight, expandPixels, prompt, seed, targetRatio } = req.body || {};
    if (!imageUrl || typeof imageUrl !== "string") {
      return res.status(400).json({ error: "缺少 imageUrl" });
    }
    if (!/^https?:\/\//i.test(imageUrl) && !imageUrl.startsWith("/static/")) {
      return res.status(400).json({ error: "imageUrl 必须是 http(s) URL 或本站 /static/ 路径" });
    }

    const freeExpandPixel = await resolveExpandPixels({ imageUrl, targetWidth, targetHeight, expandPixels });
    const result = await submitAigcExpandTask({
      imageUrl,
      targetRatio: targetRatio || (targetWidth && targetHeight ? `${targetWidth}:${targetHeight}` : "16:9"),
      prompt,
      seed,
      publicBaseUrl: getRequestPublicBaseUrl(req),
      mediaOptions: { preferPublicImageUrl: true }
    });

    res.json({
      ok: true,
      provider: "meitu-open-platform",
      task: AIGC_TASKS.dispatcher,
      freeExpandPixel,
      ...result
    });
  } catch (err) {
    console.error("[AIGC Image Expand] failed:", err.message);
    res.status(500).json({ error: "AI 扩图失败", details: err.message });
  }
});

app.post("/api/aigc/text-to-image", async (req, res) => {
  try {
    const { prompt, ratio = "16:9", seed = -1, baseModelName = "miracle_vision_edit", transparentWhite = false } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "缺少 prompt" });
    }
    const result = await submitAigcTextToImageTask({
      prompt,
      ratio,
      seed,
      baseModelName,
      persistOptions: transparentWhite
        ? { transparentWhite: true, resize: { width: 450, height: 450, fit: "contain" } }
        : undefined
    });
    res.json({ ok: true, provider: "meitu-open-platform", task: AIGC_TASKS.dispatcher, ...result });
  } catch (err) {
    console.error("[AIGC Text To Image] failed:", err.message);
    res.status(500).json({ error: "AI 文生图失败", details: err.message });
  }
});

app.post("/api/aigc/image-outpaint", async (req, res) => {
  try {
    const { imageUrl, prompt = AIGC_DEFAULT_PROMPT, targetRatio = "16:9", baseModelName = "miracle_vision_edit" } = req.body || {};
    const validationError = validateRemoteOrStaticUrl(imageUrl, "imageUrl");
    if (validationError) return res.status(400).json({ error: validationError });
    const result = await submitAigcTask({
      task: AIGC_TASKS.dispatcher,
      params: {
        parameter: {
          base_model_name: baseModelName,
          prompt,
          rsp_media_type: "url",
          extra_pipe_inputs: {
            task_type: "outpainting",
            target_ratio: targetRatio
          }
        }
      },
      mediaInfoList: [mediaInfoFromUrl(imageUrl)],
      publicBaseUrl: getRequestPublicBaseUrl(req),
      mediaOptions: { preferPublicImageUrl: true }
    });
    res.json({ ok: true, provider: "meitu-open-platform", task: AIGC_TASKS.dispatcher, ...result });
  } catch (err) {
    console.error("[AIGC Image Outpaint] failed:", err.message);
    res.status(500).json({ error: "AI 图像扩图失败", details: err.message });
  }
});

app.post("/api/aigc/image-to-image", async (req, res) => {
  try {
    const { imageUrl, prompt, ratio = "1:1", seed = -1, baseModelName = "miracle_vision_edit", transparentWhite = false } = req.body || {};
    const validationError = validateRemoteOrStaticUrl(imageUrl, "imageUrl");
    if (validationError) return res.status(400).json({ error: validationError });
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "缺少 prompt" });
    }
    const result = await submitAigcTask({
      task: AIGC_TASKS.dispatcher,
      params: {
        parameter: {
          base_model_name: baseModelName,
          prompt,
          rsp_media_type: "url",
          seed: Number.isFinite(Number(seed)) ? Number(seed) : -1,
          extra_pipe_inputs: { output_image_ratio: ratio }
        }
      },
      mediaInfoList: [mediaInfoFromUrl(imageUrl)],
      publicBaseUrl: getRequestPublicBaseUrl(req),
      mediaOptions: { preferPublicImageUrl: true },
      persistOptions: transparentWhite
        ? { transparentWhite: true, resize: { width: 450, height: 450, fit: "contain" } }
        : undefined
    });
    res.json({ ok: true, provider: "meitu-open-platform", task: AIGC_TASKS.dispatcher, ...result });
  } catch (err) {
    console.error("[AIGC Image To Image] failed:", err.message);
    res.status(500).json({ error: "AI 图生图失败", details: err.message });
  }
});

app.post("/api/aigc/image-cutout", async (req, res) => {
  try {
    const { imageUrl, width, height, fit = "contain", mode = "subject-mask" } = req.body || {};
    const validationError = validateRemoteOrStaticUrl(imageUrl, "imageUrl");
    if (validationError) return res.status(400).json({ error: validationError });

    let inputBuffer;
    if (imageUrl.startsWith("/static/")) {
      const sourcePath = staticUrlToLocalPath(imageUrl);
      await fs.access(sourcePath);
      inputBuffer = await fs.readFile(sourcePath);
    } else {
      const response = await axios.get(imageUrl, {
        responseType: "arraybuffer",
        timeout: 120000,
        maxContentLength: 80 * 1024 * 1024,
        maxBodyLength: 80 * 1024 * 1024
      });
      inputBuffer = Buffer.from(response.data);
    }

    const targetWidth = toPositiveInt(width);
    const targetHeight = toPositiveInt(height);
    const resize = targetWidth && targetHeight
      ? { width: targetWidth, height: targetHeight, fit }
      : null;
    let outputBuffer;
    let method = "local-white-key";
    let subject = null;
    if (mode !== "white-key" && targetWidth && targetHeight) {
      try {
        const config = getAigcConfig();
        const publicBaseUrl = getRequestPublicBaseUrl(req);
        const meta = await sharp(inputBuffer).metadata();
        subject = await detectSaliencyForAdapt(imageUrl, {
          config,
          publicBaseUrl,
          sourceWidth: meta.width || targetWidth,
          sourceHeight: meta.height || targetHeight
        });
        if (subject?.maskUrl) {
          outputBuffer = await imageBufferWithSubjectMaskCutout(
            inputBuffer,
            staticUrlToLocalPath(subject.maskUrl),
            targetWidth,
            targetHeight,
            subject.box
          );
          method = "sod-subject-mask";
        }
      } catch (cutoutErr) {
        console.warn("[AIGC Image Cutout] subject-mask fallback:", cutoutErr.message);
      }
    }
    if (!outputBuffer) {
      outputBuffer = await imageBufferWithTransparentWhiteBackground(inputBuffer, resize);
    }
    const metadata = await sharp(outputBuffer).metadata();
    const outputFilename = `image_subject_cutout_${Date.now()}_${crypto.randomBytes(4).toString("hex")}.png`;
    const outputPath = path.join(STORAGE_DIR, outputFilename);
    await fs.writeFile(outputPath, outputBuffer);

    res.json({
      ok: true,
      provider: "local-transparent-cutout",
      method,
      resultUrl: `/static/${outputFilename}`,
      url: `/static/${outputFilename}`,
      mediaType: "image",
      width: metadata.width,
      height: metadata.height,
      subject: subject ? {
        exists: subject.exists,
        box: subject.box,
        maskUrl: subject.maskUrl
      } : null
    });
  } catch (err) {
    console.error("[AIGC Image Cutout] failed:", err.message);
    res.status(500).json({ error: "图片抠图失败", details: err.message });
  }
});

function buildImageEditAgentRelayoutInstruction({
  targetWidth,
  targetHeight,
  templateName,
  appName,
  sourceWidth,
  sourceHeight,
  userInstruction
}) {
  const sourceAspect = Number(sourceWidth || 0) / Math.max(1, Number(sourceHeight || 1));
  const targetAspect = Number(targetWidth || 0) / Math.max(1, Number(targetHeight || 1));
  const directionRule = sourceAspect < 0.78 && targetAspect > 1.12
    ? "目标是横构图，请采用左右排版：文案和 Logo 放在左侧安全区域，主体物/产品/人物放在右侧，主体可以贴近右侧画面边缘，但不要被裁切。"
    : sourceAspect > 1.12 && targetAspect < 0.78
      ? "目标是竖构图，请采用上下排版：文案和 Logo 放在上方安全区域，主体物/产品/人物放在下方，主体可以贴近下方画面边缘，但不要被裁切。"
      : "请在目标画幅内保持原图主要构图关系，必要时只做轻微位置调整，让主体和信息层级更清晰。";
  const compactUserInstruction = compactImageEditAgentUserInstruction(userInstruction);
  return [
    `请将这张广告图智能改为目标广告尺寸构图：${targetWidth} x ${targetHeight}。`,
    templateName ? `广告模板：${[appName, templateName].filter(Boolean).join(" ")}` : "",
    "最高优先级：必须完整保留原图中的主体物、产品、人物、文案、slogan、Logo 和品牌标识。",
    "禁止改写、翻译、补全、复制、重绘、扭曲或替换任何文字、Logo、品牌标识和包装文字。",
    "禁止新增任何文字、Logo、商品、人物、装饰元素、贴纸、标签、水印、按钮、图标或无关物体。",
    directionRule,
    "只允许对背景做自然延展和必要修复，背景必须延续原图的光影、材质、颜色、纹理、景深和透视关系。",
    "背景不能出现拼接边界、分层边界、涂抹感、重复纹理、残影、模糊框或明显 AI 生成痕迹。",
    "最终画面需要美观、平衡、主体突出，像一张完整的商业广告设计稿。",
    compactUserInstruction ? `补充要求：${compactUserInstruction}` : ""
  ].filter(Boolean).join("\n");
}

function compactImageEditAgentUserInstruction(userInstruction) {
  const text = String(userInstruction || "").trim();
  if (!text) return "";
  const duplicateMarkers = [
    "Highest priority:",
    "preserve the uploaded poster",
    "Do not create or add",
    "Do not generate fake text",
    "Template:",
    "Target size:"
  ];
  const duplicateScore = duplicateMarkers.filter(marker => text.includes(marker)).length;
  if (text.length > 800 && duplicateScore >= 3) return "";
  if (text.length > 800) return text.slice(0, 800);
  return text;
}

async function submitImageEditAgentRelayoutTask({
  imageUrl,
  targetWidth,
  targetHeight,
  templateName,
  appName,
  userInstruction,
  sourceWidth,
  sourceHeight,
  publicBaseUrl
}) {
  const config = getAigcConfig();
  if (!config.publicBaseUrl && publicBaseUrl) {
    config.publicBaseUrl = publicBaseUrl.replace(/\/+$/, "");
  }
  if (!config.ak || !config.sk) {
    throw new Error("后端缺少 AIGC_AK / AIGC_SK 环境变量");
  }
  const normalizedMediaInfoList = await normalizeMediaInfoListForAigc(
    [mediaInfoFromUrl(imageUrl)],
    config,
    {
      preferPublicImageUrl: true,
      standardizePublicImageUrl: true,
      standardizedMaxSide: toPositiveInt(process.env.AIGC_AGENT_INPUT_MAX_SIDE) || 1600
    }
  );
  const initImages = initImagesFromMediaInfoList(normalizedMediaInfoList);
  if (!initImages.length) {
    throw new Error("改图 Agent 需要可访问的图片 URL，请配置 AIGC_PUBLIC_BASE_URL 或 OBSERVER_* 上传中转");
  }
  const instruction = buildImageEditAgentRelayoutInstruction({
    targetWidth,
    targetHeight,
    templateName,
    appName,
    sourceWidth,
    sourceHeight,
    userInstruction
  });
  const agentMode = String(process.env.AIGC_IMAGE_EDIT_AGENT_MODE || "direct").toLowerCase();
  if (agentMode !== "workflow") {
    const directResult = await submitAigcTask({
      task: "/v1/image_edit_agent_async",
      taskType: "mtlab",
      params: {
        parameter: {
          rsp_media_type: "url",
          model_type: "auto",
          prompt: instruction
        },
        request_id: ""
      },
      mediaInfoList: normalizedMediaInfoList,
      rspMediaType: "url",
      initialDelayMs: 2500,
      pollIntervalMs: Math.max(1000, Number(process.env.AIGC_AGENT_POLL_INTERVAL_MS || config.pollIntervalMs || 2000)),
      maxPolls: Math.max(1, Number(process.env.AIGC_AGENT_MAX_POLLS || 900)),
      publicBaseUrl,
      mediaOptions: { preferPublicImageUrl: true }
    });
    return {
      ...directResult,
      instruction,
      inputImageUrl: initImages[0].url,
      agentMode: "direct"
    };
  }
  const agentParams = {
    executor: "auto",
    user_instruction: instruction
  };
  const payload = {
    task: "image_edit_agent_all",
    task_type: "cozeflow",
    biz: config.biz,
    init_images: initImages,
    media_info_list: normalizedMediaInfoList,
    params: JSON.stringify(agentParams),
    parameter: agentParams,
    sync_timeout: -1,
    rsp_media_type: "url"
  };
  const pushUrl = `${config.apiHost}/api/v1/push`;
  console.log("[AIGC Image Edit Agent] push start", JSON.stringify({
    task: payload.task,
    taskType: payload.task_type,
    mediaCount: normalizedMediaInfoList.length,
    targetWidth,
    targetHeight,
    instructionLength: instruction.length
  }));
  const pushed = await aigcJsonRequest(pushUrl, "POST", payload, config);
  if (pushed?.code !== 0 && pushed?.error_code !== 0) {
    throw new Error(pushed?.message || pushed?.error_msg || `改图 Agent 投递失败: ${JSON.stringify(pushed)}`);
  }
  const immediateMedia = extractAigcResultMedia(pushed);
  if (immediateMedia.length > 0) {
    const remoteResultUrl = immediateMedia[0].media_data || immediateMedia[0].media_url || "";
    const resultUrl = await persistAigcResult(remoteResultUrl, immediateMedia[0].media_type);
    return {
      status: "success",
      taskId: pushed?.data?.task_id || pushed?.task_id || "",
      resultUrl: resultUrl || remoteResultUrl,
      remoteResultUrl,
      instruction,
      inputImageUrl: initImages[0].url,
      agentMode: "workflow",
      raw: pushed
    };
  }
  const taskId = pushed?.data?.task_id || pushed?.task_id;
  if (!taskId) {
    throw new Error("改图 Agent 投递成功但未返回 task_id");
  }
  await sleep(2500);
  const pollingInterval = Math.max(1000, Number(process.env.AIGC_AGENT_POLL_INTERVAL_MS || config.pollIntervalMs || 2000));
  const pollingMax = Math.max(1, Number(process.env.AIGC_AGENT_MAX_POLLS || 900));
  let emptySuccessCount = 0;
  for (let index = 0; index < pollingMax; index += 1) {
    const result = await getAigcTaskResultOnce(taskId, { config, emptySuccessStatus: "success-empty" });
    if (result.status === "success") {
      return {
        ...result,
        instruction,
        inputImageUrl: initImages[0].url,
        agentMode: "workflow"
      };
    }
    if (result.status === "success-empty") {
      emptySuccessCount += 1;
      console.warn("[AIGC Image Edit Agent] completed without media", JSON.stringify({
        taskId,
        poll: index + 1,
        emptySuccessCount,
        summary: result.summary
      }));
      if (emptySuccessCount >= 10) {
        const message = result.summary?.message ? `: ${result.summary.message}` : "";
        throw new Error(`改图 Agent 已完成但没有返回结果图: ${taskId}${message}`);
      }
    }
    if (result.status === "failed") throw createAigcTaskFailureError(result.raw, taskId);
    if ((index + 1) % 10 === 0) {
      console.log("[AIGC Image Edit Agent] polling", JSON.stringify({
        taskId,
        poll: index + 1,
        pollingMax,
        status: result.status,
        summary: result.summary
      }));
    }
    await sleep(pollingInterval);
  }
  throw new Error(`改图 Agent 任务超时未完成: ${taskId}`);
}

const imageEditAgentJobs = new Map();

function cleanupImageEditAgentJobs() {
  const now = Date.now();
  const maxAgeMs = 3 * 60 * 60 * 1000;
  for (const [jobId, job] of imageEditAgentJobs.entries()) {
    if (now - Number(job.createdAt || now) > maxAgeMs) imageEditAgentJobs.delete(jobId);
  }
}

function buildAdaptImageAgentSuccessResponse({ result, finalUrl, width, height, templateName, appName }) {
  return {
    ok: true,
    provider: "meitu-open-platform",
    endpoint: "/api/aigc/adapt-image-agent",
    task: "image_edit_agent_all",
    strategy: "image_edit_agent_relayout",
    agentMode: result.agentMode || "direct",
    resultUrl: finalUrl,
    remoteResultUrl: result.remoteResultUrl,
    inputImageUrl: result.inputImageUrl,
    instruction: result.instruction,
    target: { width, height },
    template: { name: templateName, app: appName },
    raw: result.raw
  };
}

app.post("/api/aigc/adapt-image-agent/start", async (req, res) => {
  try {
    cleanupImageEditAgentJobs();
    const {
      imageUrl,
      targetWidth,
      targetHeight,
      templateName,
      app: appName,
      userInstruction = ""
    } = req.body || {};
    const validationError = validateRemoteOrStaticUrl(imageUrl, "imageUrl");
    if (validationError) return res.status(400).json({ ok: false, error: validationError });
    const width = toPositiveInt(targetWidth);
    const height = toPositiveInt(targetHeight);
    if (!width || !height) {
      return res.status(400).json({ ok: false, error: "targetWidth / targetHeight 必须是正整数" });
    }

    const jobId = crypto.randomUUID();
    const config = getAigcConfig();
    const publicBaseUrl = getRequestPublicBaseUrl(req);
    imageEditAgentJobs.set(jobId, {
      status: "processing",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      templateName,
      appName,
      target: { width, height }
    });

    (async () => {
      try {
        const sourceMeta = await getImageMetadataForUrl(publicAigcImageUrl(imageUrl, config, publicBaseUrl));
        const result = await submitImageEditAgentRelayoutTask({
          imageUrl,
          targetWidth: width,
          targetHeight: height,
          templateName,
          appName,
          userInstruction,
          sourceWidth: sourceMeta.width || width,
          sourceHeight: sourceMeta.height || height,
          publicBaseUrl
        });
        const finalUrl = result.resultUrl?.startsWith("/static/")
          ? await ensureFinalAdaptSize(result.resultUrl, width, height)
          : result.resultUrl;
        imageEditAgentJobs.set(jobId, {
          status: "success",
          createdAt: imageEditAgentJobs.get(jobId)?.createdAt || Date.now(),
          updatedAt: Date.now(),
          response: buildAdaptImageAgentSuccessResponse({
            result,
            finalUrl,
            width,
            height,
            templateName,
            appName
          })
        });
      } catch (err) {
        console.error("[AIGC Image Edit Agent Job] failed:", err.message);
        imageEditAgentJobs.set(jobId, {
          status: "failed",
          createdAt: imageEditAgentJobs.get(jobId)?.createdAt || Date.now(),
          updatedAt: Date.now(),
          error: "改图 Agent 智能排版失败",
          details: err.message
        });
      }
    })();

    res.status(202).json({ ok: true, jobId, status: "processing" });
  } catch (err) {
    console.error("[AIGC Image Edit Agent Job] start failed:", err.message);
    res.status(500).json({ ok: false, error: "改图 Agent 智能排版启动失败", details: err.message });
  }
});

app.get("/api/aigc/adapt-image-agent/status/:jobId", (req, res) => {
  cleanupImageEditAgentJobs();
  const job = imageEditAgentJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ ok: false, error: "任务不存在或已过期" });
  if (job.status === "success") return res.json(job.response);
  if (job.status === "failed") {
    return res.status(500).json({
      ok: false,
      error: job.error || "改图 Agent 智能排版失败",
      details: job.details || ""
    });
  }
  res.json({
    ok: true,
    status: "processing",
    jobId: req.params.jobId,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    target: job.target,
    template: { name: job.templateName, app: job.appName }
  });
});

app.post("/api/aigc/adapt-image-agent", async (req, res) => {
  try {
    const {
      imageUrl,
      targetWidth,
      targetHeight,
      templateName,
      app: appName,
      userInstruction = ""
    } = req.body || {};
    const validationError = validateRemoteOrStaticUrl(imageUrl, "imageUrl");
    if (validationError) return res.status(400).json({ ok: false, error: validationError });
    const width = toPositiveInt(targetWidth);
    const height = toPositiveInt(targetHeight);
    if (!width || !height) {
      return res.status(400).json({ ok: false, error: "targetWidth / targetHeight 必须是正整数" });
    }
    const config = getAigcConfig();
    const publicBaseUrl = getRequestPublicBaseUrl(req);
    const sourceMeta = await getImageMetadataForUrl(publicAigcImageUrl(imageUrl, config, publicBaseUrl));
    const result = await submitImageEditAgentRelayoutTask({
      imageUrl,
      targetWidth: width,
      targetHeight: height,
      templateName,
      appName,
      userInstruction,
      sourceWidth: sourceMeta.width || width,
      sourceHeight: sourceMeta.height || height,
      publicBaseUrl
    });
    const finalUrl = result.resultUrl?.startsWith("/static/")
      ? await ensureFinalAdaptSize(result.resultUrl, width, height)
      : result.resultUrl;
    res.json(buildAdaptImageAgentSuccessResponse({
      result,
      finalUrl,
      width,
      height,
      templateName,
      appName
    }));
  } catch (err) {
    console.error("[AIGC Image Edit Agent] failed:", err.message);
    res.status(500).json({ ok: false, error: "改图 Agent 智能排版失败", details: err.message });
  }
});

app.post("/api/aigc/adapt-image", async (req, res) => {
  try {
    const {
      imageUrl,
      targetWidth,
      targetHeight,
      templateId,
      templateName,
      app: appName,
      prompt,
      allowRelayout = true
    } = req.body || {};
    const validationError = validateRemoteOrStaticUrl(imageUrl, "imageUrl");
    if (validationError) return res.status(400).json({ ok: false, error: validationError });
    const width = toPositiveInt(targetWidth);
    const height = toPositiveInt(targetHeight);
    if (!width || !height) {
      return res.status(400).json({ ok: false, error: "targetWidth / targetHeight 必须是正整数" });
    }
    console.log("[AdaptImage] start", JSON.stringify({
      imageUrl,
      targetWidth: width,
      targetHeight: height,
      templateId,
      templateName,
      appName,
      allowRelayout,
      promptLength: typeof prompt === "string" ? prompt.length : 0
    }));

    const config = getAigcConfig();
    const publicBaseUrl = getRequestPublicBaseUrl(req);
    const sourceMeta = await getImageMetadataForUrl(publicAigcImageUrl(imageUrl, config, publicBaseUrl));
    const sourceWidth = sourceMeta.width || width;
    const sourceHeight = sourceMeta.height || height;
    const context = {
      config,
      publicBaseUrl,
      sourceWidth,
      sourceHeight,
      templateId,
      templateName,
      appName
    };
    const settings = await readSystemSettings();
    const canUseGptImage2Route = Boolean(settings.nanobannerApiKey);
    const shouldPreferGptImage2Route = Boolean(settings.aiEnhancedMode && settings.nanobannerApiKey);
    const routeFailures = [];
    const routeErrorMessage = (routeName, err) => `${routeName}: ${err.response?.data?.error?.message || err.response?.data?.message || err.message}`;

    const runGptImage2Route = async (routeReason, fallbackWarnings = []) => {
      if (!settings.nanobannerApiKey) {
        throw new Error("后台未配置 Nano Banner / GPT Image 2 API Key");
      }
      const gptContext = {
        ...context,
        fallbackWarnings: [...fallbackWarnings]
      };
      const sourceStaticUrl = await ensureStaticImageUrlForResize(imageUrl);
      const sourcePath = sourceStaticUrl?.startsWith("/static/") ? staticUrlToLocalPath(sourceStaticUrl) : "";
      if (!sourcePath) throw new Error("GPT Image 2 需要可读取的本地输入图片");
      const nanoPrompt = [
        AIGC_CONSERVATIVE_ADAPT_EXPAND_PROMPT,
        "Adapt this exact original poster to the target ad size.",
        "Preserve the original product, subject, readable text, slogan, logo and brand marks as much as possible.",
        "Do not add unrelated objects, new text, fake letters, fake logos, labels, stickers, UI buttons or marketing copy.",
        "Extend or arrange the existing poster content only for the target ad format.",
        settings.tongyiExpandPrompt || "",
        prompt || ""
      ].filter(Boolean).join(" ");
      console.log("[AdaptImage] GPT Image 2 route start", JSON.stringify({
        targetWidth: width,
        targetHeight: height,
        templateId,
        templateName,
        routeReason,
        model: settings.nanobannerModel || getNanoBannerModel()
      }));
      const nanoResult = await nanobannerOutpaint(
        sourcePath,
        width,
        height,
        settings.nanobannerApiKey,
        settings.nanobannerBaseUrl,
        nanoPrompt,
        settings.nanobannerModel
      );
      const finalUrl = await ensureFinalAdaptSize(nanoResult.url, width, height, gptContext, null);
      console.log("[AdaptImage] GPT Image 2 route done", JSON.stringify({ resultUrl: finalUrl, routeReason }));
      return {
        ok: true,
        provider: "gpt-image2",
        route: routeReason,
        endpoint: "/api/aigc/adapt-image",
        resultUrl: finalUrl,
        strategy: "gpt-image2-images-edits",
        target: { width, height },
        template: { id: templateId, name: templateName, app: appName },
        analysis: {
          source: { width: sourceWidth, height: sourceHeight },
          subject: null,
          logo: null,
          text: null,
          warnings: [
            routeReason === "enhanced-first"
              ? "后台 AI 增强已开启，优先使用 GPT Image 2 路线。"
              : "美图 AI 智能排版路线失败后，已自动转到 GPT Image 2 路线。"
          ]
        },
        masks: await buildProtectedMaskFallback(),
        plan: {
          strategy: "gpt-image2-images-edits",
          steps: ["gpt_image2_images_edits", "local_size_normalize"],
          reasons: [routeReason === "enhanced-first" ? "后台 AI 增强开启，优先使用 GPT Image 2 路线" : "美图智能排版失败，自动使用 GPT Image 2 路线"]
        },
        layeredRelayout: {
          failed: false,
          status: "gpt_image2_route",
          layout: { mode: "images-edits", provider: "gpt-image2" },
          layers: { mode: "images-edits", provider: "gpt-image2" }
        },
        fallbackWarnings: gptContext.fallbackWarnings || [],
        qa: { passed: true, warnings: [] },
        limitations: [
          "GPT Image 2 路线使用老张 OpenAI 兼容 Images Edits 接口，后台 API Key / Base URL / Model 会持久保存。",
          "常规美图智能排版路线仍保留；当增强路线失败时，会自动回退到美图路线。"
        ]
      };
    };

    const runMeituLayoutRoute = async (fallbackWarnings = []) => {
      const meituContext = {
        ...context,
        fallbackWarnings: [...fallbackWarnings]
      };
      const analysis = await analyzeAdImageForAdapt(imageUrl, meituContext);
      const masks = await buildProtectedMaskForAdapt(analysis, sourceWidth, sourceHeight) || await buildProtectedMaskFallback();
      const plan = planAdaptStrategy(sourceWidth, sourceHeight, width, height, {
        analysis,
        context: meituContext
      });
      if (isStandardFocalWindowTemplateForAdapt(meituContext) && plan.orientationChange === "cross-direction" && plan.strategy !== "direct" && allowRelayout) {
        plan.strategy = "relayout";
        plan.steps = ["detect", "merge_masks", "split_text_logo_layers", "left-right_relayout", "background_extension", "qa"];
        plan.reasons.push("标准焦点视窗模板强制使用左右智能排版：左侧文案/Logo，右侧主体物");
      }
      if (plan.strategy === "relayout" && !allowRelayout) {
        plan.strategy = "outpaint";
        plan.reasons.push("调用方禁用 relayout，回退到 outpaint");
      }

      const resultUrl = await executeAdaptPlan(imageUrl, width, height, plan, meituContext, prompt, analysis, masks);
      const resizableUrl = await ensureStaticImageUrlForResize(resultUrl);
      const finalUrl = await ensureFinalAdaptSize(resizableUrl, width, height, meituContext, analysis);
      const qa = await runAdaptQa(finalUrl, analysis, plan, width, height, sourceWidth, sourceHeight, meituContext, imageUrl, masks);
      if (meituContext.fallbackWarnings?.length) {
        qa.warnings = [...(qa.warnings || []), ...meituContext.fallbackWarnings];
        qa.passed = false;
      }
      console.log("[AdaptImage] Meitu route done", JSON.stringify({
        strategy: plan.strategy,
        resultUrl: finalUrl,
        qaPassed: qa?.passed,
        qaWarnings: qa?.warnings?.length || 0
      }));

      return {
        ok: true,
        provider: "meitu-open-platform",
        route: "regular",
        endpoint: "/api/aigc/adapt-image",
        resultUrl: finalUrl,
        strategy: plan.strategy,
        target: { width, height },
        template: { id: templateId, name: templateName, app: appName },
        analysis: {
          source: { width: sourceWidth, height: sourceHeight },
          subject: analysis.subject ? {
            exists: analysis.subject.exists,
            kind: analysis.subject.kind,
            box: analysis.subject.box,
            maskUrl: analysis.subject.maskUrl
          } : null,
          logo: analysis.logo ? {
            hasTarget: analysis.logo.hasTarget,
            boxes: analysis.logo.boxes,
            maskUrl: analysis.logo.maskUrl
          } : null,
          text: analysis.text ? {
            hasText: analysis.text.hasText,
            boxes: analysis.text.boxes,
            maskUrl: analysis.text.maskUrl,
            texts: analysis.text.texts
          } : null,
          warnings: analysis.warnings
        },
        masks,
        plan,
        layeredRelayout: meituContext.layeredRelayout ? {
          failed: Boolean(meituContext.layeredRelayout.failed),
          error: meituContext.layeredRelayout.error,
          status: meituContext.layeredRelayout.status,
          stage: meituContext.layeredRelayout.stage,
          endpoint: meituContext.layeredRelayout.endpoint,
          layerBox: meituContext.layeredRelayout.layerBox,
          layout: meituContext.layeredRelayout.layout,
          diagnostics: meituContext.layeredRelayout.diagnostics,
          layers: meituContext.layeredRelayout.layers
        } : null,
        relayoutBackgroundCleanup: meituContext.relayoutBackgroundCleanup || null,
        backgroundPrep: meituContext.backgroundPrep || null,
        fallbackWarnings: meituContext.fallbackWarnings || [],
        qa,
        limitations: [
          "常规路线使用美图检测、文字/Logo 分层、主体保护式背景延展和本地合成的可控智能排版链路。",
          "如果常规路线故障，且后台已保存 GPT Image 2 API Key，会自动转到 GPT Image 2 路线。",
          "后台 AI 增强开启时，会优先使用 GPT Image 2 路线；失败后自动回退到美图智能排版路线。"
        ]
      };
    };

    if (shouldPreferGptImage2Route) {
      try {
        return res.json(await runGptImage2Route("enhanced-first"));
      } catch (err) {
        routeFailures.push(routeErrorMessage("gpt-image2", err));
        console.warn("[AdaptImage] GPT Image 2 first route failed, fallback to Meitu:", err.response?.data || err.message);
        try {
          return res.json(await runMeituLayoutRoute([routeErrorMessage("gpt-image2", err)]));
        } catch (meituErr) {
          routeFailures.push(routeErrorMessage("meitu", meituErr));
          const finalErr = new Error(`标准素材看板两条 AI 路线均失败：${routeFailures.join("；")}`);
          finalErr.routeFailures = routeFailures;
          throw finalErr;
        }
      }
    }

    try {
      return res.json(await runMeituLayoutRoute());
    } catch (meituErr) {
      routeFailures.push(routeErrorMessage("meitu", meituErr));
      console.warn("[AdaptImage] Meitu regular route failed:", meituErr.response?.data || meituErr.message);
      if (canUseGptImage2Route) {
        try {
          return res.json(await runGptImage2Route("meitu-fallback", [routeErrorMessage("meitu", meituErr)]));
        } catch (gptErr) {
          routeFailures.push(routeErrorMessage("gpt-image2", gptErr));
        }
      } else {
        routeFailures.push("gpt-image2: 后台未配置 Nano Banner / GPT Image 2 API Key，无法兜底");
      }
      const finalErr = new Error(`标准素材看板两条 AI 路线均失败：${routeFailures.join("；")}`);
      finalErr.routeFailures = routeFailures;
      throw finalErr;
    }
  } catch (err) {
    console.error("[AIGC Adapt Image] failed:", err.message);
    res.status(500).json({
      ok: false,
      error: "AI 广告图适配管线失败",
      details: err.message,
      routeFailures: err.routeFailures || undefined,
      stage: err.stage,
      provider: err.endpoint ? {
        endpoint: err.endpoint,
        permission: Boolean(err.permission),
        message: normalizeProviderMessage(err.providerRaw)
      } : undefined
    });
  }
});

app.post("/api/aigc/smart-crop", async (req, res) => {
  try {
    const { imageUrl, targetWidth, targetHeight, prompt } = req.body || {};
    const validationError = validateRemoteOrStaticUrl(imageUrl, "imageUrl");
    if (validationError) return res.status(400).json({ error: validationError });
    const width = toPositiveInt(targetWidth);
    const height = toPositiveInt(targetHeight);
    if (!width || !height) {
      return res.status(400).json({ error: "targetWidth / targetHeight 必须是正整数" });
    }
    const result = await submitAigcExpandTask({
      imageUrl,
      targetRatio: `${width}:${height}`,
      prompt: [
        "最高优先级：完整保留原图主体、产品、人物、文案、按钮、Logo 和品牌识别，不裁切、不遮挡、不拉伸、不变形、不改字、不重绘 Logo。",
        "如果原图比例与目标比例不一致，例如竖版转横版或横版转竖版，请先扩展背景和环境，再对主体与信息做自然排版调整，让核心内容全部出现在安全区域内。",
        "补全区域需要与原图光影、材质、色彩、透视一致，画面要像完整广告设计稿，不能出现明显拼接、模糊边框、重复纹理或空白硬边。",
        "最终视觉需要适配目标广告尺寸，主体突出，信息层级清晰，整体美观、平衡、商业质感强。",
        prompt || [
        "将上传图片智能扩展并适配到目标广告尺寸。",
        "保持主体、产品、人物、文字和 Logo 完整清晰，不拉伸、不变形、不改字、不重绘 Logo。",
        "根据目标比例补全背景并优化构图排版，确保主体完整出现，画面美观、平衡、有商业广告设计感。",
        "重要信息应避开边缘安全区。"
        ].join("")
      ].join(""),
      seed: -1,
      publicBaseUrl: getRequestPublicBaseUrl(req),
      mediaOptions: { preferPublicImageUrl: true }
    });
    const finalUrl = result.resultUrl?.startsWith("/static/")
      ? await resizeStaticImageToTarget(result.resultUrl, width, height)
      : result.resultUrl;
    res.json({
      ok: true,
      provider: "meitu-open-platform",
      task: AIGC_TASKS.dispatcher,
      resultUrl: finalUrl,
      remoteResultUrl: result.remoteResultUrl,
      target: { width, height },
      postProcess: finalUrl !== result.resultUrl ? { type: "resize-to-target", sourceUrl: result.resultUrl } : undefined,
      mediaInfo: result.mediaInfo,
      raw: result.raw
    });
  } catch (err) {
    console.error("[AIGC Smart Crop] failed:", err.message);
    res.status(500).json({ error: "AI 扩图适配失败", details: err.message });
  }
});

app.post("/api/aigc/text-to-video", async (req, res) => {
  try {
    const { prompt, text, ratio = "16:9", seed = -1, loraId = "i2v-nolora", duration } = req.body || {};
    const finalText = text || prompt;
    const publicBaseUrl = getRequestPublicBaseUrl(req);
    const config = getAigcConfig();
    if (!finalText || typeof finalText !== "string") {
      return res.status(400).json({ error: "缺少 prompt/text" });
    }
    const firstFrame = await submitAigcTextToImageTask({
      prompt: finalText,
      ratio,
      seed
    });
    if (!firstFrame.resultUrl) {
      throw new Error("文生视频首帧图生成失败，未返回图片 URL");
    }
    const firstFrameInputUrl = firstFrame.remoteResultUrl || await resolveOpenapiAdaptImageUrl(firstFrame.resultUrl, {
      config,
      publicBaseUrl
    });
    if (!/^https?:\/\//i.test(firstFrameInputUrl || "")) {
      throw new Error("文生视频首帧图需要可被美图算法访问的 URL，请配置 AIGC_PUBLIC_BASE_URL 或使用远程结果 URL");
    }
    const ltxVideoParams = {
      parameter: {
        lora_id: String(loraId || "i2v-nolora"),
        prompt: finalText,
        rsp_media_type: "url",
        task_type: "i2v-distilled",
        ...(Number(duration) > 0 ? { duration: Number(duration) } : {})
      }
    };

    const usedTask = AIGC_TASKS.textToVideo;
    const result = await submitDirectOpenapiMediaTask({
      task: usedTask,
      parameter: ltxVideoParams.parameter,
      mediaInfoList: [mediaInfoFromUrl(firstFrameInputUrl)],
      extra: {},
      initialDelayMs: 10000,
      pollIntervalMs: 5000,
      config
    });
    res.json({
      ok: true,
      provider: "meitu-open-platform",
      task: usedTask,
      fallbackUsed: false,
      firstFrameUrl: firstFrame.resultUrl,
      firstFrameRemoteUrl: firstFrame.remoteResultUrl,
      firstFrameInputUrl,
      ...result
    });
  } catch (err) {
    console.error("[AIGC Text To Video] failed:", err.message);
    res.status(500).json({ error: "AI 文生视频失败", details: err.message });
  }
});

app.post("/api/aigc/image-to-video", async (req, res) => {
  try {
    const {
      imageUrl,
      prompt = "主体轻微运动，背景光影自然流动，保持商业海报质感",
      taskType = "i2v-distilled",
      loraId = "i2v-nolora"
    } = req.body || {};
    const validationError = validateRemoteOrStaticUrl(imageUrl, "imageUrl");
    if (validationError) return res.status(400).json({ error: validationError });
    const publicBaseUrl = getRequestPublicBaseUrl(req);
    const config = getAigcConfig();
    const videoInputImageUrl = await resolveOpenapiAdaptImageUrl(imageUrl, { config, publicBaseUrl });
    if (!/^https?:\/\//i.test(videoInputImageUrl || "")) {
      throw new Error("图生视频输入图需要可被美图算法访问的 URL，请配置 AIGC_PUBLIC_BASE_URL 或 OBSERVER_* 上传中转");
    }
    const result = await submitDirectOpenapiMediaTask({
      task: AIGC_TASKS.imageToVideo,
      parameter: {
        task_type: taskType || "i2v-distilled",
        prompt,
        rsp_media_type: "url",
        lora_id: loraId || "i2v-nolora"
      },
      mediaInfoList: [mediaInfoFromUrl(videoInputImageUrl)],
      extra: {},
      initialDelayMs: 10000,
      pollIntervalMs: 5000,
      config
    });
    res.json({ ok: true, provider: "meitu-open-platform", task: AIGC_TASKS.imageToVideo, inputImageUrl: videoInputImageUrl, ...result });
  } catch (err) {
    console.error("[AIGC Image To Video] failed:", err.message);
    res.status(500).json({ error: "AI 图生视频失败", details: err.message });
  }
});

app.post("/api/aigc/video-cutout", async (req, res) => {
  try {
    const {
      videoUrl,
      prompt = "保留主体，去除纯白或近白背景，边缘干净，适合透明前景合成",
      similarity = 0.16,
      blend = 0.06,
      fps = 24,
      maxDurationSec = 5,
      maxWidth,
      maxHeight
    } = req.body || {};
    const validationError = validateRemoteOrStaticUrl(videoUrl, "videoUrl");
    if (validationError) return res.status(400).json({ error: validationError });
    const publicBaseUrl = getRequestPublicBaseUrl(req);
    const config = getAigcConfig();
    const result = await cutoutVideoForegroundWithAigc(videoUrl, {
      prompt,
      similarity,
      blend,
      fps,
      maxDurationSec,
      maxWidth,
      maxHeight,
      publicBaseUrl,
      config
    });
    res.json({
      ok: true,
      provider: "meitu-open-platform",
      task: config.videoCutoutTask || "local-white-key",
      ...result
    });
  } catch (err) {
    console.error("[AIGC Video Cutout] failed:", err.message);
    res.status(500).json({ error: "AI 抠视频失败", details: err.message });
  }
});

function videoExpandInputPreprocessPayload(job) {
  return job.preparedInput?.preprocessed
    ? {
      type: "ffmpeg-downscale",
      maxSide: job.preparedInput.preprocessed.maxSide,
      maxDurationSec: Number(job.finalMaxDurationSec.toFixed(2)),
      fps: job.finalOutFps,
      sizeMB: job.preparedInput.preprocessed.sizeMB
    }
    : null;
}

function videoExpandJobProcessingPayload(job) {
  return {
    ok: true,
    status: "processing",
    provider: "meitu-open-platform",
    task: AIGC_TASKS.videoExpand,
    taskId: job.taskId,
    inputMode: job.inputMode,
    fallbackUsed: false,
    target: { width: job.finalTargetWidth, height: job.finalTargetHeight },
    aigcTarget: job.aigcTarget,
    inputPreprocess: videoExpandInputPreprocessPayload(job),
    job: {
      taskId: job.taskId,
      inputMode: job.inputMode,
      finalTargetWidth: job.finalTargetWidth,
      finalTargetHeight: job.finalTargetHeight,
      aigcTarget: job.aigcTarget,
      needsPreciseCrop: job.needsPreciseCrop,
      finalOutFps: job.finalOutFps,
      finalMaxDurationSec: job.finalMaxDurationSec,
      inputPreprocess: videoExpandInputPreprocessPayload(job)
    }
  };
}

function normalizeVideoExpandClientJob(value) {
  if (!value || typeof value !== "object") return null;
  const taskId = String(value.taskId || "").trim();
  const finalTargetWidth = toPositiveInt(value.finalTargetWidth);
  const finalTargetHeight = toPositiveInt(value.finalTargetHeight);
  const aigcTargetWidth = toPositiveInt(value.aigcTarget?.width);
  const aigcTargetHeight = toPositiveInt(value.aigcTarget?.height);
  if (!taskId || !finalTargetWidth || !finalTargetHeight || !aigcTargetWidth || !aigcTargetHeight) return null;
  return {
    taskId,
    inputMode: String(value.inputMode || "url"),
    publicBaseUrl: "",
    finalTargetWidth,
    finalTargetHeight,
    aigcTarget: { width: aigcTargetWidth, height: aigcTargetHeight },
    needsPreciseCrop: Boolean(value.needsPreciseCrop),
    finalOutFps: toPositiveInt(value.finalOutFps) || 24,
    finalMaxDurationSec: Number(value.finalMaxDurationSec) || (AIGC_VIDEO_EXPAND_MAX_FRAMES / 24),
    preparedInput: value.inputPreprocess
      ? {
        preprocessed: {
          maxSide: value.inputPreprocess.maxSide,
          sizeMB: value.inputPreprocess.sizeMB
        }
      }
      : null,
    createdAt: Date.now(),
    completedResponse: null
  };
}

async function createVideoExpandJob(req, body = {}) {
  const {
    videoUrl,
    targetWidth = 1920,
    targetHeight = 1080,
    r_w_left = 0.25,
    r_w_right = 0.25,
    r_h_up = 0,
    r_h_down = 0,
    prompt = "扩展画面背景，保持动态连贯",
    out_fps = 24,
    start_idx = 0,
    max_num_frames = AIGC_VIDEO_EXPAND_MAX_FRAMES,
    mixed_precision = "bf16",
    seed = 123,
  } = body;
  const validationError = validateRemoteOrStaticUrl(videoUrl, "videoUrl");
  if (validationError) {
    const error = new Error(validationError);
    error.statusCode = 400;
    throw error;
  }

  const finalTargetWidth = toPositiveInt(targetWidth) || 1920;
  const finalTargetHeight = toPositiveInt(targetHeight) || 1080;
  const aigcTarget = getAigcVideoEncodeDimensions(finalTargetWidth, finalTargetHeight);
  const finalOutFps = toPositiveInt(out_fps) || 24;
  const finalMaxNumFrames = Math.min(toPositiveInt(max_num_frames) || AIGC_VIDEO_EXPAND_MAX_FRAMES, AIGC_VIDEO_EXPAND_MAX_FRAMES);
  const finalMaxDurationSec = finalMaxNumFrames / finalOutFps;
  const finalPrompt = String(prompt || "").trim() || "seamlessly extend the background, high quality";
  const publicBaseUrl = getRequestPublicBaseUrl(req);
  const preparedInput = await prepareVideoInputForAigcExpand(videoUrl, aigcTarget, {
    publicBaseUrl,
    maxDurationSec: finalMaxDurationSec,
    fps: finalOutFps
  });
  const videoInputUrl = preparedInput.url;
  const inputMode = preparedInput.inputMode;
  const params = {
    parameter: {
      target_width: aigcTarget.width,
      target_height: aigcTarget.height,
      r_w_left: Number.isFinite(Number(r_w_left)) ? Number(r_w_left) : 0,
      r_w_right: Number.isFinite(Number(r_w_right)) ? Number(r_w_right) : 0,
      r_h_up: Number.isFinite(Number(r_h_up)) ? Number(r_h_up) : 0,
      r_h_down: Number.isFinite(Number(r_h_down)) ? Number(r_h_down) : 0,
      out_fps: finalOutFps,
      start_idx: toNonNegativeInt(start_idx, 0),
      max_num_frames: finalMaxNumFrames,
      mixed_precision: String(mixed_precision || "bf16"),
      seed: toPositiveSeed(seed, 123),
      prompt: finalPrompt,
      rsp_media_type: "url"
    }
  };
  console.log("[AIGC Video Expand] submit", JSON.stringify({
    inputMode,
    target: { width: finalTargetWidth, height: finalTargetHeight },
    aigcTarget,
    mediaDataType: "url",
    mediaUrlKind: videoInputUrl.startsWith("/static/") ? "static" : "remote",
    preprocessed: preparedInput.preprocessed
      ? {
        maxSide: preparedInput.preprocessed.maxSide,
        sizeMB: preparedInput.preprocessed.sizeMB,
        maxDurationSec: Number(finalMaxDurationSec.toFixed(2)),
        fps: finalOutFps
      }
      : null,
    parameterKeys: Object.keys(params.parameter)
  }));

  const pushed = await pushAigcTask({
    task: AIGC_TASKS.videoExpand,
    params,
    extra: {},
    mediaInfoList: [mediaInfoFromUrl(videoInputUrl)],
    publicBaseUrl
  });
  const job = {
    taskId: pushed.taskId,
    inputMode,
    publicBaseUrl,
    finalTargetWidth,
    finalTargetHeight,
    aigcTarget,
    needsPreciseCrop: aigcTarget.width !== finalTargetWidth || aigcTarget.height !== finalTargetHeight,
    finalOutFps,
    finalMaxDurationSec,
    preparedInput,
    createdAt: Date.now(),
    completedResponse: null
  };
  videoExpandJobs.set(pushed.taskId, job);
  return job;
}

async function resolveVideoExpandJobStatus(taskId, clientJob = null) {
  const fallbackJob = normalizeVideoExpandClientJob(clientJob);
  const job = videoExpandJobs.get(taskId) || fallbackJob;
  if (!job) {
    throw new Error(`AI 视频扩展任务缓存已失效，请重新生成: ${taskId}`);
  }
  if (job.completedResponse) return job.completedResponse;

  let result;
  try {
    result = await getAigcTaskResultOnce(taskId, {
      persistOptions: { maxContentLengthBytes: 500 * 1024 * 1024 }
    });
  } catch (err) {
    if (isAigcTimeoutError(err)) {
      console.warn(`[AIGC Video Expand] status timeout, keep polling: ${taskId}, ${err.message}`);
      return {
        ...videoExpandJobProcessingPayload(job),
        details: err.message
      };
    }
    throw err;
  }

  if (result.status === "failed") {
    return {
      ...videoExpandJobProcessingPayload(job),
      status: "failed",
      raw: result.raw
    };
  }
  if (result.status !== "success") {
    return videoExpandJobProcessingPayload(job);
  }

  let finalResult = result;
  let postProcess = null;
  if (job.needsPreciseCrop) {
    const cropResult = await preciseCropVideoToTarget(result.resultUrl || result.remoteResultUrl, job.finalTargetWidth, job.finalTargetHeight, {
      publicBaseUrl: job.publicBaseUrl,
      mediaType: result.mediaInfo?.media_type || "video/mp4"
    });
    postProcess = {
      type: "ffmpeg-cover-crop",
      from: job.aigcTarget,
      to: { width: job.finalTargetWidth, height: job.finalTargetHeight },
      sizeMB: cropResult.sizeMB
    };
    finalResult = { ...result, resultUrl: cropResult.url };
  }

  const response = {
    ok: true,
    status: "success",
    provider: "meitu-open-platform",
    task: AIGC_TASKS.videoExpand,
    inputMode: job.inputMode,
    fallbackUsed: false,
    target: { width: job.finalTargetWidth, height: job.finalTargetHeight },
    aigcTarget: job.aigcTarget,
    inputPreprocess: videoExpandInputPreprocessPayload(job),
    postProcess,
    ...finalResult
  };
  job.completedResponse = response;
  videoExpandJobs.set(taskId, job);
  console.log("[AIGC Video Expand] success", JSON.stringify({ taskId, postProcess: Boolean(postProcess) }));
  return response;
}

app.post("/api/aigc/video-expand", async (req, res) => {
  try {
    const job = await createVideoExpandJob(req, req.body || {});
    let lastStatus = null;
    for (let index = 0; index < 180; index += 1) {
      await sleep(5000);
      lastStatus = await resolveVideoExpandJobStatus(job.taskId);
      if (lastStatus.status === "success") return res.json(lastStatus);
      if (lastStatus.status === "failed") throw createAigcTaskFailureError(lastStatus.raw, job.taskId);
    }
    res.status(202).json(lastStatus || videoExpandJobProcessingPayload(job));
  } catch (err) {
    console.error("[AIGC Video Expand] failed:", err.message);
    res.status(500).json({ error: "AI 视频扩展失败", details: err.message });
  }
});

app.post("/api/aigc/video-expand/submit", async (req, res) => {
  try {
    const job = await createVideoExpandJob(req, req.body || {});
    res.json(videoExpandJobProcessingPayload(job));
  } catch (err) {
    console.error("[AIGC Video Expand] submit failed:", err.message);
    res.status(500).json({ error: "AI 视频扩展投递失败", details: err.message });
  }
});

app.post("/api/aigc/video-expand/status", async (req, res) => {
  try {
    const taskId = String(req.body?.taskId || req.query?.taskId || "").trim();
    if (!taskId) return res.status(400).json({ error: "缺少 taskId" });
    const status = await resolveVideoExpandJobStatus(taskId, req.body?.job);
    if (status.status === "failed") throw createAigcTaskFailureError(status.raw, taskId);
    res.json(status);
  } catch (err) {
    console.error("[AIGC Video Expand] status failed:", err.message);
    res.status(500).json({ error: "AI 视频扩展状态查询失败", details: err.message, taskId: err.taskId });
  }
});

app.post("/api/aigc/video-clip", async (req, res) => {
  try {
    const { videoIdOrUrl, clipVideoLength = "10" } = req.body || {};
    if (!videoIdOrUrl || typeof videoIdOrUrl !== "string") {
      return res.status(400).json({ error: "缺少 videoIdOrUrl" });
    }
    const result = await submitAigcTask({
      task: AIGC_TASKS.videoClip,
      params: {
        media_info_list: [],
        parameter: {
          ID: videoIdOrUrl,
          clip_video_length: String(clipVideoLength),
          rsp_media_type: "url"
        }
      },
      initialDelayMs: 10000,
      pollIntervalMs: 5000
    });
    res.json({ ok: true, provider: "meitu-open-platform", task: AIGC_TASKS.videoClip, ...result });
  } catch (err) {
    console.error("[AIGC Video Clip] failed:", err.message);
    res.status(500).json({ error: "AI 视频裁剪失败", details: err.message });
  }
});

app.post("/api/aigc/image-composition", async (req, res) => {
  try {
    const {
      backgroundPicName,
      foregroundPicUrl,
      rectX = 0,
      rectY = 0,
      rectW,
      rectH,
      type = 1
    } = req.body || {};
    if (!backgroundPicName || typeof backgroundPicName !== "string") {
      return res.status(400).json({ error: "缺少 backgroundPicName" });
    }
    const validationError = validateRemoteOrStaticUrl(foregroundPicUrl, "foregroundPicUrl");
    if (validationError) return res.status(400).json({ error: validationError });
    const width = toPositiveInt(rectW);
    const height = toPositiveInt(rectH);
    if (!width || !height) {
      return res.status(400).json({ error: "rectW / rectH 必须是正整数" });
    }
    const result = await submitAigcDirectRequest("/v1/alphamix", {
      backgroundPicName,
      foregroundPicUrl,
      rectX: Math.round(Number(rectX) || 0),
      rectY: Math.round(Number(rectY) || 0),
      rectW: width,
      rectH: height,
      type: Math.round(Number(type) || 1)
    });
    res.json({ ok: true, provider: "meitu-open-platform", task: "/v1/alphamix", ...result });
  } catch (err) {
    console.error("[AIGC Image Composition] failed:", err.message);
    res.status(500).json({ error: "AI 智能排版失败", details: err.message });
  }
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
  const settings = await readSystemSettings();
  // NOTE: 为安全起见，返回时遮盖 API Key 的实际内容（只显示是否已配置）
  res.json({
    ...settings,
    tongyiApiKey: settings.tongyiApiKey ? "***configured***" : "",
    tongyiApiKeyConfigured: !!settings.tongyiApiKey,
    nanobannerApiKey: settings.nanobannerApiKey ? "***configured***" : "",
    nanobannerBaseUrl: settings.nanobannerBaseUrl ? "***configured***" : "",
    nanobannerModel: settings.nanobannerModel || getNanoBannerModel(),
    nanobannerApiKeyConfigured: !!settings.nanobannerApiKey
  });
});

app.put("/api/settings", async (req, res) => {
  const payload = req.body || {};
  const current = await readSystemSettings();

  // NOTE: 如果前端传来 "***configured***" 说明用户没改 key，保持原值
  if (payload.tongyiApiKey === "***configured***") {
    payload.tongyiApiKey = current.tongyiApiKey;
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
  updated.nanobannerModel = normalizeNanoBannerModelName(updated.nanobannerModel);
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

async function nanobannerOutpaint(inputImagePath, targetWidth, targetHeight, apiKey, baseUrl, customPrompt = "", modelName = "") {
  try {
    console.log(`[NanoBanner] 开始处理: ${targetWidth}x${targetHeight}...`);
    if (!baseUrl) {
      baseUrl = "https://api.openai.com/v1";
    }
    baseUrl = baseUrl.replace(/\/$/, "");
    const apiEndpoint = `${baseUrl}/images/edits`;

    // 1. 组装请求指令
    const extendPrompt = `请根据这张图片进行自然无缝向外扩充延展，生成 ${targetWidth}x${targetHeight} 等比例的完整图像。主体保持不变与居中。${customPrompt}`;

    // NOTE: 老张 GPT Image 2 文档要求图改图使用 Images Edits，不走 chat/completions。
    const nanoBannerModel = String(modelName || "").trim() || getNanoBannerModel();
    const FormData = (await import("form-data")).default;
    const formData = new FormData();
    formData.append("model", normalizeNanoBannerModelName(nanoBannerModel));
    formData.append("prompt", extendPrompt);
    formData.append("image", createReadStream(inputImagePath));

    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      ...formData.getHeaders()
    };

    console.log(`[NanoBanner] 发起 Images Edits 请求到: ${apiEndpoint}, model=${normalizeNanoBannerModelName(nanoBannerModel)}`);
    // 允许大底图的长连接时长
    const submitResp = await axios.post(apiEndpoint, formData, {
      headers,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      timeout: 120000
    });

    if (typeof submitResp.data === "string" && /<(?:!doctype|html)\b/i.test(submitResp.data)) {
      throw new Error(`Nano Banner API Base URL 返回了网页 HTML，不是接口 JSON。请把 API BASE URL 填为接口根地址，例如 https://api.laozhang.ai/v1，不要填官网/落地页；当前请求地址：${apiEndpoint}`);
    }

    const imageItem = submitResp.data?.data?.[0];
    const b64Json = imageItem?.b64_json || imageItem?.b64 || "";
    const resultUrl = imageItem?.url || imageItem?.image_url || "";
    if (!b64Json && !resultUrl) {
      throw new Error(`无图片结果返回: ${JSON.stringify(submitResp.data).substring(0, 200)}`);
    }

    let imgBuffer;
    if (b64Json) {
      const cleanB64 = String(b64Json).replace(/^data:image\/[^;]+;base64,/, "").replace(/\s/g, "");
      imgBuffer = Buffer.from(cleanB64 + "=".repeat((4 - cleanB64.length % 4) % 4), "base64");
    } else {
      const imgResponse = await axios.get(resultUrl, { responseType: "arraybuffer", timeout: 60000 });
      imgBuffer = Buffer.from(imgResponse.data);
    }

    // 2. 统一落成本地 PNG，后续再由本地模板流程归一化到目标尺寸。
    const normalizedBuffer = await sharp(imgBuffer).png().toBuffer();
    const outFilename = `nanobanner_edit_${Date.now()}.png`;
    const outPath = path.join(STORAGE_DIR, outFilename);
    await fs.writeFile(outPath, normalizedBuffer);

    return {
      url: `/static/${outFilename}`,
      width: targetWidth,
      height: targetHeight,
      size: normalizedBuffer.length
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
  const userPrompt = String(prompt || "炫动开屏挂件")
    .replace(/[，,。.\s]*纯白色背景[。.\s]*$/u, "")
    .trim() || "炫动开屏挂件";
  const finalPrompt = [
    "生成一个广告开屏挂件素材。",
    "硬性要求：1:1 正方形，最终可处理为 450x450px PNG；主体居中；适合叠加在 1440x2340 开屏视频上；边缘干净；不要文字水印。",
    `用户想法：${userPrompt}，纯白色背景`
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
  await writePendantWithTransparentBackground(imgBuffer, outPath);

  const stats = await fs.stat(outPath);
  return {
    url: `/static/${outFilename}`,
    width: 450,
    height: 450,
    size: stats.size
  };
}

async function writePendantWithTransparentBackground(imgBuffer, outPath) {
  const { data, info } = await sharp(imgBuffer)
    .resize(450, 450, {
      fit: "contain",
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height, channels } = info;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  let head = 0;
  let tail = 0;

  const isWhiteBackground = (pixelIndex) => {
    const offset = pixelIndex * channels;
    const r = data[offset];
    const g = data[offset + 1];
    const b = data[offset + 2];
    const a = data[offset + 3];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    return a > 0 && r >= 238 && g >= 238 && b >= 238 && max - min <= 18;
  };

  const enqueueIfBackground = (pixelIndex) => {
    if (visited[pixelIndex] || !isWhiteBackground(pixelIndex)) return;
    visited[pixelIndex] = 1;
    queue[tail++] = pixelIndex;
  };

  for (let x = 0; x < width; x += 1) {
    enqueueIfBackground(x);
    enqueueIfBackground((height - 1) * width + x);
  }
  for (let y = 0; y < height; y += 1) {
    enqueueIfBackground(y * width);
    enqueueIfBackground(y * width + width - 1);
  }

  while (head < tail) {
    const pixelIndex = queue[head++];
    const x = pixelIndex % width;
    const y = Math.floor(pixelIndex / width);

    if (x > 0) enqueueIfBackground(pixelIndex - 1);
    if (x < width - 1) enqueueIfBackground(pixelIndex + 1);
    if (y > 0) enqueueIfBackground(pixelIndex - width);
    if (y < height - 1) enqueueIfBackground(pixelIndex + width);
  }

  for (let pixelIndex = 0; pixelIndex < visited.length; pixelIndex += 1) {
    if (visited[pixelIndex]) {
      data[pixelIndex * channels + 3] = 0;
    }
  }

  await sharp(data, {
    raw: { width, height, channels }
  })
    .png()
    .toFile(outPath);
}

app.post("/api/creative/dynamic-splash/pendant", async (req, res) => {
  try {
    const prompt = String(req.body?.prompt || "").trim();
    const settings = await readSystemSettings();

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
    const settings = await readSystemSettings();
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


app.post("/api/nanobanner/test", async (req, res) => {
  try {
    const settings = await readSystemSettings();
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

    if (typeof tokenResp.data === "string" && /<(?:!doctype|html)\b/i.test(tokenResp.data)) {
      return res.status(400).json({
        ok: false,
        error: "连接失败：API Base URL 返回了网页 HTML，不是接口 JSON。请填写接口根地址，例如 https://api.laozhang.ai/v1，不要填写官网/落地页。"
      });
    }

    if (tokenResp.status === 200 && tokenResp.data && typeof tokenResp.data === "object") {
      return res.json({ ok: true, message: "Nano Banner API 测试成功，接口通畅" });
    } else {
      return res.status(400).json({ ok: false, error: "连接失败：接口没有返回标准 JSON，请检查 API Base URL 是否为服务商提供的接口根地址。" });
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

app.post("/api/export-video", async (req, res) => {
  try {
    const { url, width, height, maxDurationSec } = req.body || {};
    const targetWidth = Math.max(1, parseInt(width, 10) || 0);
    const targetHeight = Math.max(1, parseInt(height, 10) || 0);
    if (!url || typeof url !== "string") {
      return res.status(400).json({ error: "缺少视频 url" });
    }
    if (!targetWidth || !targetHeight) {
      return res.status(400).json({ error: "width / height 必须是正整数" });
    }
    if (!url.startsWith("/static/")) {
      return res.status(400).json({ error: "当前仅支持导出本地 /static 视频素材" });
    }

    const relativeStaticPath = decodeURIComponent(url.replace(/^\/static\/+/, ""));
    const sourcePath = path.resolve(STORAGE_DIR, relativeStaticPath);
    const storageRoot = path.resolve(STORAGE_DIR);
    if (!sourcePath.startsWith(`${storageRoot}${path.sep}`)) {
      return res.status(400).json({ error: "视频路径不合法" });
    }

    await fs.access(sourcePath);
    await ensureDir(STORAGE_DIR);
    const outputFilename = `video_export_${Date.now()}_${crypto.randomBytes(4).toString("hex")}_${targetWidth}x${targetHeight}.mp4`;
    const outputPath = path.join(STORAGE_DIR, outputFilename);
    await resizeVideoToDimensions(sourcePath, targetWidth, targetHeight, outputPath, { maxDurationSec });
    const outputStats = await fs.stat(outputPath);

    res.json({
      ok: true,
      url: `/static/${outputFilename}`,
      width: targetWidth,
      height: targetHeight,
      sizeMB: Number((outputStats.size / 1024 / 1024).toFixed(2))
    });
  } catch (err) {
    console.error("[ExportVideo] Error:", err.message);
    res.status(500).json({ error: "视频导出失败", details: err.message });
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
    const settings = await readSystemSettings();
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
      // 排除蒙版、工作流、默认角标和模板展示视频目录
      if (file === "masks" || file === "workflows" || file === "badges" || file === "previews") continue;

      const filePath = path.join(STORAGE_DIR, file);
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) continue;

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
  const server = app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
    // 启动时先跑一次清理
    cleanupStorage();
  });
  server.requestTimeout = 40 * 60 * 1000;
  server.headersTimeout = 40 * 60 * 1000 + 5000;
});
