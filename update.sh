#!/bin/bash

# AI广告平台 一键更新脚本
# 使用方法：在服务器上运行 bash /var/www/update.sh

set -e

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

SRC_DIR="/var/www/ai-platform/standardized-Ai-Adplatform"
DIST_DIR="/var/www/ai-platform/dist"

echo "========================================="
echo "  AI广告平台 更新脚本"
echo "  $(date '+%Y-%m-%d %H:%M:%S')"
echo "========================================="

# 1. 拉取最新代码
echo -e "${YELLOW}[1/4] 拉取最新代码...${NC}"
cd $SRC_DIR
git pull origin master
echo -e "${GREEN}✓ 代码已更新${NC}"

# 2. 安装依赖（如有新增依赖）
echo -e "${YELLOW}[2/4] 检查依赖...${NC}"
npm install
echo -e "${GREEN}✓ 依赖已就绪${NC}"

# 3. 构建前端
echo -e "${YELLOW}[3/4] 构建前端...${NC}"
npm run build
cp -r dist/* $DIST_DIR/
chmod -R 755 $DIST_DIR/
chown -R www-data:www-data $DIST_DIR/ 2>/dev/null || true
echo -e "${GREEN}✓ 前端构建完成${NC}"

# NOTE: 确保上传目录始终存在且权限正确，防止上传功能失效
echo -e "${YELLOW}[*] 检查上传目录...${NC}"
mkdir -p $SRC_DIR/backend/storage/masks
mkdir -p $SRC_DIR/backend/storage/workflows
mkdir -p $SRC_DIR/backend/storage/badges
chmod -R 755 $SRC_DIR/backend/storage
chown -R www-data:www-data $SRC_DIR/backend/storage 2>/dev/null || true
echo -e "${GREEN}✓ 上传目录已就绪${NC}"

# 4. 重启后端
echo -e "${YELLOW}[4/4] 重启后端服务...${NC}"
pm2 restart all
echo -e "${GREEN}✓ 后端已重启${NC}"

echo ""
echo "========================================="
echo -e "${GREEN}✓ 更新完成！访问 http://saapmeitu.cn${NC}"
echo "========================================="
