export interface Position {
  id: string
  ticker: string
  shares: number
  price: number
  entry_price: number
  target_pct: number
  is_cash: boolean
  sort_order: number
}

export interface Snapshot {
  id: string
  total_value: number
  positions: Position[]
  note: string | null
  created_at: string
}

export interface Order {
  ticker: string
  action: 'BUY' | 'SELL'
  diffValue: number
  diffShares: number
}
