from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import json
import os
import aiofiles
from ...core.database import get_db
from ...models.models import ComfyWorkflow as WorkflowModel
from ...schemas.schemas import ComfyWorkflow, ComfyWorkflowCreate, ComfyWorkflowUpdate

router = APIRouter()

@router.get("/", response_model=List[ComfyWorkflow])
def read_workflows(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    workflows = db.query(WorkflowModel).offset(skip).limit(limit).all()
    return workflows

@router.post("/", response_model=ComfyWorkflow)
def create_workflow(workflow: ComfyWorkflowCreate, db: Session = Depends(get_db)):
    db_workflow = WorkflowModel(**workflow.dict())
    db.add(db_workflow)
    db.commit()
    db.refresh(db_workflow)
    return db_workflow

@router.post("/upload")
async def upload_workflow_file(file: UploadFile = File(...), name: str = None, db: Session = Depends(get_db)):
    content = await file.read()
    try:
        json_content = json.loads(content)
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid JSON file")

    workflow_id = str(json_content.get("id", uuid.uuid4()))
    workflow_name = name or file.filename
    
    # Check if exists
    existing = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if existing:
        existing.content = json_content
        existing.version += 1
        db.commit()
        db.refresh(existing)
        return existing
    
    new_workflow = WorkflowModel(
        id=workflow_id,
        name=workflow_name,
        content=json_content,
        version=1
    )
    db.add(new_workflow)
    db.commit()
    db.refresh(new_workflow)
    return new_workflow

@router.delete("/{workflow_id}")
def delete_workflow(workflow_id: str, db: Session = Depends(get_db)):
    db_workflow = db.query(WorkflowModel).filter(WorkflowModel.id == workflow_id).first()
    if not db_workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    
    db.delete(db_workflow)
    db.commit()
    return {"ok": True}
import uuid
