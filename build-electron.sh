#!/bin/bash

# Electron桌面应用打包脚本

set -e

echo "========================================="
echo "AI广告平台桌面应用打包"
echo "========================================="

# 颜色定义
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo -e "${YELLOW}步骤 1/4: 清理旧文件...${NC}"
rm -rf dist release

echo -e "${GREEN}✓ 清理完成${NC}"

echo -e "${YELLOW}步骤 2/4: 构建前端...${NC}"
npm run build

echo -e "${GREEN}✓ 前端构建完成${NC}"

echo -e "${YELLOW}步骤 3/4: 打包Electron应用...${NC}"

# 检测操作系统
if [[ "$OSTYPE" == "darwin"* ]]; then
    echo "检测到macOS系统，打包macOS应用..."
    npm run electron:build:mac
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    echo "检测到Linux系统，打包Linux应用..."
    npm run electron:build:linux
elif [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    echo "检测到Windows系统，打包Windows应用..."
    npm run electron:build:win
else
    echo -e "${RED}未知操作系统，使用默认打包...${NC}"
    npm run electron:build
fi

echo -e "${GREEN}✓ Electron应用打包完成${NC}"

echo -e "${YELLOW}步骤 4/4: 显示打包结果...${NC}"

if [ -d "release" ]; then
    echo ""
    echo "安装包位置: ./release/"
    ls -lh release/
    
    FILE_SIZE=$(du -sh release/ | cut -f1)
    echo ""
    echo "总大小: $FILE_SIZE"
else
    echo -e "${RED}错误: release目录不存在${NC}"
    exit 1
fi

echo ""
echo "========================================="
echo -e "${GREEN}打包完成！${NC}"
echo "========================================="
echo ""
echo "下一步:"
echo "1. 测试安装包"
echo "2. 上传到GitHub Releases或网盘"
echo "3. 分享给用户"
echo ""
