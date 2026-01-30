import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Type } from "@google/genai";

// ---- 基础路径与环境变量 ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");

const PORT = process.env.PORT || 4000;
const COMFYUI_BASE_URL = process.env.COMFYUI_BASE_URL || "http://127.0.0.1:8188";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.API_KEY;

const DATA_DIR = path.join(__dirname, "data");
const STORAGE_DIR = path.join(__dirname, "storage");
const MASKS_DIR = path.join(STORAGE_DIR, "masks");
const WORKFLOWS_DIR = path.join(STORAGE_DIR, "workflows");

const TEMPLATES_FILE = path.join(DATA_DIR, "templates.json");
const WORKFLOWS_FILE = path.join(DATA_DIR, "workflows.json");

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
      { id: "mt-s-1", app: "美图秀秀", category: "开屏", name: "动态开屏", checked: false, dimensions: "1440 x 2340" },
      { id: "mt-s-2", app: "美图秀秀", category: "开屏", name: "上滑开屏", checked: false, dimensions: "1440 x 2340" },
      { id: "mt-s-3", app: "美图秀秀", category: "开屏", name: "扭动开屏", checked: false, dimensions: "1440 x 2340" },
      { id: "mt-s-4", app: "美图秀秀", category: "开屏", name: "气泡开屏", checked: false, dimensions: "1440 x 2340" },
      { id: "mt-f-1", app: "美图秀秀", category: "焦点视窗", name: "动态焦点视窗", checked: true, dimensions: "1126 x 2436" },
      { id: "mt-f-2", app: "美图秀秀", category: "焦点视窗", name: "静态焦点视窗", checked: true, dimensions: "1126 x 2436" },
      { id: "mt-f-3", app: "美图秀秀", category: "焦点视窗", name: "沉浸式焦点视窗", checked: false, dimensions: "1126 x 2436" },
      { id: "mt-fe-1", app: "美图秀秀", category: "信息流", name: "一键配方图文", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-ib-1", app: "美图秀秀", category: "icon/banner", name: "热推第三位", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-ib-2", app: "美图秀秀", category: "icon/banner", name: "热搜词第四位", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-ib-3", app: "美图秀秀", category: "icon/banner", name: "话题页背景板", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-ib-4", app: "美图秀秀", category: "icon/banner", name: "话题页banner", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-p-1", app: "美图秀秀", category: "弹窗", name: "保分页弹窗", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-p-2", app: "美图秀秀", category: "弹窗", name: "首页弹窗", checked: false, dimensions: "1080 x 1920" },
      { id: "mt-p-3", app: "美图秀秀", category: "弹窗", name: "首页弹窗异形", checked: false, dimensions: "1080 x 1920" },

      // 美颜
      { id: "my-s-1", app: "美颜", category: "开屏", name: "动态开屏", checked: false, dimensions: "1440 x 2340" },
      { id: "my-s-2", app: "美颜", category: "开屏", name: "上滑开屏", checked: false, dimensions: "1440 x 2340" },
      { id: "my-s-3", app: "美颜", category: "开屏", name: "扭动开屏", checked: false, dimensions: "1440 x 2340" },
      { id: "my-s-4", app: "美颜", category: "开屏", name: "气泡开屏", checked: false, dimensions: "1440 x 2340" },
      { id: "my-f-1", app: "美颜", category: "焦点视窗", name: "动态焦点视窗", checked: false, dimensions: "1126 x 2436" },
      { id: "my-f-2", app: "美颜", category: "焦点视窗", name: "静态焦点视窗", checked: false, dimensions: "1126 x 2436" },
      { id: "my-p-1", app: "美颜", category: "弹窗", name: "弹窗精图", checked: false, dimensions: "1080 x 1920" },
      { id: "my-ib-1", app: "美颜", category: "icon/banner", name: "百宝箱顶部banner", checked: false, dimensions: "1080 x 1920" },

      // wink
      { id: "wk-s-1", app: "wink", category: "开屏", name: "动态开屏", checked: false, dimensions: "1440 x 2340" },
      { id: "wk-s-2", app: "wink", category: "开屏", name: "上滑开屏", checked: false, dimensions: "1440 x 2340" },
      { id: "wk-s-3", app: "wink", category: "开屏", name: "扭动开屏", checked: false, dimensions: "1440 x 2340" },
      { id: "wk-s-4", app: "wink", category: "开屏", name: "气泡开屏", checked: false, dimensions: "1440 x 2340" },
      { id: "wk-f-1", app: "wink", category: "焦点视窗", name: "动态焦点视窗", checked: false, dimensions: "1126 x 2436" },
      { id: "wk-f-2", app: "wink", category: "焦点视窗", name: "静态焦点视窗", checked: false, dimensions: "1126 x 2436" }
    ];

    await writeJson(TEMPLATES_FILE, initialTemplates);
  }

  const workflows = await readJson(WORKFLOWS_FILE, null);
  if (!workflows) {
    await writeJson(WORKFLOWS_FILE, []);
  }

  await ensureDir(MASKS_DIR);
  await ensureDir(WORKFLOWS_DIR);
}

// ---- Multer 上传：遮罩 PNG & Workflow JSON ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    if (file.fieldname === "mask") {
      cb(null, MASKS_DIR);
    } else if (file.fieldname === "workflow") {
      cb(null, WORKFLOWS_DIR);
    } else {
      cb(null, STORAGE_DIR);
    }
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".dat";
    const safeName = file.originalname.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
    cb(null, `${Date.now()}_${safeName}${ext}`);
  }
});

const upload = multer({ storage });

// ---- 初始化 Express 应用 ----
const app = express();

app.use(cors());
app.use(express.json({ limit: "20mb" }));
app.use("/static", express.static(STORAGE_DIR));

// ---- API：模版管理 ----
app.get("/api/templates", async (req, res) => {
  const templates = await readJson(TEMPLATES_FILE, []);
  res.json(templates);
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
    maskUrl
  };
  await writeJson(TEMPLATES_FILE, templates);
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

  if (!name) {
    return res.status(400).json({ error: "name 为必填字段" });
  }

  if (!file) {
    return res.status(400).json({ error: "缺少上传文件字段 'workflow'" });
  }

  const workflows = await readJson(WORKFLOWS_FILE, []);
  const id = `wf_${Date.now()}`;
  const relativePath = path.relative(ROOT_DIR, file.path).replace(/\\/g, "/");

  const workflow = {
    id,
    name,
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
// 这里只做一个简单占位，未来可在此读取 workflow JSON，并调用 COMFYUI 的 /prompt 接口
app.post("/api/comfyui/generate", async (req, res) => {
  const { workflowId, params } = req.body || {};
  if (!workflowId) {
    return res.status(400).json({ error: "缺少 workflowId" });
  }

  // 预留：这里你可以根据 workflowId 读取 workflows.json 中的 filePath，
  // 再从文件系统中加载 JSON 内容，并调用 COMFYUI_BASE_URL 的接口。
  // 为避免在本环境下真实联网，这里仅返回结构化的“计划调用信息”。

  res.json({
    ok: true,
    message: "ComfyUI 调用占位：请在生产环境中实现与 ComfyUI 的真实 HTTP 对接。",
    comfyuiBaseUrl: COMFYUI_BASE_URL,
    workflowId,
    params: params || {}
  });
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


// ---- 启动 ----
ensureDataFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
  });

