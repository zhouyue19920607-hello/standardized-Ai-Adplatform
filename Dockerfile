# 使用 Node.js 20 LTS 版本
FROM node:20-slim AS builder

WORKDIR /app

# 复制依赖文件并安装
COPY package*.json ./
RUN npm install

# 复制源文件并构建前端
COPY . .
RUN npm run build

# 生产环境运行阶段
FROM node:20-slim

# 安装 libvips 用于 sharp 图片处理
RUN apt-get update && apt-get install -y libvips-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 只要生产依赖
COPY package*.json ./
RUN npm install --omit=dev

# 从构建阶段复制构建好的静态文件和后端代码
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/backend ./backend

# 暴露端口 (默认 4000)
EXPOSE 4000

# 启动服务器
CMD ["npm", "run", "server"]
