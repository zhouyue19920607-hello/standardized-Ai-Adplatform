from PIL import Image
import io
from collections import Counter


def extract_bottom_color(image_bytes: bytes) -> str:
    """
    从图片底部区域提取主色调
    
    Args:
        image_bytes: 图片的字节数据
        
    Returns:
        十六进制颜色值,例如 "#FF5733"
    """
    img = Image.open(io.BytesIO(image_bytes))
    
    # 获取图片尺寸
    width, height = img.size
    
    # 定义底部区域(底部20%)
    bottom_height = int(height * 0.2)
    bottom_region = img.crop((0, height - bottom_height, width, height))
    
    # 缩小图片以提高性能
    bottom_region = bottom_region.resize((100, 20))
    
    # 转换为RGB模式
    if bottom_region.mode != 'RGB':
        bottom_region = bottom_region.convert('RGB')
    
    # 获取所有像素
    pixels = list(bottom_region.getdata())
    
    # 统计颜色频率
    color_counter = Counter(pixels)
    
    # 获取最常见的颜色
    most_common_color = color_counter.most_common(1)[0][0]
    
    # 转换为十六进制
    hex_color = '#{:02x}{:02x}{:02x}'.format(*most_common_color)
    
    return hex_color
