/**
 * Market data client — wraps CoinGecko free-tier API.
 * No API key required for the endpoints used here.
 */

const COINGECKO = 'https://api.coingecko.com/api/v3'

// CoinGecko coin IDs for assets we care about
const COIN_IDS: Record<string, string> = {
  BTC: 'bitcoin',
  USDT: 'tether',
  XAUT: 'tether-gold',
  ETH: 'ethereum',
}

export interface PriceResult {
  asset: string
  vs_currency: string
  price: number
  change_24h_pct: number | null
  market_cap_usd: number | null
  volume_24h_usd: number | null
  last_updated: string
}

export interface OhlcvCandle {
  timestamp: number
  open: number
  high: number
  low: number
  close: number
}

export interface SentimentResult {
  index_value: number
  classification: string
  timestamp: string
}

export interface L402Challenge {
  invoice: string
  macaroon: string
  resource: string
  price_sats: number
}

export class MarketClient {
  private gatewayUrl: string | null

  constructor(gatewayUrl: string | null = null) {
    this.gatewayUrl = gatewayUrl
  }

  async getPrice(asset: string, vsCurrency = 'usd'): Promise<PriceResult> {
    const coinId = this.resolveCoinId(asset)
    const url = `${COINGECKO}/simple/price?ids=${coinId}&vs_currencies=${vsCurrency}&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`
    const data = await this.fetch<Record<string, Record<string, number>>>(url)
    const entry = data[coinId]
    if (!entry) throw new Error(`No price data for ${asset}`)

    return {
      asset: asset.toUpperCase(),
      vs_currency: vsCurrency.toUpperCase(),
      price: entry[vsCurrency] ?? 0,
      change_24h_pct: entry[`${vsCurrency}_24h_change`] ?? null,
      market_cap_usd: entry[`${vsCurrency}_market_cap`] ?? null,
      volume_24h_usd: entry[`${vsCurrency}_24h_vol`] ?? null,
      last_updated: new Date((entry['last_updated_at'] ?? 0) * 1000).toISOString(),
    }
  }

  async getMarketData(assets: string[]): Promise<PriceResult[]> {
    const ids = assets.map((a) => this.resolveCoinId(a)).join(',')
    const url = `${COINGECKO}/simple/price?ids=${ids}&vs_currencies=usd&include_market_cap=true&include_24hr_vol=true&include_24hr_change=true&include_last_updated_at=true`
    const data = await this.fetch<Record<string, Record<string, number>>>(url)

    return assets.map((asset) => {
      const coinId = this.resolveCoinId(asset)
      const entry = data[coinId] ?? {}
      return {
        asset: asset.toUpperCase(),
        vs_currency: 'USD',
        price: entry['usd'] ?? 0,
        change_24h_pct: entry['usd_24h_change'] ?? null,
        market_cap_usd: entry['usd_market_cap'] ?? null,
        volume_24h_usd: entry['usd_24h_vol'] ?? null,
        last_updated: new Date((entry['last_updated_at'] ?? 0) * 1000).toISOString(),
      }
    })
  }

  async getOhlcv(asset: string, days: number): Promise<OhlcvCandle[]> {
    const coinId = this.resolveCoinId(asset)
    // CoinGecko /ohlc returns [timestamp, open, high, low, close]
    const url = `${COINGECKO}/coins/${coinId}/ohlc?vs_currency=usd&days=${days}`
    const raw = await this.fetch<number[][]>(url)
    return raw.map(([ts, o, h, l, c]) => ({
      timestamp: ts,
      open: o,
      high: h,
      low: l,
      close: c,
    }))
  }

  async getFearGreedIndex(): Promise<SentimentResult> {
    // Alternative Fear & Greed API (no CoinGecko, uses alternative.me)
    const data = await this.fetch<{
      data: Array<{ value: string; value_classification: string; timestamp: string }>
    }>('https://api.alternative.me/fng/?limit=1')
    const entry = data.data?.[0]
    if (!entry) throw new Error('No fear/greed data')
    return {
      index_value: parseInt(entry.value, 10),
      classification: entry.value_classification,
      timestamp: new Date(parseInt(entry.timestamp, 10) * 1000).toISOString(),
    }
  }

  /**
   * Issue an L402 challenge for a given resource URL.
   * If a real L402 gateway is configured, delegates to it.
   * Otherwise returns a demo challenge so the agent can demonstrate the flow.
   */
  async getL402Challenge(resourceUrl: string, priceSats = 1): Promise<L402Challenge> {
    if (this.gatewayUrl) {
      // Real gateway: send a HEAD/GET, extract 402 headers
      return this.challengeFromGateway(resourceUrl, priceSats)
    }
    // Demo mode: return a simulated challenge
    return {
      invoice: `lnbc${priceSats}n1demo_invoice_for_${encodeURIComponent(resourceUrl)}`,
      macaroon: `AGIAJEemVQUTEyNCREVGRhijFGnGq9zDemoMacaroon`,
      resource: resourceUrl,
      price_sats: priceSats,
    }
  }

  /**
   * Verify an L402 Bearer token (macaroon:preimage) against the gateway.
   * In demo mode, always returns true.
   */
  async verifyL402Token(token: string, resourceUrl: string): Promise<boolean> {
    if (!this.gatewayUrl) return true // demo mode — always valid
    try {
      const res = await fetch(resourceUrl, {
        headers: { Authorization: `L402 ${token}` },
      })
      return res.ok
    } catch {
      return false
    }
  }

  private async challengeFromGateway(resourceUrl: string, priceSats: number): Promise<L402Challenge> {
    const res = await fetch(`${this.gatewayUrl}/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: resourceUrl, price_sats: priceSats }),
    })
    if (!res.ok) throw new Error(`Gateway error: HTTP ${res.status}`)
    return res.json() as Promise<L402Challenge>
  }

  private resolveCoinId(asset: string): string {
    const upper = asset.toUpperCase()
    const id = COIN_IDS[upper]
    if (!id) throw new Error(`Unknown asset: ${asset}. Supported: ${Object.keys(COIN_IDS).join(', ')}`)
    return id
  }

  private async fetch<T>(url: string): Promise<T> {
    const res = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      if (res.status === 429) {
        throw new Error(
          'Market data rate limit hit (HTTP 429). Wait 30 seconds and retry.'
        )
      }
      throw new Error(`Market data fetch failed: HTTP ${res.status}`)
    }
    return res.json() as Promise<T>
  }
}
