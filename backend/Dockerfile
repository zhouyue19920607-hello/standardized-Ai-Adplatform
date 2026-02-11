# 后端Dockerfile
FROM python:3.10-slim

WORKDIR /app

# 安装系统依赖
RUN apt-get update && apt-get install -y \
    gcc \
    && rm -rf /var/lib/apt/lists/*

# 复制requirements文件
COPY requirements.txt .

# 安装Python依赖
RUN pip install --no-cache-dir -r requirements.txt

# 复制后端代码
COPY . .

# 创建必要目录
RUN mkdir -p /app/assets /app/data

# 暴露端口
EXPOSE 5000

# 启动命令
CMD ["python", "-m", "uvicorn", "server:app", "--host", "0.0.0.0", "--port", "5000"]
