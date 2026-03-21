# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /workspace

# SDK (local file: dep)
COPY kaleido-sdk/typescript-sdk/package*.json ./kaleido-sdk/typescript-sdk/
RUN cd kaleido-sdk/typescript-sdk && npm install
COPY kaleido-sdk/typescript-sdk/ ./kaleido-sdk/typescript-sdk/
RUN cd kaleido-sdk/typescript-sdk && npm run build:ts

# MCP server
COPY mpp-gateway-mcp/package*.json ./mpp-gateway-mcp/
RUN cd mpp-gateway-mcp && npm install
COPY mpp-gateway-mcp/ ./mpp-gateway-mcp/
RUN cd mpp-gateway-mcp && npm run build

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine
WORKDIR /app

COPY --from=builder /workspace/mpp-gateway-mcp/dist ./dist/
COPY --from=builder /workspace/mpp-gateway-mcp/package.json ./
COPY --from=builder /workspace/kaleido-sdk/typescript-sdk/dist ../kaleido-sdk/typescript-sdk/dist/
COPY --from=builder /workspace/kaleido-sdk/typescript-sdk/package.json ../kaleido-sdk/typescript-sdk/
RUN npm install --omit=dev

EXPOSE 3012

ENV PORT=3012
# MPP_GATEWAY_URL is optional — omit for free CoinGecko market data only
# ENV MPP_GATEWAY_URL=https://your-mpp-server.com

CMD ["node", "dist/index.js"]
