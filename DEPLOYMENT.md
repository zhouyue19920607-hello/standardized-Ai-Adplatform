# 部署快速开始指南

## 前提条件

- ✅ 已购买阿里云ECS服务器（Ubuntu 20.04，2核4GB以上）
- ✅ 已配置安全组，开放端口：22、80、443
- ✅ 已获取服务器IP地址和root密码

---

## 快速部署（3步完成）

### 第1步：在本地Mac上打包

```bash
cd /Users/meitu/Desktop/standardized-Ai-Aidplatform

# 赋予执行权限
chmod +x build-package.sh

# 执行打包
./build-package.sh
```

打包完成后，会在 `~/ai-platform.tar.gz` 生成部署包。

### 第2步：上传到服务器

```bash
# 替换为你的服务器IP
scp ~/ai-platform.tar.gz root@你的服务器IP:/root/
```

### 第3步：在服务器上部署

SSH登录到服务器：

```bash
ssh root@你的服务器IP
```

执行以下命令：

```bash
# 解压部署包
cd /root
tar -xzf ai-platform.tar.gz
cd ai-platform-deploy

# 赋予执行权限
chmod +x deploy.sh

# 执行部署
./deploy.sh
```

部署脚本会自动完成：
- ✅ 创建应用目录
- ✅ 安装Python依赖
- ✅ 配置文件权限
- ✅ 启动后端服务（PM2）
- ✅ 配置Nginx

---

## 访问应用

部署完成后，在浏览器访问：

```
http://你的服务器IP
```

---

## 首次部署后的配置

### 配置ComfyUI（如果使用）

编辑环境变量：

```bash
cd /var/www/ai-platform/backend
nano .env
```

修改以下内容：

```env
COMFYUI_API_URL=http://你的ComfyUI地址:8188
COMFYUI_API_KEY=你的API密钥
```

重启后端服务：

```bash
pm2 restart ai-platform-backend
```

### 配置域名（可选）

如果你有域名，修改Nginx配置：

```bash
nano /etc/nginx/sites-available/ai-platform
```

将 `server_name` 改为你的域名：

```nginx
server_name yourdomain.com www.yourdomain.com;
```

重载Nginx：

```bash
nginx -t
systemctl reload nginx
```

---

## 常用维护命令

### 查看服务状态

```bash
pm2 status
```

### 查看后端日志

```bash
pm2 logs ai-platform-backend
```

### 重启后端服务

```bash
pm2 restart ai-platform-backend
```

### 查看Nginx日志

```bash
tail -f /var/log/nginx/ai-platform-access.log
tail -f /var/log/nginx/ai-platform-error.log
```

### 更新代码

在本地重新打包后：

```bash
# 1. 上传新包
scp ~/ai-platform.tar.gz root@服务器IP:/root/

# 2. 在服务器上
cd /root
tar -xzf ai-platform.tar.gz
cd ai-platform-deploy
./deploy.sh
```

---

## 故障排查

### 无法访问网站

```bash
# 检查Nginx状态
systemctl status nginx

# 检查后端服务
pm2 status

# 查看错误日志
pm2 logs ai-platform-backend --err
```

### 文件上传失败

```bash
# 检查目录权限
ls -la /var/www/ai-platform/backend/assets

# 修复权限
chmod -R 777 /var/www/ai-platform/backend/assets
```

### 端口被占用

```bash
# 查看端口占用
netstat -tlnp | grep 5000

# 如需要，杀掉占用进程
kill -9 进程ID
```

---

## 安全建议

1. **修改SSH端口**（可选）
2. **配置防火墙**，只允许必要的IP访问
3. **启用HTTPS**（使用Let's Encrypt免费证书）
4. **定期备份数据**（assets目录和数据库）
5. **设置强密码**

---

## 获取帮助

如遇到问题，请检查：
1. 服务器日志：`pm2 logs`
2. Nginx日志：`/var/log/nginx/`
3. 系统资源：`htop` 或 `free -h`
