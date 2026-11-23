# Stage 1: Build frontend Vite bundle, Firefox extension XPI, and bundled server
FROM node:22-bookworm-slim AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --legacy-peer-deps; else npm install --legacy-peer-deps; fi

COPY . .
RUN npm run build && npm run pack:extension && npm run build:server

# Stage 2: Production runtime (Debian Bookworm Slim with glibc for onnxruntime-node & sharp)
FROM node:22-bookworm-slim AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOST=0.0.0.0
ENV DATA_DIR=/app/data

COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev --legacy-peer-deps; else npm install --omit=dev --legacy-peer-deps; fi && npm cache clean --force

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-extension ./dist-extension

RUN mkdir -p /app/data && chown -R node:node /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.mjs"]
