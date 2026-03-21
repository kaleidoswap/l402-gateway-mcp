import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { MarketClient } from './market-client.js'
import { MppClient } from './mpp-client.js'

export function createServer(gatewayUrl: string | null): McpServer {
  const market = new MarketClient(gatewayUrl)
  const mpp = new MppClient()

  const server = new McpServer({
    name: 'mpp-gateway',
    version: '1.1.0',
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

  // -----------------------------------------------------------------------
  // Tool: mpp_request_challenge
  // -----------------------------------------------------------------------
  server.tool(
    'mpp_request_challenge',
    'Probe an MPP-protected URL and return the payment challenge. If the server returns HTTP 402, parses the WWW-Authenticate header and returns the challenge details including the Lightning invoice to pay, challenge_id, and amount. Works with any MPP-compatible server (including L402-compatible ones). After calling this, use wdk_mpp_pay to settle the invoice, then mpp_submit_credential to access the resource.',
    {
      url: z
        .string()
        .describe('URL of the MPP-protected resource to access'),
    },
    async ({ url }) => {
      try {
        const challenge = await mpp.requestChallenge(url)
        return text(
          JSON.stringify(
            {
              ...challenge,
              next_step: challenge.invoice
                ? 'Pay the invoice via wdk_mpp_pay, then call mpp_submit_credential with the returned credential'
                : 'No Lightning invoice in challenge — check method and use appropriate payment tool',
            },
            null,
            2
          )
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return text(JSON.stringify({ error: msg }, null, 2))
      }
    }
  )

  // -----------------------------------------------------------------------
  // Tool: mpp_submit_credential
  // -----------------------------------------------------------------------
  server.tool(
    'mpp_submit_credential',
    'Submit an MPP payment credential to access a protected resource. Call this after wdk_mpp_pay returns a credential JSON. Sends both the MPP Payment-Authorization header and the L402-compatible Authorization header for maximum server compatibility. Returns the resource data and a receipt if the server issues one.',
    {
      url: z
        .string()
        .describe('URL of the MPP-protected resource (same URL used in mpp_request_challenge)'),
      credential: z
        .string()
        .describe('Credential JSON string returned by wdk_mpp_pay'),
    },
    async ({ url, credential: credentialStr }) => {
      try {
        const credential = mpp.deserializeCredential(credentialStr)
        const result = await mpp.submitCredential(url, credential)
        return text(
          JSON.stringify(
            {
              ok: result.ok,
              status: result.status,
              receipt: result.receipt ?? null,
              data: result.data,
            },
            null,
            2
          )
        )
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return text(JSON.stringify({ error: msg }, null, 2))
      }
    }
  )

  // -----------------------------------------------------------------------
  // Tool: mpp_parse_challenge_header
  // -----------------------------------------------------------------------
  server.tool(
    'mpp_parse_challenge_header',
    'Parse a raw WWW-Authenticate header value from an HTTP 402 response into a structured MPP challenge object. Use this when you have the raw header string (e.g. from a direct fetch) and need to extract the invoice, challenge_id, and payment details without making a new HTTP request.',
    {
      url: z
        .string()
        .describe('The URL that issued the 402 (used as context in the challenge object)'),
      www_authenticate: z
        .string()
        .describe('Raw value of the WWW-Authenticate header from the 402 response'),
    },
    async ({ url, www_authenticate }) => {
      try {
        const challenge = mpp.parseChallenge(url, www_authenticate)
        return text(JSON.stringify(challenge, null, 2))
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return text(JSON.stringify({ error: msg }, null, 2))
      }
    }
  )

  // -----------------------------------------------------------------------
  // Tool: search_paid_apis
  // -----------------------------------------------------------------------
  server.tool(
    'search_paid_apis',
    'Search the 402index.io directory for payment-gated APIs accessible via L402 (Lightning), MPP (Stripe/Tempo), or x402 (Base/Solana) protocols. Returns endpoint URLs, pricing, health status, and protocol type — ready to call via mpp_request_challenge or l402_request_challenge. Use this to discover premium data feeds, on-chain analytics, market data, and AI services payable with Bitcoin micropayments.',
    {
      query: z
        .string()
        .optional()
        .describe('Search keyword (e.g. "bitcoin price", "on-chain analytics", "sentiment", "weather")'),
      protocol: z
        .enum(['L402', 'x402', 'MPP'])
        .optional()
        .describe('Filter by payment protocol. L402 = Lightning Network, MPP = Stripe/Tempo, x402 = Base/Solana'),
      category: z
        .string()
        .optional()
        .describe('Category filter (e.g. "finance", "crypto", "weather", "ai", "data")'),
      health: z
        .enum(['healthy', 'degraded', 'unknown'])
        .optional()
        .describe('Filter by endpoint health status (default: all)'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe('Max results to return (default: 10)'),
    },
    async ({ query, protocol, category, health, limit = 10 }) => {
      try {
        const params = new URLSearchParams()
        if (query)    params.set('search', query)
        if (protocol) params.set('protocol', protocol)
        if (category) params.set('category', category)
        if (health)   params.set('health', health)
        params.set('limit', String(limit))

        const url = `https://402index.io/api/v1/services?${params.toString()}`
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json', 'User-Agent': 'kaleidoagent/1.0' },
          signal: AbortSignal.timeout(10_000),
        })

        if (!res.ok) {
          return text(JSON.stringify({ error: `402index.io returned ${res.status}` }, null, 2))
        }

        const data = await res.json() as {
          services?: Array<{
            id?: string
            name?: string
            description?: string
            url?: string
            protocol?: string
            pricing?: { usd?: number; sats?: number }
            category?: string
            health?: string
            uptime_pct?: number
            latency_ms?: number
          }>
          total?: number
        }

        const services = (data.services ?? []).map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          url: s.url,
          protocol: s.protocol,
          price_usd: s.pricing?.usd ?? null,
          price_sats: s.pricing?.sats ?? null,
          category: s.category,
          health: s.health,
          uptime_pct: s.uptime_pct ?? null,
          latency_ms: s.latency_ms ?? null,
        }))

        return text(
          JSON.stringify(
            {
              total_available: data.total ?? services.length,
              returned: services.length,
              services,
              usage: 'For L402/MPP services: call mpp_request_challenge with the service URL, then pay via wdk_mpp_pay (RLN) or spark_mpp_pay (Spark), then mpp_submit_credential',
            },
            null,
            2,
          ),
        )
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
