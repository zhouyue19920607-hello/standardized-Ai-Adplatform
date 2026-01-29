from fastapi import APIRouter
from .endpoints import templates, workflows, utils

api_router = APIRouter()

api_router.include_router(templates.router, prefix="/templates", tags=["templates"])
api_router.include_router(workflows.router, prefix="/workflows", tags=["workflows"])
api_router.include_router(utils.router, prefix="/utils", tags=["utils"])
