from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import shutil
import os
import uuid
from ...core.database import get_db
from ...models.models import AdTemplate as TemplateModel
from ...schemas.schemas import AdTemplate, AdTemplateCreate, AdTemplateUpdate

router = APIRouter()

@router.get("/", response_model=List[AdTemplate])
def read_templates(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    templates = db.query(TemplateModel).offset(skip).limit(limit).all()
    return templates

@router.post("/", response_model=AdTemplate)
def create_template(template: AdTemplateCreate, db: Session = Depends(get_db)):
    db_template = TemplateModel(**template.dict())
    db.add(db_template)
    db.commit()
    db.refresh(db_template)
    return db_template

@router.put("/{template_id}", response_model=AdTemplate)
def update_template(template_id: str, template: AdTemplateUpdate, db: Session = Depends(get_db)):
    db_template = db.query(TemplateModel).filter(TemplateModel.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    update_data = template.dict(exclude_unset=True)
    for key, value in update_data.items():
        setattr(db_template, key, value)
    
    db.commit()
    db.refresh(db_template)
    return db_template

@router.delete("/{template_id}")
def delete_template(template_id: str, db: Session = Depends(get_db)):
    db_template = db.query(TemplateModel).filter(TemplateModel.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    db.delete(db_template)
    db.commit()
    return {"ok": True}

@router.post("/{template_id}/mask")
async def upload_mask(template_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    db_template = db.query(TemplateModel).filter(TemplateModel.id == template_id).first()
    if not db_template:
        raise HTTPException(status_code=404, detail="Template not found")
    
    # Ensure static/masks directory exists
    mask_dir = "backend/static/masks"
    os.makedirs(mask_dir, exist_ok=True)
    
    file_ext = os.path.splitext(file.filename)[1]
    filename = f"{template_id}_mask{file_ext}"
    file_path = os.path.join(mask_dir, filename)
    
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        await out_file.write(content)
        
    # Update relative path for frontend access
    relative_path = f"/static/masks/{filename}"
    db_template.mask_path = relative_path
    db.commit()
    
    return {"mask_path": relative_path}
