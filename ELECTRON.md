# Electron桌面应用使用指南

## 开发模式

在开发过程中测试Electron应用：

```bash
npm run electron:dev
```

这会同时启动：
1. Vite开发服务器（前端）
2. Node.js后端服务
3. Electron应用窗口

## 打包应用

### 自动打包（推荐）

使用打包脚本，会自动检测操作系统并打包对应平台：

```bash
chmod +x build-electron.sh
./build-electron.sh
```

### 手动打包

**打包所有平台**（仅在macOS上可用）：
```bash
npm run electron:build
```

**打包Windows应用**：
```bash
npm run electron:build:win
```

**打包macOS应用**：
```bash
npm run electron:build:mac
```

**打包Linux应用**：
```bash
npm run electron:build:linux
```

## 打包产物

打包完成后，安装包位于 `release/` 目录：

- **Windows**: `AI广告平台 Setup 1.0.0.exe`
- **macOS**: `AI广告平台-1.0.0.dmg`
- **Linux**: `AI广告平台-1.0.0.AppImage`

## 应用图标

需要准备以下格式的图标文件：

- `electron/icon.ico` - Windows图标（256x256）
- `electron/icon.icns` - macOS图标（512x512）
- `electron/icon.png` - Linux图标（512x512）

可以使用在线工具转换：
- [iConvert Icons](https://iconverticons.com/)
- [CloudConvert](https://cloudconvert.com/)

## 测试安装包

### Windows
双击 `.exe` 文件安装并运行

### macOS
1. 打开 `.dmg` 文件
2. 拖动应用到 Applications 文件夹
3. 从启动台打开

如果提示"应用已损坏"，执行：
```bash
xattr -cr /Applications/AI广告平台.app
```

### Linux
```bash
chmod +x AI广告平台-1.0.0.AppImage
./AI广告平台-1.0.0.AppImage
```

## 分发应用

### 方式1：GitHub Releases

1. 创建新版本标签：
   ```bash
   git tag v1.0.0
   git push origin v1.0.0
   ```

2. 在GitHub上创建Release
3. 上传 `release/` 目录下的安装包

### 方式2：网盘分享

上传到百度网盘、阿里云盘等，分享下载链接

### 方式3：自建下载服务器

使用Nginx提供HTTP下载

## 常见问题

### Q: 打包失败，提示找不到模块

**A**: 确保所有依赖都在 `dependencies` 中，而不是 `devDependencies`

### Q: 应用启动慢

**A**: 
1. 后端启动需要时间，可以增加等待时间
2. 添加启动画面（Splash Screen）

### Q: Windows Defender报毒

**A**: 
1. 需要代码签名证书
2. 或者添加到白名单

### Q: macOS无法打开应用

**A**: 
1. 需要Apple开发者账号进行代码签名
2. 或者用户执行 `xattr -cr` 命令

## 优化建议

### 减小安装包体积

1. 排除不必要的文件
2. 使用asar打包
3. 压缩资源

### 添加自动更新

安装 `electron-updater`：

```bash
npm install electron-updater
```

在主进程中配置：

```javascript
const { autoUpdater } = require('electron-updater');

app.whenReady().then(() => {
  autoUpdater.checkForUpdatesAndNotify();
});
```

## 技术支持

如遇到问题，请查看：
- [Electron文档](https://www.electronjs.org/docs)
- [electron-builder文档](https://www.electron.build/)
