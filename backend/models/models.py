from sqlalchemy import Column, Integer, String, Boolean, JSON, DateTime
from datetime import datetime
from ..core.database import Base

class AdTemplate(Base):
    __tablename__ = "ad_templates"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    app = Column(String)
    category = Column(String)
    checked = Column(Boolean, default=False)
    dimensions = Column(String, nullable=True)
    mask_path = Column(String, nullable=True)
    splash_text = Column(String, nullable=True)
    workflow_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class ComfyWorkflow(Base):
    __tablename__ = "comfy_workflows"

    id = Column(String, primary_key=True, index=True)
    name = Column(String, index=True)
    content = Column(JSON)  # Store the workflow JSON structure
    thumbnail_path = Column(String, nullable=True)
    version = Column(Integer, default=1)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
