from fastapi import APIRouter, Body
from .color_utils import extract_color_from_base64
from pydantic import BaseModel

router = APIRouter()

class ImageAnalysisRequest(BaseModel):
    imageBase64: str

@router.post("/analyze-color")
async def analyze_color(request: ImageAnalysisRequest):
    """
    分析上传图片底部的主色调
    """
    hex_color = extract_color_from_base64(request.imageBase64)
    return {"hexColor": hex_color, "iconName": "star"}
