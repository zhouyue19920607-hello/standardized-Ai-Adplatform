import express from "express";
import cors from "cors";
import multer from "multer";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { GoogleGenAI, Type } from "@google/genai";
import axios from "axios";
import { processImage } from "./utils/imageProcessor.mjs";

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
      { id: "mt-ib-3", app: "美图秀秀", category: "icon/banner", name: "话题页背景板", checked: false, dimensions: "1126 x 640" },
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

// 生产环境下静态服务 Vue/React 构建出来的 dist 目录
const DIST_DIR = path.join(ROOT_DIR, "dist");
app.use(express.static(DIST_DIR));

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

  if (payload.app === "美颜" || payload.app === "wink") {
    return res.status(400).json({ error: "暂不支持 '美颜' 和 'wink' 应用配置" });
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
    mask_path: maskUrl, // Ensuring compatibility if frontend expects mask_path
    maskUrl
  };
  await writeJson(TEMPLATES_FILE, templates);
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

  const overlayUrl = `/static/${path.relative(STORAGE_DIR, file.path).replace(/\\/g, "/")}`;

  templates[index] = {
    ...templates[index],
    badge_overlay_path: overlayUrl
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

    // Detect Important Region using Gemini Vision
    let importantRegion = null;
    if (geminiClient) {
      try {
        console.log("[SmartCrop] Detecting important region via Gemini...");
        const imageBuffer = await fs.readFile(file.path);
        const imageBase64 = imageBuffer.toString('base64');

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

        const parsed = JSON.parse(response.text || "{}");
        if (parsed.ymin !== undefined) {
          importantRegion = parsed;
          console.log("[SmartCrop] Region detected:", importantRegion);
        }
      } catch (geminiErr) {
        console.error("[SmartCrop] Gemini detection failed, falling back to center-crop:", geminiErr.message);
      }
    }

    // Output filename
    const ext = ".jpg"; // Force JPG for compression
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

// ---- 启动 ----
ensureDataFiles().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend server is running on http://localhost:${PORT}`);
  });
});
