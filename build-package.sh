#!/bin/bash

# 本地打包脚本
# 在Mac上运行此脚本，生成部署包

set -e

echo "========================================="
echo "AI广告平台打包脚本"
echo "========================================="

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY_DIR="$HOME/ai-platform-deploy"
PACKAGE_NAME="ai-platform.tar.gz"

echo -e "${YELLOW}步骤 1/5: 清理旧文件...${NC}"
rm -rf $DEPLOY_DIR
rm -f $HOME/$PACKAGE_NAME

echo -e "${GREEN}✓ 清理完成${NC}"

echo -e "${YELLOW}步骤 2/5: 构建前端...${NC}"
cd $PROJECT_DIR
npm install
npm run build

echo -e "${GREEN}✓ 前端构建完成${NC}"

echo -e "${YELLOW}步骤 3/5: 准备部署文件...${NC}"
mkdir -p $DEPLOY_DIR

# 复制前端构建文件
cp -r dist $DEPLOY_DIR/

# 复制后端文件
cp -r backend $DEPLOY_DIR/

# 复制配置文件
cp ecosystem.config.js $DEPLOY_DIR/
cp nginx.conf $DEPLOY_DIR/
cp deploy.sh $DEPLOY_DIR/

# 复制环境变量示例
cp backend/.env.example $DEPLOY_DIR/backend/

echo -e "${GREEN}✓ 文件准备完成${NC}"

echo -e "${YELLOW}步骤 4/5: 打包...${NC}"
cd $HOME
tar -czf $PACKAGE_NAME ai-platform-deploy/

FILE_SIZE=$(du -h $PACKAGE_NAME | cut -f1)
echo -e "${GREEN}✓ 打包完成 (大小: $FILE_SIZE)${NC}"

echo -e "${YELLOW}步骤 5/5: 清理临时文件...${NC}"
rm -rf $DEPLOY_DIR

echo -e "${GREEN}✓ 清理完成${NC}"

echo ""
echo "========================================="
echo -e "${GREEN}打包完成！${NC}"
echo "========================================="
echo ""
echo "部署包位置: $HOME/$PACKAGE_NAME"
echo ""
echo "下一步操作:"
echo "1. 上传到服务器:"
echo "   scp $HOME/$PACKAGE_NAME root@你的服务器IP:/root/"
echo ""
echo "2. 在服务器上执行:"
echo "   cd /root"
echo "   tar -xzf $PACKAGE_NAME"
echo "   cd ai-platform-deploy"
echo "   chmod +x deploy.sh"
echo "   ./deploy.sh"
echo ""
echo "========================================="
