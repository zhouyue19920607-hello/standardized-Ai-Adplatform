from fastapi import APIRouter, UploadFile, File, HTTPException
from .color_utils import extract_bottom_color

router = APIRouter()

@router.post("/analyze-color")
async def analyze_color(file: UploadFile = File(...)):
    """
    分析上传图片底部的主色调
    """
    try:
        content = await file.read()
        hex_color = extract_bottom_color(content)
        return {"hexColor": hex_color, "iconName": "star"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"颜色提取失败: {str(e)}")
