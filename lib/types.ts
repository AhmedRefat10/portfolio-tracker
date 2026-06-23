export interface Position {
  id: string
  ticker: string
  shares: number
  price: number
  entry_price: number
  target_pct: number
  is_cash: boolean
  sort_order: number
  opened_at?: string | null
}

export interface Snapshot {
  id: string
  total_value: number
  positions: Position[]
  note: string | null
  created_at: string
}

export interface ClosedTrade {
  id: string
  ticker: string
  shares: number
  entry_price: number
  exit_price: number
  invested_value: number
  exit_value: number
  profit_value: number
  profit_pct: number
  duration_days: number
  opened_at: string | null
  closed_at: string
  notes: string | null
  position_data?: Position | null
}

export interface Order {
  ticker: string
  action: 'BUY' | 'SELL'
  diffValue: number
  diffShares: number
}
