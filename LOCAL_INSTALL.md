# AI广告平台 - 本地安装指南

让其他用户在自己的电脑上运行AI广告平台。

---

## 方案对比

| 方案 | 适用场景 | 优点 | 缺点 |
|------|---------|------|------|
| **方案1：源码安装** | 开发者、技术用户 | 完全控制、可定制 | 需要安装环境 |
| **方案2：Docker** | 所有用户 | 一键启动、环境隔离 | 需要安装Docker |
| **方案3：桌面应用** | 普通用户 | 双击运行、无需配置 | 需要打包 |

---

## 方案1：源码安装（推荐给技术用户）

### 系统要求

- **操作系统**：Windows 10/11、macOS 10.15+、Linux
- **Node.js**：18.0 或更高版本
- **Python**：3.10 或更高版本
- **磁盘空间**：至少 2GB

### 安装步骤

#### 第1步：安装Node.js

**Windows/Mac**：
- 访问 [nodejs.org](https://nodejs.org/)
- 下载并安装 LTS 版本

**验证安装**：
```bash
node --version  # 应显示 v18.x.x 或更高
npm --version
```

#### 第2步：安装Python

**Windows**：
- 访问 [python.org](https://www.python.org/downloads/)
- 下载并安装 Python 3.10+
- ⚠️ 安装时勾选 "Add Python to PATH"

**Mac**（使用Homebrew）：
```bash
brew install python@3.10
```

**验证安装**：
```bash
python3 --version  # 应显示 3.10.x 或更高
pip3 --version
```

#### 第3步：下载项目代码

**方式A：使用Git**（推荐）
```bash
git clone https://github.com/你的用户名/ai-platform.git
cd ai-platform
```

**方式B：下载ZIP**
1. 访问项目GitHub页面
2. 点击 "Code" → "Download ZIP"
3. 解压到任意目录

#### 第4步：安装依赖

```bash
# 安装前端依赖
npm install

# 安装后端依赖
cd backend
pip3 install -r requirements.txt
cd ..
```

#### 第5步：启动应用

**方式A：一键启动**（推荐）
```bash
npm run dev
```

这会同时启动前端和后端服务。

**方式B：分别启动**

终端1 - 启动前端：
```bash
npm run dev
```

终端2 - 启动后端：
```bash
npm run server
```

#### 第6步：访问应用

打开浏览器访问：`http://localhost:5173`

---

## 方案2：Docker安装（推荐给所有用户）

### 系统要求

- **Docker Desktop**：最新版本
- **磁盘空间**：至少 3GB

### 安装步骤

#### 第1步：安装Docker Desktop

**Windows/Mac**：
- 访问 [docker.com](https://www.docker.com/products/docker-desktop/)
- 下载并安装 Docker Desktop
- 启动 Docker Desktop

**验证安装**：
```bash
docker --version
docker-compose --version
```

#### 第2步：下载项目

同方案1的第3步

#### 第3步：启动应用

```bash
docker-compose up -d
```

首次启动会自动下载镜像和构建，需要几分钟。

#### 第4步：访问应用

打开浏览器访问：`http://localhost:3000`

#### 管理命令

```bash
# 查看运行状态
docker-compose ps

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down

# 重启服务
docker-compose restart
```

---

## 方案3：桌面应用（最简单）

### 下载安装包

访问 [Releases页面](https://github.com/你的用户名/ai-platform/releases)，下载对应系统的安装包：

- **Windows**：`AI-Platform-Setup-x.x.x.exe`
- **macOS**：`AI-Platform-x.x.x.dmg`
- **Linux**：`AI-Platform-x.x.x.AppImage`

### 安装

**Windows**：
1. 双击 `.exe` 文件
2. 按照向导完成安装
3. 从开始菜单启动应用

**macOS**：
1. 打开 `.dmg` 文件
2. 拖动应用到 Applications 文件夹
3. 从启动台打开应用

**Linux**：
```bash
chmod +x AI-Platform-x.x.x.AppImage
./AI-Platform-x.x.x.AppImage
```

---

## 配置ComfyUI（可选）

如果要使用AI生成功能，需要配置ComfyUI：

### 方式1：使用本地ComfyUI

1. 安装并启动ComfyUI
2. 在项目根目录创建 `backend/.env` 文件：
   ```env
   COMFYUI_API_URL=http://127.0.0.1:8188
   ```
3. 重启应用

### 方式2：使用云端ComfyUI

1. 获取ComfyUI API地址和密钥
2. 在 `backend/.env` 文件中配置：
   ```env
   COMFYUI_API_URL=https://your-comfyui-api.com
   COMFYUI_API_KEY=your-api-key
   ```
3. 重启应用

---

## 常见问题

### Q: 启动失败，提示端口被占用

**A**: 修改端口配置

编辑 `vite.config.ts`，修改前端端口：
```typescript
server: {
  port: 5174  // 改为其他端口
}
```

编辑 `backend/server.mjs`，修改后端端口：
```javascript
const PORT = 5001;  // 改为其他端口
```

### Q: Windows上Python命令不可用

**A**: 使用 `py` 命令代替 `python3`：
```bash
py --version
py -m pip install -r requirements.txt
```

### Q: npm install 很慢

**A**: 使用国内镜像：
```bash
npm config set registry https://registry.npmmirror.com
npm install
```

### Q: 上传图片失败

**A**: 检查 `backend/assets` 目录权限：
```bash
# Mac/Linux
chmod -R 777 backend/assets

# Windows
# 右键 assets 文件夹 → 属性 → 安全 → 编辑权限
```

---

## 更新应用

### 源码安装

```bash
git pull origin main
npm install
cd backend && pip3 install -r requirements.txt
```

### Docker安装

```bash
docker-compose pull
docker-compose up -d
```

### 桌面应用

下载最新版本安装包，覆盖安装即可。

---

## 卸载

### 源码安装

直接删除项目文件夹即可。

### Docker安装

```bash
docker-compose down -v
docker rmi ai-platform-frontend ai-platform-backend
```

### 桌面应用

**Windows**：控制面板 → 程序和功能 → 卸载
**macOS**：从 Applications 文件夹删除
**Linux**：删除 AppImage 文件

---

## 分享给其他用户

### 方式1：分享源码

1. 将项目上传到GitHub
2. 分享仓库链接
3. 用户按照本文档安装

### 方式2：分享安装包

1. 打包桌面应用（见下方）
2. 上传到网盘或GitHub Releases
3. 分享下载链接

### 方式3：分享Docker镜像

```bash
# 构建镜像
docker-compose build

# 导出镜像
docker save -o ai-platform.tar ai-platform-frontend ai-platform-backend

# 分享 ai-platform.tar 文件
# 其他用户导入：
docker load -i ai-platform.tar
docker-compose up -d
```

---

## 获取帮助

- **文档**：查看 [DEPLOYMENT.md](./DEPLOYMENT.md)
- **问题反馈**：提交 GitHub Issue
- **讨论交流**：加入 Discussions
