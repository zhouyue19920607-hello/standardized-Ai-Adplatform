from fastapi import APIRouter

router = APIRouter()

@router.post("/analyze-color")
async def analyze_color():
    # TODO: Implement Gemini integration here
    return {"hexColor": "#2563EB", "iconName": "star"}
