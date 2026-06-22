import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const tickers = searchParams.get('tickers')?.split(',').filter(Boolean) ?? []

  if (!tickers.length) return NextResponse.json({})

  const prices: Record<string, number> = {}

  await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const res = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=1d&range=1d`,
          { next: { revalidate: 300 } } // cache 5 min
        )
        const json = await res.json()
        const price =
          json?.chart?.result?.[0]?.meta?.regularMarketPrice ??
          json?.chart?.result?.[0]?.meta?.previousClose ?? null
        if (price) prices[ticker] = price
      } catch {
        // silently skip failed tickers
      }
    })
  )

  return NextResponse.json(prices)
}
