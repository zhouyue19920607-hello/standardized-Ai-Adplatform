from pydantic import BaseModel
from typing import Optional, Any, Dict
from datetime import datetime

# Template Schemas
class AdTemplateBase(BaseModel):
    name: str
    app: str
    category: str
    checked: bool = False
    dimensions: Optional[str] = None
    mask_path: Optional[str] = None
    splash_text: Optional[str] = None

class AdTemplateCreate(AdTemplateBase):
    id: str  # Allow setting ID manually or generate it

class AdTemplateUpdate(BaseModel):
    name: Optional[str] = None
    app: Optional[str] = None
    category: Optional[str] = None
    checked: Optional[bool] = None
    dimensions: Optional[str] = None
    mask_path: Optional[str] = None
    splash_text: Optional[str] = None

class AdTemplate(AdTemplateBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True

# Workflow Schemas
class ComfyWorkflowBase(BaseModel):
    name: str
    content: Dict[str, Any]
    thumbnail_path: Optional[str] = None
    version: int = 1

class ComfyWorkflowCreate(ComfyWorkflowBase):
    id: str

class ComfyWorkflowUpdate(BaseModel):
    name: Optional[str] = None
    content: Optional[Dict[str, Any]] = None
    thumbnail_path: Optional[str] = None
    version: Optional[int] = None

class ComfyWorkflow(ComfyWorkflowBase):
    id: str
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True
