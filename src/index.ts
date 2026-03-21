#!/usr/bin/env node
/**
 * MPP Gateway MCP Server
 *
 * Provides MPP (Machine Payments Protocol) and L402 Lightning-paid tools to AI agents
 * via the Model Context Protocol.
 *
 * Tools:
 *   MPP: mpp_request_challenge, mpp_submit_credential, mpp_parse_challenge_header
 *   L402: l402_request_challenge, l402_fetch_resource (legacy, kept for compatibility)
 *   Market data: l402_get_price, l402_get_market_data, l402_get_ohlcv, l402_get_sentiment
 *
 * Transport:
 *   stdio (default)  — connect via Claude Desktop, kaleidoagent, or any MCP host
 *   HTTP             — set PORT to enable StreamableHTTP on that port (for hosted/remote use)
 *
 * Usage:
 *   npx mpp-gateway-mcp
 *   MPP_GATEWAY_URL=https://your-mpp-server.com npx mpp-gateway-mcp
 *   PORT=3012 npx mpp-gateway-mcp
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createServer } from './server.js'
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from 'node:http'

// Accept both new and legacy env vars
const GATEWAY_URL = process.env.MPP_GATEWAY_URL ?? process.env.L402_GATEWAY_URL ?? null
const PORT        = process.env.PORT ? parseInt(process.env.PORT, 10) : null

async function main() {
  const mcpServer = createServer(GATEWAY_URL)
  const mode = GATEWAY_URL ? `MPP gateway: ${GATEWAY_URL}` : 'demo mode (free public APIs)'

  if (PORT) {
    const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN ?? null
    // HTTP mode — one StreamableHTTP transport per request (stateless)
    const httpServer = createHttpServer(async (req: IncomingMessage, res: ServerResponse) => {
      if (AUTH_TOKEN) {
        const auth = req.headers['authorization']
        if (auth !== `Bearer ${AUTH_TOKEN}`) {
          res.writeHead(401, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Unauthorized' }))
          return
        }
      }
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined })
      res.on('close', () => { transport.close().catch(() => {}) })
      await mcpServer.connect(transport)
      await transport.handleRequest(req, res)
    })
    httpServer.listen(PORT, '0.0.0.0', () => {
      process.stderr.write(`[mpp-gateway-mcp] HTTP transport listening on port ${PORT} — ${mode}\n`)
    })
  } else {
    // stdio mode (default)
    const transport = new StdioServerTransport()
    await mcpServer.connect(transport)
    process.stderr.write(`[mpp-gateway-mcp] stdio transport connected — ${mode}\n`)
  }
}

main().catch((err) => {
  process.stderr.write(`[mpp-gateway-mcp] Fatal error: ${err}\n`)
  process.exit(1)
})
