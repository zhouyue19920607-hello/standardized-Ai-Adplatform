# ─── Stage 1: Build frontend ─────────────────────────────────────────────
FROM node:20-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ─── Stage 2: Install server dependencies (native modules needed) ─────────
FROM node:20-alpine AS server-deps
RUN apk add --no-cache python3 make g++ libc6-compat vips-dev
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

# ─── Stage 3: Production runner ─────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat vips
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
COPY --from=frontend-builder /app/dist ./dist
COPY backend/ ./backend/
COPY server.mjs ./
COPY vite.config.ts ./
COPY tsconfig*.json ./
COPY index.html ./
COPY tailwind.config.js ./
COPY postcss.config.js ./
EXPOSE 4000
ENV NODE_ENV=production
ENV PORT=4000
ENV HOSTNAME="0.0.0.0"
CMD ["node", "server.mjs"]