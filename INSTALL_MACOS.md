# AI广告平台 - macOS安装指南

## 📦 安装步骤

### 1. 下载安装包

下载 `AI广告平台-1.0.0-arm64.dmg` 文件

### 2. 安装应用

1. 双击打开 DMG 文件
2. 将"AI广告平台"拖动到 Applications 文件夹
3. 关闭 DMG 窗口

---

## ⚠️ 首次运行 - 重要！

由于应用未经过Apple公证，首次运行需要特殊步骤：

### 方法1：使用终端命令（推荐）

**打开终端**（在"应用程序" → "实用工具"中），执行以下命令：

```bash
sudo spctl --master-disable
```

输入你的Mac密码，然后：

```bash
xattr -cr /Applications/AI广告平台.app
```

再次尝试打开应用。

使用完成后，建议重新启用Gatekeeper：

```bash
sudo spctl --master-enable
```

---

### 方法2：临时禁用Gatekeeper

**步骤1**：打开终端，执行：

```bash
sudo spctl --master-disable
```

**步骤2**：打开"系统设置" → "隐私与安全性"

**步骤3**：在"安全性"部分，选择"任何来源"

**步骤4**：打开应用

**步骤5**：使用完成后，重新启用Gatekeeper：

```bash
sudo spctl --master-enable
```

---

### 方法3：修改应用权限

```bash
# 移除隔离属性
xattr -d com.apple.quarantine /Applications/AI广告平台.app

# 移除所有扩展属性
xattr -cr /Applications/AI广告平台.app

# 修改权限
chmod -R 755 /Applications/AI广告平台.app
```

---

### 方法4：从源码直接运行（开发者选项）

如果上述方法都不行，可以直接运行开发版本：

```bash
cd /Users/meitu/Desktop/standardized-Ai-Aidplatform
npm run electron:dev
```

这会启动应用的开发版本，功能完全相同。

---

## 🔍 故障排查

### 问题1：提示"无法验证开发者"

**解决方案**：使用方法1或方法2

### 问题2：提示"应用已损坏"

**解决方案**：

```bash
sudo xattr -cr /Applications/AI广告平台.app
sudo chmod -R 755 /Applications/AI广告平台.app
```

### 问题3：应用闪退或无法启动

**检查日志**：

```bash
# 查看应用日志
log show --predicate 'process == "AI广告平台"' --last 5m
```

**或者运行开发版本查看详细错误**：

```bash
cd /Users/meitu/Desktop/standardized-Ai-Aidplatform
npm run electron:dev
```

---

## 💡 为什么会出现这些问题？

macOS的Gatekeeper安全机制会阻止未经Apple公证的应用。

**要彻底解决，需要**：

1. 购买Apple开发者账号（$99/年）
2. 使用开发者证书签名
3. 提交Apple公证

**对于个人使用或内部分发**，使用上述方法即可正常运行。

---

## ✅ 成功运行后

应用会自动：
1. 启动后端服务（端口5000）
2. 打开应用窗口
3. 加载前端界面

你可以开始：
- 选择广告模版
- 上传图片
- 生成广告素材
- 下载结果

---

## 🆘 仍然无法运行？

如果以上所有方法都不行，请使用开发模式：

```bash
# 1. 打开终端
# 2. 进入项目目录
cd /Users/meitu/Desktop/standardized-Ai-Aidplatform

# 3. 运行开发版本
npm run electron:dev
```

这是最可靠的运行方式，功能完全相同！

---

## 📞 获取帮助

如有问题，请提供以下信息：
- macOS版本
- 错误提示截图
- 终端错误日志
