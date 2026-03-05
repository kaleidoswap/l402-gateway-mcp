import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { MarketClient } from './market-client.js'

export function createServer(gatewayUrl: string | null): McpServer {
  const market = new MarketClient(gatewayUrl)

  const server = new McpServer({
    name: 'l402-gateway',
    version: '1.0.0',
  })

  // -----------------------------------------------------------------------
  // Tool: l402_get_price
  // -----------------------------------------------------------------------
  server.tool(
    'l402_get_price',
    'Get the current spot price and 24h stats for a single asset (BTC, USDT, XAUT, ETH). Use this before placing a swap to know the current market rate.',
    {
      asset: z
        .enum(['BTC', 'USDT', 'XAUT', 'ETH'])
        .describe('Asset ticker to price'),
      vs_currency: z
        .enum(['usd', 'eur', 'btc', 'sats'])
        .optional()
        .describe('Quote currency (default: usd)'),
    },
    async ({ asset, vs_currency = 'usd' }) => {
      // Convert "sats" to "btc" for the API, then convert back
      const queryCurrency = vs_currency === 'sats' ? 'btc' : vs_currency
      const result = await market.getPrice(asset, queryCurrency)

      if (vs_currency === 'sats' && result.price) {
        result.price = Math.round(result.price * 1e8)
        result.vs_currency = 'SATS'
      }

      return text(JSON.stringify(result, null, 2))
    }
  )

  // -----------------------------------------------------------------------
  // Tool: l402_get_market_data
  // -----------------------------------------------------------------------
  server.tool(
    'l402_get_market_data',
    'Get spot prices and 24h stats for multiple assets in one call. Returns price, 24h % change, market cap, and volume.',
    {
      assets: z
        .array(z.enum(['BTC', 'USDT', 'XAUT', 'ETH']))
        .min(1)
        .max(4)
        .describe('List of asset tickers to fetch'),
    },
    async ({ assets }) => {
      const results = await market.getMarketData(assets)
      return text(JSON.stringify(results, null, 2))
    }
  )

  // -----------------------------------------------------------------------
  // Tool: l402_get_ohlcv
  // -----------------------------------------------------------------------
  server.tool(
    'l402_get_ohlcv',
    'Get OHLCV (Open/High/Low/Close) candle data for an asset over the last N days. Use this to detect price trends before adjusting a trading strategy.',
    {
      asset: z
        .enum(['BTC', 'USDT', 'XAUT', 'ETH'])
        .describe('Asset ticker'),
      days: z
        .number()
        .int()
        .min(1)
        .max(90)
        .optional()
        .describe('Number of days of candles to return (default: 1, max: 90)'),
    },
    async ({ asset, days = 1 }) => {
      const candles = await market.getOhlcv(asset, days)
      const latest = candles[candles.length - 1]
      const oldest = candles[0]
      const pctChange = oldest && latest
        ? (((latest.close - oldest.open) / oldest.open) * 100).toFixed(2)
        : null

      return text(
        JSON.stringify(
          {
            asset,
            days,
            candle_count: candles.length,
            period_change_pct: pctChange ? parseFloat(pctChange) : null,
            latest_close: latest?.close ?? null,
            candles: candles.slice(-20), // last 20 candles to keep response manageable
          },
          null,
          2
        )
      )
    }
  )

  // -----------------------------------------------------------------------
  // Tool: l402_get_sentiment
  // -----------------------------------------------------------------------
  server.tool(
    'l402_get_sentiment',
    'Get the Crypto Fear & Greed Index (0–100). Below 25 = extreme fear (potential buy). Above 75 = extreme greed (potential sell). Use this as a directional signal when deciding swap direction.',
    {},
    async () => {
      const sentiment = await market.getFearGreedIndex()
      const signal =
        sentiment.index_value < 25
          ? 'STRONG_BUY_SIGNAL'
          : sentiment.index_value < 40
            ? 'BUY_SIGNAL'
            : sentiment.index_value > 75
              ? 'STRONG_SELL_SIGNAL'
              : sentiment.index_value > 60
                ? 'SELL_SIGNAL'
                : 'NEUTRAL'
      return text(JSON.stringify({ ...sentiment, trading_signal: signal }, null, 2))
    }
  )

  // -----------------------------------------------------------------------
  // Tool: l402_request_challenge
  // -----------------------------------------------------------------------
  server.tool(
    'l402_request_challenge',
    'Request an L402 Lightning payment challenge for a premium data endpoint. Returns a BOLT11 invoice to pay (via wdk_pay_invoice) and a macaroon. After payment, call l402_fetch_resource with the preimage to access the data.',
    {
      resource_url: z
        .string()
        .describe('URL of the L402-protected resource to access'),
      price_sats: z
        .number()
        .int()
        .positive()
        .optional()
        .describe('Maximum price in satoshis willing to pay (default: 10)'),
    },
    async ({ resource_url, price_sats = 10 }) => {
      const challenge = await market.getL402Challenge(resource_url, price_sats)
      return text(
        JSON.stringify(
          {
            ...challenge,
            next_step: 'Pay the invoice via wdk_pay_invoice, then call l402_fetch_resource with the payment_preimage',
          },
          null,
          2
        )
      )
    }
  )

  // -----------------------------------------------------------------------
  // Tool: l402_fetch_resource
  // -----------------------------------------------------------------------
  server.tool(
    'l402_fetch_resource',
    'Fetch an L402-protected resource using a paid Bearer token (format: "macaroon:preimage"). Call this after paying the invoice from l402_request_challenge.',
    {
      resource_url: z
        .string()
        .describe('URL of the L402-protected resource'),
      token: z
        .string()
        .describe('L402 Bearer token in format "macaroon:preimage"'),
    },
    async ({ resource_url, token }) => {
      const valid = await market.verifyL402Token(token, resource_url)
      if (!valid) {
        return text(
          JSON.stringify(
            { error: 'L402 token invalid or expired. Request a new challenge via l402_request_challenge.' },
            null,
            2
          )
        )
      }

      // Fetch the resource with the Bearer token
      try {
        const res = await fetch(resource_url, {
          headers: { Authorization: `L402 ${token}` },
        })
        const body = await res.text()
        let data: unknown
        try { data = JSON.parse(body) } catch { data = body }
        return text(JSON.stringify({ status: res.status, data }, null, 2))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return text(JSON.stringify({ error: msg }, null, 2))
      }
    }
  )

  return server
}

// ---------------------------------------------------------------------------

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] }
}
