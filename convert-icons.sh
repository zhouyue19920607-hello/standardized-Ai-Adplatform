#!/bin/bash

# 图标转换脚本
# 将icon.png转换为各平台所需格式

set -e

echo "========================================="
echo "应用图标转换工具"
echo "========================================="

ICON_DIR="electron"
SOURCE_PNG="$ICON_DIR/icon.png"

# 检查源文件
if [ ! -f "$SOURCE_PNG" ]; then
    echo "错误: 未找到 $SOURCE_PNG"
    echo "请先将512x512的PNG图标放到electron/icon.png"
    exit 1
fi

echo "源文件: $SOURCE_PNG"
echo ""

# 1. 生成Windows ICO
echo "生成Windows图标 (icon.ico)..."
if command -v convert &> /dev/null; then
    # 使用ImageMagick
    convert "$SOURCE_PNG" -define icon:auto-resize=256,128,64,48,32,16 "$ICON_DIR/icon.ico"
    echo "✓ icon.ico 已生成"
else
    echo "⚠ ImageMagick未安装，跳过ICO生成"
    echo "  可以使用在线工具: https://convertio.co/png-ico/"
fi

# 2. 生成macOS ICNS
echo ""
echo "生成macOS图标 (icon.icns)..."

# 创建临时目录
ICONSET_DIR="$ICON_DIR/icon.iconset"
mkdir -p "$ICONSET_DIR"

# 生成各种尺寸
sips -z 16 16     "$SOURCE_PNG" --out "$ICONSET_DIR/icon_16x16.png"
sips -z 32 32     "$SOURCE_PNG" --out "$ICONSET_DIR/icon_16x16@2x.png"
sips -z 32 32     "$SOURCE_PNG" --out "$ICONSET_DIR/icon_32x32.png"
sips -z 64 64     "$SOURCE_PNG" --out "$ICONSET_DIR/icon_32x32@2x.png"
sips -z 128 128   "$SOURCE_PNG" --out "$ICONSET_DIR/icon_128x128.png"
sips -z 256 256   "$SOURCE_PNG" --out "$ICONSET_DIR/icon_128x128@2x.png"
sips -z 256 256   "$SOURCE_PNG" --out "$ICONSET_DIR/icon_256x256.png"
sips -z 512 512   "$SOURCE_PNG" --out "$ICONSET_DIR/icon_256x256@2x.png"
sips -z 512 512   "$SOURCE_PNG" --out "$ICONSET_DIR/icon_512x512.png"
cp "$SOURCE_PNG" "$ICONSET_DIR/icon_512x512@2x.png"

# 转换为icns
iconutil -c icns "$ICONSET_DIR" -o "$ICON_DIR/icon.icns"

# 清理临时文件
rm -rf "$ICONSET_DIR"

echo "✓ icon.icns 已生成"

# 3. Linux使用PNG即可
echo ""
echo "✓ Linux图标 (icon.png) 已存在"

echo ""
echo "========================================="
echo "图标转换完成！"
echo "========================================="
echo ""
echo "生成的文件:"
ls -lh "$ICON_DIR"/icon.*
echo ""
echo "现在可以打包应用了:"
echo "  ./build-electron.sh"
echo ""
