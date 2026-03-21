import test from 'node:test'
import { assertExactTools, listToolNames } from '../../scripts/mcp-contract-test-utils.mjs'

test('mpp-gateway-mcp exposes the expected tool contract', async () => {
  const tools = await listToolNames({
    cwd: new URL('..', import.meta.url).pathname,
  })

  assertExactTools(tools, [
    'l402_fetch_resource',
    'l402_get_market_data',
    'l402_get_ohlcv',
    'l402_get_price',
    'l402_get_sentiment',
    'l402_request_challenge',
    'mpp_parse_challenge_header',
    'mpp_request_challenge',
    'mpp_submit_credential',
    'search_paid_apis',
  ])
})
