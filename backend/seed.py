import sys
import os

# Add the parent directory to sys.path to resolve imports
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.dirname(current_dir))

from backend.core.database import SessionLocal, engine, Base
from backend.models.models import AdTemplate

# Initialize DB
Base.metadata.create_all(bind=engine)

INITIAL_TEMPLATES = [
  # 美图秀秀
  { "id": 'mt-s-1', "app": '美图秀秀', "category": '开屏', "name": '动态开屏', "checked": False },
  { "id": 'mt-s-2', "app": '美图秀秀', "category": '开屏', "name": '上滑开屏', "checked": False },
  { "id": 'mt-s-3', "app": '美图秀秀', "category": '开屏', "name": '扭动开屏', "checked": False },
  { "id": 'mt-s-4', "app": '美图秀秀', "category": '开屏', "name": '气泡开屏', "checked": False },
  { "id": 'mt-f-1', "app": '美图秀秀', "category": '焦点视窗', "name": '动态焦点视窗', "checked": True },
  { "id": 'mt-f-2', "app": '美图秀秀', "category": '焦点视窗', "name": '静态焦点视窗', "checked": True },
  { "id": 'mt-f-3', "app": '美图秀秀', "category": '焦点视窗', "name": '沉浸式焦点视窗', "checked": False },
  { "id": 'mt-fe-1', "app": '美图秀秀', "category": '信息流', "name": '一键配方图文', "checked": False },
  { "id": 'mt-ib-1', "app": '美图秀秀', "category": 'icon/banner', "name": '热推第三位', "checked": False },
  { "id": 'mt-ib-2', "app": '美图秀秀', "category": 'icon/banner', "name": '热搜词第四位', "checked": False },
  { "id": 'mt-ib-3', "app": '美图秀秀', "category": 'icon/banner', "name": '话题页背景板', "checked": False },
  { "id": 'mt-ib-4', "app": '美图秀秀', "category": 'icon/banner', "name": '话题页banner', "checked": False },
  { "id": 'mt-p-1', "app": '美图秀秀', "category": '弹窗', "name": '保分页弹窗', "checked": False },
  { "id": 'mt-p-2', "app": '美图秀秀', "category": '弹窗', "name": '首页弹窗', "checked": False },
  { "id": 'mt-p-3', "app": '美图秀秀', "category": '弹窗', "name": '首页弹窗异形', "checked": False },

  # 美颜
  { "id": 'my-s-1', "app": '美颜', "category": '开屏', "name": '动态开屏', "checked": False },
  { "id": 'my-s-2', "app": '美颜', "category": '开屏', "name": '上滑开屏', "checked": False },
  { "id": 'my-s-3', "app": '美颜', "category": '开屏', "name": '扭动开屏', "checked": False },
  { "id": 'my-s-4', "app": '美颜', "category": '开屏', "name": '气泡开屏', "checked": False },
  { "id": 'my-f-1', "app": '美颜', "category": '焦点视窗', "name": '动态焦点视窗', "checked": False },
  { "id": 'my-f-2', "app": '美颜', "category": '焦点视窗', "name": '静态焦点视窗', "checked": False },
  { "id": 'my-p-1', "app": '美颜', "category": '弹窗', "name": '弹窗精图', "checked": False },
  { "id": 'my-ib-1', "app": '美颜', "category": 'icon/banner', "name": '百宝箱顶部banner', "checked": False },

  # wink
  { "id": 'wk-s-1', "app": 'wink', "category": '开屏', "name": '动态开屏', "checked": False },
  { "id": 'wk-s-2', "app": 'wink', "category": '开屏', "name": '上滑开屏', "checked": False },
  { "id": 'wk-s-3', "app": 'wink', "category": '开屏', "name": '扭动开屏', "checked": False },
  { "id": 'wk-s-4', "app": 'wink', "category": '开屏', "name": '气泡开屏', "checked": False },
  { "id": 'wk-f-1', "app": 'wink', "category": '焦点视窗', "name": '动态焦点视窗', "checked": False },
  { "id": 'wk-f-2', "app": 'wink', "category": '焦点视窗', "name": '静态焦点视窗', "checked": False },
]

CATEGORY_DIMENSIONS = {
  '开屏': '1440 x 2340',
  '焦点视窗': '1126 x 2436',
  '信息流': '1080 x 1920',
  'icon/banner': '1080 x 1920',
  '弹窗': '1080 x 1920',
}

def seed():
    db = SessionLocal()
    for t_data in INITIAL_TEMPLATES:
        if not db.query(AdTemplate).filter(AdTemplate.id == t_data["id"]).first():
            if t_data["id"] == "mt-ib-3":
                t_data["dimensions"] = "1126 x 640"
            else:
                t_data["dimensions"] = CATEGORY_DIMENSIONS.get(t_data["category"], '1080 x 1920')
            db_item = AdTemplate(**t_data)
            db.add(db_item)
    
    db.commit()
    print("Database seeded!")
    db.close()

if __name__ == "__main__":
    seed()
