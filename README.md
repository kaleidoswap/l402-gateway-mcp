# l402-gateway-mcp

MCP server that provides cryptocurrency market data to AI agents via the [Model Context Protocol](https://modelcontextprotocol.io).

Works out of the box with **no configuration** using free public APIs (CoinGecko, alternative.me). Optionally connects to an L402 Lightning-paywall gateway for premium data.

## Tools

| Tool | Description |
|------|-------------|
| `l402_get_price` | Current price for a single asset (BTC, USDT, XAUT, ETH) with 24h change and market cap |
| `l402_get_market_data` | Batch prices for multiple assets in one call |
| `l402_get_ohlcv` | OHLCV candlestick data with period change percentage |
| `l402_get_sentiment` | Fear & Greed index (0–100) with trading signal |
| `l402_request_challenge` | Request an L402 Lightning payment challenge for a resource |
| `l402_fetch_resource` | Fetch an L402-gated resource after paying the invoice |

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

# With L402 gateway for premium data
L402_GATEWAY_URL=https://your-l402-proxy.com node dist/index.js
```

### Claude Desktop

```json
{
  "mcpServers": {
    "l402_gateway": {
      "command": "node",
      "args": ["/path/to/l402-gateway-mcp/dist/index.js"],
      "env": {}
    }
  }
}
```

## Configuration

| Env var | Default | Description |
|---------|---------|-------------|
| `L402_GATEWAY_URL` | _(none)_ | L402 proxy URL. Omit to use free public APIs. |

## Rate Limits

The free CoinGecko tier has strict rate limits. Avoid calling price tools more than once per 30 seconds.

## License

Apache-2.0
