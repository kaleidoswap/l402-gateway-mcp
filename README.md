# mpp-gateway-mcp

MCP server providing **MPP (Machine Payments Protocol)** and **L402 Lightning-paid** tools to AI agents via the [Model Context Protocol](https://modelcontextprotocol.io).

Works out of the box with no configuration using free public APIs (CoinGecko, alternative.me). Agents can also pay for access to any MPP or L402-gated resource autonomously using Lightning — no API keys, no signup.

## Tools

### Market Data (free, no config needed)

| Tool | Description |
|------|-------------|
| `l402_get_price` | Current price for a single asset (BTC, USDT, XAUT, ETH) with 24h change and market cap |
| `l402_get_market_data` | Batch prices for multiple assets in one call |
| `l402_get_ohlcv` | OHLCV candlestick data with period change percentage |
| `l402_get_sentiment` | Fear & Greed index (0–100) with trading signal |

### MPP — Machine Payments Protocol

| Tool | Description |
|------|-------------|
| `mpp_request_challenge` | Probe any MPP-protected URL; parse the HTTP 402 challenge into invoice + challenge_id |
| `mpp_submit_credential` | Submit a payment credential to access the protected resource; returns data + receipt |
| `mpp_parse_challenge_header` | Parse a raw `WWW-Authenticate` header string without making an HTTP request |

### Legacy L402 (older servers)

| Tool | Description |
|------|-------------|
| `l402_request_challenge` | Request an L402 Lightning payment challenge for a resource |
| `l402_fetch_resource` | Fetch an L402-gated resource after paying the invoice |

### MPP payment flow (with wdk-wallet-rln-mcp)

```
mpp_request_challenge(url)          → challenge { invoice, challenge_id }
  ↓
wdk_mpp_pay(invoice, challenge_id)  → credential JSON          [wdk-wallet-rln-mcp]
  ↓
mpp_submit_credential(url, cred)    → { ok, data, receipt }
```

### Sentiment signals

| Index value | Signal |
|-------------|--------|
| 0–24 | `STRONG_BUY_SIGNAL` |
| 25–44 | `BUY_SIGNAL` |
| 45–55 | `NEUTRAL` |
| 56–75 | `SELL_SIGNAL` |
| 76–100 | `STRONG_SELL_SIGNAL` |

## Installation

```bash
npm install
npm run build
```

## Usage

```bash
# No config needed — uses free public APIs
node dist/index.js

# With MPP gateway URL for authenticated endpoints
MPP_GATEWAY_URL=https://your-mpp-server.com node dist/index.js

# Legacy L402 gateway (also accepted)
L402_GATEWAY_URL=https://your-l402-proxy.com node dist/index.js
```

### Claude Desktop / agent.config.json

```json
{
  "mcpServers": {
    "mpp_gateway": {
      "command": "node",
      "args": ["/path/to/mpp-gateway-mcp/dist/index.js"],
      "env": { "MPP_GATEWAY_URL": "" }
    }
  }
}
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `MPP_GATEWAY_URL` | _(none)_ | MPP server URL. Omit to use free public APIs. |
| `L402_GATEWAY_URL` | _(none)_ | Legacy L402 proxy URL (also accepted). |

## Rate Limits

The free CoinGecko tier has strict rate limits. Avoid calling price tools more than once per 30 seconds.

## License

Apache-2.0
