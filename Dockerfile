# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /workspace

RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build && npm prune --omit=dev

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim
WORKDIR /app

COPY --from=builder /workspace/dist ./dist/
COPY --from=builder /workspace/package.json ./
COPY --from=builder /workspace/node_modules ./node_modules/

EXPOSE 3012

ENV PORT=3012
# MPP_GATEWAY_URL is optional — omit for free CoinGecko market data only
# ENV MPP_GATEWAY_URL=https://your-mpp-server.com

CMD ["node", "dist/index.js"]
