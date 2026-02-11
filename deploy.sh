#!/bin/bash

# AI广告平台部署脚本
# 在阿里云服务器上运行此脚本进行部署

set -e  # 遇到错误立即退出

echo "========================================="
echo "AI广告平台部署脚本"
echo "========================================="

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# 配置变量
APP_DIR="/var/www/ai-platform"
BACKEND_DIR="$APP_DIR/backend"
FRONTEND_DIR="$APP_DIR/dist"

echo -e "${YELLOW}步骤 1/7: 检查系统环境...${NC}"
# 检查是否为root用户
if [ "$EUID" -ne 0 ]; then 
    echo -e "${RED}请使用root用户运行此脚本${NC}"
    exit 1
fi

echo -e "${GREEN}✓ 系统检查通过${NC}"

echo -e "${YELLOW}步骤 2/7: 创建应用目录...${NC}"
mkdir -p $APP_DIR
mkdir -p $BACKEND_DIR/assets
mkdir -p $BACKEND_DIR/data
mkdir -p /var/log/pm2

echo -e "${GREEN}✓ 目录创建完成${NC}"

echo -e "${YELLOW}步骤 3/7: 解压部署包...${NC}"
if [ -f "/root/ai-platform.tar.gz" ]; then
    tar -xzf /root/ai-platform.tar.gz -C /tmp/
    cp -r /tmp/deploy-package/* $APP_DIR/
    rm -rf /tmp/deploy-package
    echo -e "${GREEN}✓ 部署包解压完成${NC}"
else
    echo -e "${RED}错误: 未找到部署包 /root/ai-platform.tar.gz${NC}"
    echo "请先上传部署包到服务器"
    exit 1
fi

echo -e "${YELLOW}步骤 4/7: 安装Python依赖...${NC}"
cd $BACKEND_DIR
if [ -f "requirements.txt" ]; then
    pip3 install -r requirements.txt
    echo -e "${GREEN}✓ Python依赖安装完成${NC}"
else
    echo -e "${YELLOW}! 未找到requirements.txt，跳过依赖安装${NC}"
fi

echo -e "${YELLOW}步骤 5/7: 设置文件权限...${NC}"
chmod -R 755 $APP_DIR
chmod -R 777 $BACKEND_DIR/assets
chmod -R 777 $BACKEND_DIR/data

echo -e "${GREEN}✓ 文件权限设置完成${NC}"

echo -e "${YELLOW}步骤 6/7: 配置并启动后端服务...${NC}"
# 检查PM2是否安装
if ! command -v pm2 &> /dev/null; then
    echo -e "${YELLOW}PM2未安装，正在安装...${NC}"
    npm install -g pm2
fi

# 停止旧服务（如果存在）
pm2 delete ai-platform-backend 2>/dev/null || true

# 启动新服务
cd $BACKEND_DIR
pm2 start ecosystem.config.js
pm2 save
pm2 startup

echo -e "${GREEN}✓ 后端服务启动完成${NC}"

echo -e "${YELLOW}步骤 7/7: 配置Nginx...${NC}"
# 复制Nginx配置
if [ -f "$APP_DIR/nginx.conf" ]; then
    cp $APP_DIR/nginx.conf /etc/nginx/sites-available/ai-platform
    ln -sf /etc/nginx/sites-available/ai-platform /etc/nginx/sites-enabled/ai-platform
    
    # 测试Nginx配置
    nginx -t
    
    # 重载Nginx
    systemctl reload nginx
    
    echo -e "${GREEN}✓ Nginx配置完成${NC}"
else
    echo -e "${YELLOW}! 未找到nginx.conf，请手动配置Nginx${NC}"
fi

echo ""
echo "========================================="
echo -e "${GREEN}部署完成！${NC}"
echo "========================================="
echo ""
echo "访问地址: http://$(curl -s ifconfig.me)"
echo ""
echo "常用命令:"
echo "  查看后端日志: pm2 logs ai-platform-backend"
echo "  重启后端服务: pm2 restart ai-platform-backend"
echo "  查看服务状态: pm2 status"
echo "  查看Nginx日志: tail -f /var/log/nginx/ai-platform-access.log"
echo ""
echo "========================================="
