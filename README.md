# Standardized AI Aid Platform (Fullstack)

## 简介
这是一个 React + FastAPI 的全栈应用，用于标准化 AI 广告素材生成。

## 环境要求
- Node.js (推荐 18+)
- Python 3.10+

## 快速开始

### 1. 安装与初始化
在项目根目录下执行：

```bash
# 安装前端依赖
npm install

# 创建 Python 虚拟环境并安装后端依赖
python3 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt

# 初始化数据库 (如果是第一次运行)
python3 backend/seed.py
```

### 2. 启动服务

你需要打开两个终端窗口分别启动前后端。

**终端 1 (后端):**
```bash
source venv/bin/activate
uvicorn backend.main:app --reload --port 8001
```

**终端 2 (前端):**
```bash
npm run dev
```

### 3. 使用
- 访问 **http://localhost:3000** 使用应用。
- 访问 **http://localhost:8001/docs** 查看 API 文档。
- 点击界面上的**设置图标**打开管理后台。
- 在管理后台可以管理模版尺寸、上传 Mask 遮罩，以及管理 ComfyUI 工作流。
