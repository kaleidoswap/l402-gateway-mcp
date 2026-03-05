#!/usr/bin/env node
/**
 * L402 Gateway MCP Server
 *
 * Provides Lightning-paid market data tools to AI agents via the Model Context Protocol.
 * Communicates over stdio — connect via Claude Desktop, OpenClaw, or any MCP-compatible host.
 *
 * Free-tier market data (CoinGecko) works with no configuration.
 * For real L402 endpoints set L402_GATEWAY_URL to your L402 proxy.
 *
 * Usage:
 *   npx l402-gateway-mcp
 *   L402_GATEWAY_URL=https://your-l402-proxy.com npx l402-gateway-mcp
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createServer } from './server.js'

const GATEWAY_URL = process.env.L402_GATEWAY_URL ?? null

async function main() {
  const server = createServer(GATEWAY_URL)
  const transport = new StdioServerTransport()

  await server.connect(transport)

  const mode = GATEWAY_URL ? `L402 gateway: ${GATEWAY_URL}` : 'demo mode (free public APIs)'
  process.stderr.write(`[l402-gateway-mcp] Connected — ${mode}\n`)
}

main().catch((err) => {
  process.stderr.write(`[l402-gateway-mcp] Fatal error: ${err}\n`)
  process.exit(1)
})
