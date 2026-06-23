'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { ClosedTrade, Position, Snapshot } from '@/lib/types'
import {
  Plus, Trash2, Save, LogOut, RefreshCw, History,
  ArrowUpRight, ArrowDownRight, AlertTriangle, Check, X,
  Loader2, ChevronDown, TrendingUp, TrendingDown
} from 'lucide-react'

// ── Constants ────────────────────────────────────────────────────────────────
const C = {
  bg: '#0A0B10', surface: '#131520', surfaceAlt: '#1A1D2B',
  border: '#262A3A', borderLight: '#363A4C',
  text: '#F3F4F7', textDim: '#8B8FA3', textFaint: '#5B5F70',
  blue: '#4C8DFF', blueDim: 'rgba(76,141,255,0.16)',
  sell: '#FF6B5B', sellDim: 'rgba(255,107,91,0.16)',
  teal: '#34D399', tealDim: 'rgba(52,211,153,0.15)',
  yellow: '#FBBF24',
}
const FA = "'Tajawal', sans-serif"
const FM = "'IBM Plex Mono', monospace"
const MIN_TRADE = 5
const PRICE_REFRESH_MS = 60_000 // auto-refresh every 60s

// Logo mapping — ticker → company domain for Clearbit
const LOGO_DOMAINS: Record<string, string> = {
  ADI: 'analog.com', AMD: 'amd.com', ARM: 'arm.com',
  KNSA: 'kiniksa.com', LRCX: 'lamresearch.com',
  MRVL: 'marvell.com', SCCO: 'southerncoppercorp.com',
}

const DEFAULT_POSITIONS: Omit<Position, 'id'>[] = [
  { ticker: 'ADI',  shares: 0, price: 0, entry_price: 0, target_pct: 8.6,  is_cash: false, sort_order: 0 },
  { ticker: 'AMD',  shares: 0, price: 0, entry_price: 0, target_pct: 8.6,  is_cash: false, sort_order: 1 },
  { ticker: 'ARM',  shares: 0, price: 0, entry_price: 0, target_pct: 8.6,  is_cash: false, sort_order: 2 },
  { ticker: 'KNSA', shares: 0, price: 0, entry_price: 0, target_pct: 8.6,  is_cash: false, sort_order: 3 },
  { ticker: 'LRCX', shares: 0, price: 0, entry_price: 0, target_pct: 8.6,  is_cash: false, sort_order: 4 },
  { ticker: 'MRVL', shares: 0, price: 0, entry_price: 0, target_pct: 8.6,  is_cash: false, sort_order: 5 },
  { ticker: 'SCCO', shares: 0, price: 0, entry_price: 0, target_pct: 8.6,  is_cash: false, sort_order: 6 },
  { ticker: 'CASH', shares: 0, price: 1, entry_price: 1, target_pct: 39.79, is_cash: true,  sort_order: 7 },
]

function uid() { return 'tmp-' + Math.random().toString(36).slice(2, 9) }
function fmt(n: number, d = 2) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}
function num(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}
function cleanTicker(value: unknown) {
  return String(value ?? '').toUpperCase().replace(/\s+/g, '')
}
function makeCashPosition(overrides: Partial<Position> = {}): Position {
  return {
    id: uid(),
    ticker: 'CASH',
    shares: 0,
    price: 1,
    entry_price: 1,
    target_pct: 0,
    is_cash: true,
    sort_order: 0,
    opened_at: null,
    ...overrides,
  }
}
function normalizePosition(p: Position, index = 0): Position {
  const isCash = Boolean(p.is_cash)
  return {
    ...p,
    id: p.id || uid(),
    ticker: isCash ? 'CASH' : cleanTicker(p.ticker),
    shares: num(p.shares),
    price: isCash ? 1 : num(p.price),
    entry_price: isCash ? 1 : num(p.entry_price),
    target_pct: num(p.target_pct),
    is_cash: isCash,
    sort_order: Number.isFinite(Number(p.sort_order)) ? Number(p.sort_order) : index,
    opened_at: p.opened_at ?? null,
  }
}
function normalizePositions(list: Position[]) {
  const normalized = list.map((p, i) => normalizePosition(p, i))
  const stocks = normalized
    .filter(p => !p.is_cash)
    .sort((a, b) => a.sort_order - b.sort_order)
  const cashRows = normalized.filter(p => p.is_cash)
  const cash = cashRows.length > 0
    ? normalizePosition({
      ...cashRows[0],
      shares: cashRows.reduce((s, p) => s + num(p.shares), 0),
      price: 1,
      entry_price: 1,
    }, stocks.length)
    : makeCashPosition({ sort_order: stocks.length })

  return [
    ...stocks.map((p, i) => ({ ...p, sort_order: i })),
    { ...cash, sort_order: stocks.length },
  ]
}
function applyCashDelta(list: Position[], delta: number) {
  let foundCash = false
  const next = list.map(p => {
    if (!p.is_cash) return p
    foundCash = true
    return { ...p, shares: num(p.shares) + delta, price: 1, entry_price: 1 }
  })
  if (!foundCash) next.push(makeCashPosition({ shares: delta, sort_order: next.length }))
  return next
}
function positionCost(p: Position) {
  return num(p.shares) * num(p.entry_price)
}
function marketValue(p: Position) {
  return num(p.shares) * num(p.price)
}
function formatDateInput(value?: string | null) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toISOString().slice(0, 10)
}
function daysBetween(openedAt: string | null | undefined, closedAt: string) {
  if (!openedAt) return 0
  const start = new Date(openedAt).getTime()
  const end = new Date(closedAt).getTime()
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0
  return Math.ceil((end - start) / 86_400_000)
}
function normalizeClosedTrade(trade: ClosedTrade): ClosedTrade {
  return {
    ...trade,
    shares: num(trade.shares),
    entry_price: num(trade.entry_price),
    exit_price: num(trade.exit_price),
    invested_value: num(trade.invested_value),
    exit_value: num(trade.exit_value),
    profit_value: num(trade.profit_value),
    profit_pct: num(trade.profit_pct),
    duration_days: num(trade.duration_days),
    opened_at: trade.opened_at ?? null,
    closed_at: trade.closed_at,
    notes: trade.notes ?? null,
  }
}

// ── Logo component ────────────────────────────────────────────────────────────
function TickerLogo({ ticker }: { ticker: string }) {
  const [ok, setOk] = useState(true)
  const domain = LOGO_DOMAINS[ticker]
  if (!domain || !ok) {
    return (
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: C.surfaceAlt,
        border: `1px solid ${C.border}`, display: 'flex', alignItems: 'center',
        justifyContent: 'center', fontFamily: FM, fontSize: 9, fontWeight: 700,
        color: C.textDim, flexShrink: 0, letterSpacing: 0,
      }}>
        {ticker.slice(0, 3)}
      </div>
    )
  }
  return (
    <img
      src={`https://logo.clearbit.com/${domain}`}
      alt={ticker}
      onError={() => setOk(false)}
      style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'contain', flexShrink: 0, background: '#fff', padding: 3 }}
    />
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  userId: string
  userEmail: string
  initialPositions: Position[]
  initialSnapshots: Snapshot[]
  initialClosedTrades: ClosedTrade[]
}

interface Row extends Position {
  currentValue: number
  currentPct: number
  targetValue: number
  diffValue: number
  diffShares: number
  pricePct: number  // % change vs entry_price
}

interface ExecutionOrder {
  id: string
  ticker: string
  action: 'BUY' | 'SELL'
  diffValue: number
  diffShares: number
  reason: string
}

type ClosedTradeSort = 'latest' | 'ticker' | 'invested' | 'profitPct'

// ── Component ─────────────────────────────────────────────────────────────────
export default function RebalanceCalculator({ userId, userEmail, initialPositions, initialSnapshots, initialClosedTrades }: Props) {
  const supabase = createClient()
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const targetBasisRef = useRef<Record<string, number>>({})

  const [positions, setPositions] = useState<Position[]>(
    () => normalizePositions(
      initialPositions.length > 0
        ? initialPositions
        : DEFAULT_POSITIONS.map(p => ({ ...p, id: uid() }))
    )
  )
  const [snapshots, setSnapshots] = useState<Snapshot[]>(initialSnapshots)
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>(
    () => initialClosedTrades.map(normalizeClosedTrade)
  )
  const [pendingCloseOrders, setPendingCloseOrders] = useState<ExecutionOrder[]>([])
  const [fractional, setFractional] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [showClosedTrades, setShowClosedTrades] = useState(true)
  const [closedTradeSort, setClosedTradeSort] = useState<ClosedTradeSort>('latest')
  const [snapshotNote, setSnapshotNote] = useState('')
  const [savingSnapshot, setSavingSnapshot] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  useEffect(() => {
    positions.forEach(p => {
      if (targetBasisRef.current[p.id] == null) {
        targetBasisRef.current[p.id] = num(p.target_pct)
      }
    })
  }, [positions])

  // ── Fetch prices ─────────────────────────────────────────────────────────
  const fetchPrices = useCallback(async (silent = false) => {
    const tickers = positions.filter(p => !p.is_cash && p.ticker).map(p => p.ticker)
    if (!tickers.length) return
    if (!silent) setRefreshing(true)
    try {
      const res = await fetch(`/api/prices?tickers=${tickers.join(',')}`)
      const prices: Record<string, number> = await res.json()
      setPositions(prev => prev.map(p =>
        prices[p.ticker] != null ? { ...p, price: prices[p.ticker] } : p
      ))
      setLastRefresh(new Date())
      if (!silent) showToast('تم تحديث الأسعار ✓')
    } catch {
      if (!silent) showToast('تعذر تحديث الأسعار', 'err')
    } finally {
      if (!silent) setRefreshing(false)
    }
  }, [positions])

  // Auto-refresh every 60s
  useEffect(() => {
    timerRef.current = setInterval(() => fetchPrices(true), PRICE_REFRESH_MS)
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [fetchPrices])

  const persistPositions = async (sourcePositions: Position[]) => {
    const { error: delError } = await supabase
      .from('positions')
      .delete()
      .eq('user_id', userId)

    if (delError) throw delError

    const orderedPositions = normalizePositions(sourcePositions)
    const rows = orderedPositions.map((p, i) => ({
      user_id: userId,
      ticker: p.ticker,
      shares: Number(p.shares) || 0,
      price: Number(p.price) || 0,
      entry_price: Number(p.entry_price) || 0,
      target_pct: Number(p.target_pct) || 0,
      is_cash: p.is_cash,
      sort_order: i,
      opened_at: p.opened_at,
    }))

    const { data, error: insError } = await supabase
      .from('positions')
      .insert(rows)
      .select()

    if (insError) throw insError

    return normalizePositions((data ?? []) as Position[])
  }

  // ── Save positions ────────────────────────────────────────────────────────
  const savePositions = async () => {
    setSaving(true)
    try {
      const savedPositions = await persistPositions(positions)
      targetBasisRef.current = Object.fromEntries(
        savedPositions.map(p => [p.id, num(p.target_pct)])
      )
      setPendingCloseOrders([])
      setPositions(savedPositions)
      showToast('تم الحفظ ✓')
    } catch (e: any) {
      console.error('Save error:', e)
      showToast(`خطأ: ${e?.message ?? 'تعذر الحفظ'}`, 'err')
    } finally {
      setSaving(false)
    }
  }

  // ── Save snapshot ─────────────────────────────────────────────────────────
  const saveSnapshot = async () => {
    setSavingSnapshot(true)
    try {
      const totalValue = positions.reduce((s, p) => s + p.shares * p.price, 0)
      const { data, error } = await supabase
        .from('snapshots')
        .insert({
          user_id: userId,
          total_value: totalValue,
          positions: positions, // full positions saved
          note: snapshotNote || null,
        })
        .select()
        .single()
      if (error) throw error
      setSnapshots(prev => [data as Snapshot, ...prev].slice(0, 20))
      setSnapshotNote('')
      showToast('تم حفظ اللقطة ✓')
    } catch (e: any) {
      showToast(`خطأ: ${e?.message ?? 'تعذر الحفظ'}`, 'err')
    } finally {
      setSavingSnapshot(false)
    }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const update = (id: string, field: keyof Position, value: string | number | boolean | null) => {
    setPositions(prev => {
      let cashDelta = 0
      const next = prev.map(p => {
        if (p.id !== id) return p

        let nextValue: string | number | boolean | null = value
        if (field === 'ticker') nextValue = cleanTicker(value)
        if (['shares', 'price', 'entry_price', 'target_pct', 'sort_order'].includes(field)) {
          nextValue = num(value)
        }

        const beforeCost = positionCost(p)
        const updated = { ...p, [field]: nextValue } as Position

        if (updated.is_cash) {
          updated.ticker = 'CASH'
          updated.price = 1
          updated.entry_price = 1
        }

        if (!p.is_cash && (field === 'shares' || field === 'entry_price')) {
          cashDelta += beforeCost - positionCost(updated)
        }

        return updated
      })

      return normalizePositions(cashDelta === 0 ? next : applyCashDelta(next, cashDelta))
    })
  }

  const addPosition = () => {
    const stockCount = positions.filter(p => !p.is_cash).length
    const position: Position = {
      id: uid(),
      ticker: '',
      shares: 0,
      price: 0,
      entry_price: 0,
      target_pct: 0,
      is_cash: false,
      sort_order: stockCount,
      opened_at: new Date().toISOString(),
    }
    targetBasisRef.current[position.id] = 0
    setPositions(prev => normalizePositions([...prev, position]))
  }

  const closePosition = async (position: Position) => {
    const p = normalizePosition(position)
    const investedValue = positionCost(p)
    const exitPrice = num(p.price) || num(p.entry_price)
    const exitValue = num(p.shares) * exitPrice

    if (!p.ticker && investedValue === 0 && exitValue === 0) {
      setPositions(prev => normalizePositions(prev.filter(item => item.id !== p.id)))
      return
    }

    const closedAt = new Date().toISOString()
    const trade = {
      user_id: userId,
      ticker: p.ticker || '—',
      shares: num(p.shares),
      entry_price: num(p.entry_price),
      exit_price: exitPrice,
      invested_value: investedValue,
      exit_value: exitValue,
      profit_value: exitValue - investedValue,
      profit_pct: investedValue > 0 ? ((exitValue - investedValue) / investedValue) * 100 : 0,
      duration_days: daysBetween(p.opened_at, closedAt),
      opened_at: p.opened_at ?? null,
      closed_at: closedAt,
      notes: null,
      position_data: p,
    }

    setClosingId(p.id)
    try {
      const { data, error } = await supabase
        .from('closed_trades')
        .insert(trade)
        .select()
        .single()

      if (error) throw error

      const nextPositions = normalizePositions(
        applyCashDelta(positions.filter(item => item.id !== p.id), exitValue)
      )
      const savedPositions = await persistPositions(nextPositions)
      const savedTrade = normalizeClosedTrade(data as ClosedTrade)
      setClosedTrades(prev => [savedTrade, ...prev])
      setPendingCloseOrders(prev => [{
        id: `close-${p.id}-${Date.now()}`,
        ticker: p.ticker || '—',
        action: 'SELL' as const,
        diffValue: -exitValue,
        diffShares: -num(p.shares),
        reason: 'قفل صفقة',
      }, ...prev].slice(0, 8))
      targetBasisRef.current = Object.fromEntries(
        savedPositions.map(item => [item.id, num(item.target_pct)])
      )
      setPositions(savedPositions)
      showToast('تم قفل الصفقة وإضافة المبلغ للكاش ✓')
    } catch (e: any) {
      console.error('Close trade error:', e)
      showToast(`خطأ: ${e?.message ?? 'تعذر قفل الصفقة'}`, 'err')
    } finally {
      setClosingId(null)
    }
  }

  // ── Computed ──────────────────────────────────────────────────────────────
  const orderedPositions = normalizePositions(positions)
  const stockPositions = orderedPositions.filter(p => !p.is_cash)
  const cashPosition = orderedPositions.find(p => p.is_cash) ?? makeCashPosition()
  const investedCost = stockPositions.reduce((s, p) => s + positionCost(p), 0)
  const investedMarketValue = stockPositions.reduce((s, p) => s + marketValue(p), 0)
  const cashValue = marketValue(cashPosition)
  const totalValue = investedMarketValue + cashValue
  const liveGainValue = investedMarketValue - investedCost
  const liveGainPct = investedCost > 0 ? (liveGainValue / investedCost) * 100 : 0
  const targetSum = orderedPositions.reduce((s, p) => s + (Number(p.target_pct) || 0), 0)
  const targetWarn = Math.abs(targetSum - 100) > 0.5
  const scaleMax = Math.max(10, ...orderedPositions.map(p => {
    const cur = totalValue > 0 ? (p.shares * p.price / totalValue) * 100 : 0
    return Math.max(p.target_pct, cur)
  })) * 1.15

  const rows: Row[] = orderedPositions.map(p => {
    const currentValue = p.shares * p.price
    const currentPct = totalValue > 0 ? (currentValue / totalValue) * 100 : 0
    const targetValue = (totalValue * p.target_pct) / 100
    const diffValue = targetValue - currentValue
    let diffShares = p.price > 0 ? diffValue / p.price : 0
    if (!fractional && !p.is_cash) diffShares = Math.round(diffShares)
    const pricePct = p.entry_price > 0 ? ((p.price - p.entry_price) / p.entry_price) * 100 : 0
    return { ...p, currentValue, currentPct, targetValue, diffValue, diffShares, pricePct }
  })

  const targetChangeOrders: ExecutionOrder[] = rows
    .filter(r => !r.is_cash)
    .map(r => {
      const targetBasis = targetBasisRef.current[r.id] ?? num(r.target_pct)
      const targetDeltaPct = num(r.target_pct) - targetBasis
      const diffValue = (totalValue * targetDeltaPct) / 100
      const orderPrice = num(r.price) || num(r.entry_price)
      let diffShares = orderPrice > 0 ? diffValue / orderPrice : 0
      if (!fractional) diffShares = Math.round(diffShares)
      return {
        id: `target-${r.id}`,
        ticker: r.ticker || '—',
        action: diffValue < 0 ? 'SELL' as const : 'BUY' as const,
        diffValue,
        diffShares,
        reason: 'تعديل نسبة يدوي',
      }
    })
    .filter(o => Math.abs(o.diffValue) > MIN_TRADE)

  const orders = [...pendingCloseOrders, ...targetChangeOrders]
    .filter(o => Math.abs(o.diffValue) > MIN_TRADE)
    .sort((a, b) => a.diffValue - b.diffValue)

  const sortedClosedTrades = useMemo(() => {
    return [...closedTrades].sort((a, b) => {
      if (closedTradeSort === 'ticker') return a.ticker.localeCompare(b.ticker)
      if (closedTradeSort === 'invested') return b.invested_value - a.invested_value
      if (closedTradeSort === 'profitPct') return b.profit_pct - a.profit_pct
      return new Date(b.closed_at).getTime() - new Date(a.closed_at).getTime()
    })
  }, [closedTrades, closedTradeSort])
  const liveGainColor = liveGainValue >= 0 ? C.teal : C.sell

  // ── Input style ───────────────────────────────────────────────────────────
  const inp: React.CSSProperties = {
    background: C.surfaceAlt, border: `1px solid ${C.border}`,
    borderRadius: 8, color: C.text, fontFamily: FM, fontSize: 13,
    padding: '8px 10px', width: '100%', outline: 'none',
  }
  const btn: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    fontFamily: FA, fontWeight: 700, fontSize: 14, borderRadius: 10,
    padding: '10px 16px', border: `1px solid ${C.border}`,
    background: C.surfaceAlt, color: C.text, cursor: 'pointer',
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div dir="rtl" style={{ background: C.bg, minHeight: '100vh', fontFamily: FA, color: C.text, paddingBottom: 60 }}>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'ok' ? C.teal : C.sell, color: '#0A0B10',
          fontWeight: 700, fontSize: 14, padding: '10px 20px', borderRadius: 12,
          zIndex: 9999, display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap',
        }}>
          {toast.type === 'ok' ? <Check size={15} /> : <X size={15} />} {toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 0' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: FM, fontSize: 10, letterSpacing: 2, color: C.textFaint, marginBottom: 5 }}>PORTFOLIO REBALANCER</div>
            <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0 }}>حاسبة إعادة التوازن</h1>
          </div>
          <button onClick={signOut} style={{ ...btn, padding: '8px 12px' }} title="خروج">
            <LogOut size={15} />
          </button>
        </div>

        <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 18 }}>{userEmail}</div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: targetWarn ? 10 : 20 }}>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>إجمالي المحفظة</div>
            <div style={{ fontFamily: FM, fontSize: 19, fontWeight: 700, direction: 'ltr', textAlign: 'right' }}>${fmt(totalValue, 0)}</div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>الكاش</div>
            <div style={{ fontFamily: FM, fontSize: 19, fontWeight: 700, direction: 'ltr', textAlign: 'right' }}>${fmt(cashValue, 0)}</div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>إجمالي الاستثمار</div>
            <div style={{ fontFamily: FM, fontSize: 19, fontWeight: 700, direction: 'ltr', textAlign: 'right' }}>${fmt(investedCost, 0)}</div>
          </div>
          <div style={{ background: C.surface, border: `1px solid ${liveGainColor}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>الربح/الخسارة اللحظية</div>
            <div style={{ fontFamily: FM, fontSize: 16, fontWeight: 700, direction: 'ltr', textAlign: 'right', color: liveGainColor }}>
              {liveGainValue >= 0 ? '+' : ''}${fmt(liveGainValue, 0)}
            </div>
            <div style={{ fontFamily: FM, fontSize: 12, direction: 'ltr', textAlign: 'right', color: liveGainColor }}>
              {liveGainPct >= 0 ? '+' : ''}{fmt(liveGainPct, 2)}%
            </div>
          </div>
        </div>

        {targetWarn && (
          <div style={{ display: 'flex', gap: 8, background: C.sellDim, border: `1px solid ${C.sell}`, borderRadius: 10, padding: '10px 12px', marginBottom: 20, fontSize: 13 }}>
            <AlertTriangle size={15} color={C.sell} style={{ flexShrink: 0, marginTop: 2 }} />
            مجموع النسب الحالي {fmt(targetSum, 2)}% — راجع أرقام التحديث
          </div>
        )}

        {/* Controls bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>المراكز</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.textDim, cursor: 'pointer' }}>
              <input type="checkbox" checked={fractional} onChange={e => setFractional(e.target.checked)} />
              كسور
            </label>
            <button onClick={() => fetchPrices(false)} disabled={refreshing} style={{ ...btn, padding: '7px 12px', fontSize: 12 }}>
              <RefreshCw size={13} style={{ animation: refreshing ? 'spin 1s linear infinite' : 'none' }} />
              {lastRefresh ? lastRefresh.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'أسعار حية'}
            </button>
          </div>
        </div>

        {/* Position cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {rows.map(r => {
            const drift = r.target_pct - r.currentPct
            const markerColor = r.is_cash ? C.textDim : drift > 0.1 ? C.blue : drift < -0.1 ? C.sell : C.teal
            const isUp = r.pricePct >= 0

            return (
              <div key={r.id} style={{ background: C.surface, border: `1px solid ${r.is_cash ? C.yellow : C.border}`, borderRadius: 14, padding: 14 }}>

                {/* Top: logo + ticker + price + pct change */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <TickerLogo ticker={r.ticker} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: FM, fontWeight: 700, fontSize: 15, direction: 'ltr' }}>
                        {r.ticker || '—'}
                      </span>
                      {!r.is_cash && r.price > 0 && (
                        <span style={{ fontFamily: FM, fontSize: 13, color: C.textDim, direction: 'ltr' }}>
                          ${fmt(r.price)}
                        </span>
                      )}
                      {!r.is_cash && r.entry_price > 0 && r.price > 0 && (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 2,
                          fontSize: 12, fontFamily: FM, fontWeight: 600,
                          color: isUp ? C.teal : C.sell,
                          background: isUp ? C.tealDim : C.sellDim,
                          padding: '2px 7px', borderRadius: 6, direction: 'ltr',
                        }}>
                          {isUp ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                          {isUp ? '+' : ''}{fmt(r.pricePct, 2)}%
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: C.textFaint, marginTop: 2, direction: 'ltr' }}>
                      ${fmt(r.currentValue, 0)} • {fmt(r.currentPct, 1)}% من المحفظة
                    </div>
                  </div>
                  {!r.is_cash && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => closePosition(r)} disabled={closingId === r.id}
                        style={{ ...btn, padding: '6px 9px', fontSize: 11, borderRadius: 8, color: C.teal }}>
                        {closingId === r.id ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={13} />}
                        قفل
                      </button>
                      <button onClick={() => closePosition(r)} disabled={closingId === r.id}
                        title="حذف وقفل الصفقة"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textFaint, padding: 4, flexShrink: 0 }}>
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>

                {/* Inputs */}
                {r.is_cash ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>مبلغ الكاش $</div>
                      <input style={inp} dir="ltr" type="number" inputMode="decimal"
                        value={r.shares || ''} placeholder="0"
                        onChange={e => update(r.id, 'shares', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>النسبة المستهدفة %</div>
                      <input style={inp} dir="ltr" type="number" inputMode="decimal"
                        value={r.target_pct || ''} placeholder="0"
                        onChange={e => update(r.id, 'target_pct', parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>رمز السهم</div>
                      <input style={{ ...inp, textTransform: 'uppercase' }} dir="ltr" type="text"
                        value={r.ticker} placeholder="AAPL"
                        onChange={e => update(r.id, 'ticker', e.target.value)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>الأسهم</div>
                      <input style={inp} dir="ltr" type="number" inputMode="decimal"
                        value={r.shares || ''} placeholder="0"
                        onChange={e => update(r.id, 'shares', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>سعر الدخول $</div>
                      <input style={inp} dir="ltr" type="number" inputMode="decimal"
                        value={r.entry_price || ''} placeholder="0"
                        onChange={e => update(r.id, 'entry_price', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>السعر الحالي $</div>
                      <input style={inp} dir="ltr" type="number" inputMode="decimal"
                        value={r.price || ''} placeholder="0"
                        onChange={e => update(r.id, 'price', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>النسبة %</div>
                      <input style={inp} dir="ltr" type="number" inputMode="decimal"
                        value={r.target_pct || ''} placeholder="0"
                        onChange={e => update(r.id, 'target_pct', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>تاريخ الدخول</div>
                      <input style={inp} dir="ltr" type="date"
                        value={formatDateInput(r.opened_at)}
                        onChange={e => update(r.id, 'opened_at', e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null)} />
                    </div>
                  </div>
                )}

                {/* Progress bar */}
                <div style={{ position: 'relative', height: 7, background: C.surfaceAlt, borderRadius: 4, direction: 'ltr' }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4,
                    width: `${Math.min(100, (r.currentPct / scaleMax) * 100)}%`,
                    background: C.borderLight,
                  }} />
                  <div style={{
                    position: 'absolute', top: -3, width: 3, height: 13, borderRadius: 2,
                    background: markerColor, transform: 'translateX(-50%)',
                    left: `${Math.min(100, (r.target_pct / scaleMax) * 100)}%`,
                  }} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, fontFamily: FM, color: C.textFaint, direction: 'ltr' }}>
                  <span>now {fmt(r.currentPct, 1)}%</span>
                  <span style={{ color: markerColor }}>target {fmt(r.target_pct, 1)}%</span>
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={addPosition}
          style={{ ...btn, width: '100%', marginBottom: 28 }}>
          <Plus size={15} /> إضافة سهم
        </button>

        {/* Orders */}
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>أوامر التنفيذ</h2>
        {orders.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, textAlign: 'center', color: C.textDim, fontSize: 14, marginBottom: 28 }}>
            لا توجد أوامر تنفيذ الآن ✓
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
            {orders.map(o => {
              const isSell = o.diffValue < 0
              const color = isSell ? C.sell : C.blue
              const bg = isSell ? C.sellDim : C.blueDim
              return (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
                  <TickerLogo ticker={o.ticker} />
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginRight: -6 }}>
                    {isSell ? <ArrowDownRight size={15} color={color} /> : <ArrowUpRight size={15} color={color} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontFamily: FM, direction: 'ltr' }}>{o.ticker || '—'}</span>
                      <span style={{ fontSize: 12, color, fontWeight: 700 }}>{isSell ? 'بيع' : 'شراء'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.textDim, fontFamily: FM, direction: 'ltr' }}>
                      {fmt(Math.abs(o.diffShares), fractional ? 4 : 0)} سهم
                    </div>
                    <div style={{ fontSize: 11, color: C.textFaint }}>{o.reason}</div>
                  </div>
                  <div style={{ fontFamily: FM, fontWeight: 700, fontSize: 16, color, direction: 'ltr' }}>
                    ${fmt(Math.abs(o.diffValue), 0)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Closed trades */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <button onClick={() => setShowClosedTrades(v => !v)}
              style={{ ...btn, flex: 1, justifyContent: 'center', padding: '8px 12px' }}>
              <History size={14} />
              الصفقات المقفولة ({closedTrades.length})
              <ChevronDown size={14} style={{ transform: showClosedTrades ? 'rotate(180deg)' : 'none', transition: '.2s' }} />
            </button>
            <select
              value={closedTradeSort}
              onChange={e => setClosedTradeSort(e.target.value as ClosedTradeSort)}
              style={{ ...inp, width: 150, fontFamily: FA, fontSize: 12, padding: '8px 9px' }}
            >
              <option value="latest">الأحدث</option>
              <option value="ticker">أبجدي</option>
              <option value="invested">المبلغ المستثمر</option>
              <option value="profitPct">نسبة الربح/الخسارة</option>
            </select>
          </div>

          {showClosedTrades && (
            sortedClosedTrades.length === 0 ? (
              <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 18, textAlign: 'center', color: C.textDim, fontSize: 13 }}>
                لا توجد صفقات مقفولة بعد
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {sortedClosedTrades.map(trade => {
                  const isWin = trade.profit_value >= 0
                  const color = isWin ? C.teal : C.sell
                  return (
                    <div key={trade.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                          <TickerLogo ticker={trade.ticker} />
                          <div>
                            <div style={{ fontFamily: FM, fontWeight: 700, direction: 'ltr' }}>{trade.ticker}</div>
                            <div style={{ fontSize: 11, color: C.textFaint }}>
                              مدة الصفقة: {trade.duration_days || 0} يوم
                            </div>
                          </div>
                        </div>
                        <div style={{ textAlign: 'left', direction: 'ltr' }}>
                          <div style={{ fontFamily: FM, fontWeight: 800, color }}>
                            {isWin ? '+' : ''}${fmt(trade.profit_value, 0)}
                          </div>
                          <div style={{ fontFamily: FM, fontSize: 12, color }}>
                            {isWin ? '+' : ''}{fmt(trade.profit_pct, 2)}%
                          </div>
                        </div>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11 }}>
                        <div style={{ color: C.textDim }}>الأسهم: <span style={{ color: C.text, fontFamily: FM, direction: 'ltr' }}>{fmt(trade.shares, 4)}</span></div>
                        <div style={{ color: C.textDim }}>المستثمر: <span style={{ color: C.text, fontFamily: FM, direction: 'ltr' }}>${fmt(trade.invested_value, 0)}</span></div>
                        <div style={{ color: C.textDim }}>الدخول: <span style={{ color: C.text, fontFamily: FM, direction: 'ltr' }}>${fmt(trade.entry_price)}</span></div>
                        <div style={{ color: C.textDim }}>الخروج: <span style={{ color: C.text, fontFamily: FM, direction: 'ltr' }}>${fmt(trade.exit_price)}</span></div>
                        <div style={{ color: C.textDim }}>قيمة الخروج: <span style={{ color: C.text, fontFamily: FM, direction: 'ltr' }}>${fmt(trade.exit_value, 0)}</span></div>
                        <div style={{ color: C.textDim }}>تاريخ الدخول: <span style={{ color: C.text }}>{trade.opened_at ? new Date(trade.opened_at).toLocaleDateString('ar-EG') : '—'}</span></div>
                        <div style={{ color: C.textDim }}>تاريخ القفل: <span style={{ color: C.text }}>{new Date(trade.closed_at).toLocaleDateString('ar-EG')}</span></div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>

        {/* Save + Snapshot */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          <button onClick={savePositions} disabled={saving}
            style={{ ...btn, background: C.blue, border: `1px solid ${C.blue}`, color: '#0A0B10', justifyContent: 'center' }}>
            {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={15} />}
            حفظ المراكز
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <input style={{ ...inp, flex: 1, fontFamily: FA, fontSize: 13 }} dir="rtl"
              placeholder="ملاحظة للقطة — مثال: تحديث يونيو 2026"
              value={snapshotNote} onChange={e => setSnapshotNote(e.target.value)} />
            <button onClick={saveSnapshot} disabled={savingSnapshot} style={{ ...btn, flexShrink: 0, padding: '8px 14px' }}>
              {savingSnapshot ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <History size={14} />}
              لقطة
            </button>
          </div>
        </div>

        {/* History */}
        {snapshots.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <button onClick={() => setShowHistory(h => !h)}
              style={{ ...btn, width: '100%', justifyContent: 'center', marginBottom: 10 }}>
              <History size={14} />
              سجل التحديثات ({snapshots.length})
              <ChevronDown size={14} style={{ transform: showHistory ? 'rotate(180deg)' : 'none', transition: '.2s' }} />
            </button>
            {showHistory && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {snapshots.map(snap => {
                  const pos = snap.positions as Position[]
                  return (
                    <div key={snap.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <div style={{ fontSize: 12, color: C.textDim }}>
                          {new Date(snap.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                        <div style={{ fontFamily: FM, fontWeight: 700, fontSize: 15, direction: 'ltr' }}>
                          ${fmt(snap.total_value, 0)}
                        </div>
                      </div>
                      {snap.note && <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 8 }}>{snap.note}</div>}
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {pos.filter(p => !p.is_cash).map(p => (
                          <div key={p.ticker} style={{ background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 7, padding: '4px 9px', fontSize: 11, fontFamily: FM, direction: 'ltr' }}>
                            {p.ticker} <span style={{ color: C.textDim }}>{fmt(p.target_pct, 1)}%</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg) } to { transform: rotate(360deg) } }
        input[type=number]::-webkit-outer-spin-button,
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        input[type=number] { -moz-appearance: textfield; }
      `}</style>
    </div>
  )
}
