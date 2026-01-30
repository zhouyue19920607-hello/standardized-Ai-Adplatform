from PIL import Image
import io
import base64
from collections import Counter

def extract_color_from_base64(base64_str: str) -> str:
    """
    从 base64 图片的底部 20% 区域提取主色调
    """
    try:
        image_data = base64.b64decode(base64_str)
        img = Image.open(io.BytesIO(image_data))
        
        # 转换为 RGB 模式
        if img.mode != 'RGB':
            img = img.convert('RGB')
            
        width, height = img.size
        
        # 定义底部区域 (底部 20%)
        bottom_height = int(height * 0.2)
        bottom_region = img.crop((0, height - bottom_height, width, height))
        
        # 缩小图片以提高统计速度
        bottom_region = bottom_region.resize((50, 50), Image.NEAREST)
        
        # 获取像素
        pixels = list(bottom_region.getdata())
        
        # 统计最常见的颜色
        color_counts = Counter(pixels)
        most_common = color_counts.most_common(1)[0][0]
        
        # 转换为 Hex
        return '#{:02x}{:02x}{:02x}'.format(*most_common)
    except Exception as e:
        print(f"Error extracting color: {e}")
        return "#2563EB"
