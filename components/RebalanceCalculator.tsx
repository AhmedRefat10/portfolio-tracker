'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Position, Snapshot } from '@/lib/types'
import {
  Plus, Trash2, Save, LogOut, RefreshCw, History,
  ArrowUpRight, ArrowDownRight, AlertTriangle, Check, X, Loader2, ChevronDown
} from 'lucide-react'

// ─── Constants ────────────────────────────────────────────────────────────────

const C = {
  bg: '#0A0B10', surface: '#131520', surfaceAlt: '#1A1D2B',
  border: '#262A3A', borderLight: '#363A4C',
  text: '#F3F4F7', textDim: '#8B8FA3', textFaint: '#5B5F70',
  blue: '#4C8DFF', blueDim: 'rgba(76,141,255,0.16)',
  sell: '#FF6B5B', sellDim: 'rgba(255,107,91,0.16)',
  teal: '#34D399', yellow: '#FBBF24',
}

const FONT_AR = "'Tajawal', sans-serif"
const FONT_MONO = "'IBM Plex Mono', monospace"
const MIN_TRADE = 5

const DEFAULT_POSITIONS: Omit<Position, 'id'>[] = [
  { ticker: 'ADI',  shares: 0, price: 0, target_pct: 8.6,  is_cash: false, sort_order: 0 },
  { ticker: 'AMD',  shares: 0, price: 0, target_pct: 8.6,  is_cash: false, sort_order: 1 },
  { ticker: 'ARM',  shares: 0, price: 0, target_pct: 8.6,  is_cash: false, sort_order: 2 },
  { ticker: 'KNSA', shares: 0, price: 0, target_pct: 8.6,  is_cash: false, sort_order: 3 },
  { ticker: 'LRCX', shares: 0, price: 0, target_pct: 8.6,  is_cash: false, sort_order: 4 },
  { ticker: 'MRVL', shares: 0, price: 0, target_pct: 8.6,  is_cash: false, sort_order: 5 },
  { ticker: 'SCCO', shares: 0, price: 0, target_pct: 8.6,  is_cash: false, sort_order: 6 },
  { ticker: 'CASH', shares: 0, price: 1, target_pct: 39.79, is_cash: true,  sort_order: 7 },
]

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number, d = 2) {
  return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
}

function uid(): string {
  return 'tmp-' + Math.random().toString(36).slice(2, 9)
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Props {
  userId: string
  userEmail: string
  initialPositions: Position[]
  initialSnapshots: Snapshot[]
}

interface Row extends Position {
  currentValue: number
  currentPct: number
  targetValue: number
  diffValue: number
  diffShares: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RebalanceCalculator({
  userId, userEmail, initialPositions, initialSnapshots
}: Props) {
  const supabase = createClient()

  const [positions, setPositions] = useState<Position[]>(
    initialPositions.length > 0
      ? initialPositions
      : DEFAULT_POSITIONS.map(p => ({ ...p, id: uid() }))
  )
  const [snapshots, setSnapshots] = useState<Snapshot[]>(initialSnapshots)
  const [fractional, setFractional] = useState(true)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null)
  const [showHistory, setShowHistory] = useState(false)
  const [snapshotNote, setSnapshotNote] = useState('')
  const [savingSnapshot, setSavingSnapshot] = useState(false)

  // ── Toast helper ────────────────────────────────────────────────────────────
  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), 3000)
  }

  // ── Fetch live prices ───────────────────────────────────────────────────────
  const fetchPrices = useCallback(async () => {
    const tickers = positions.filter(p => !p.is_cash).map(p => p.ticker).filter(Boolean)
    if (!tickers.length) return
    setRefreshing(true)
    try {
      const res = await fetch(`/api/prices?tickers=${tickers.join(',')}`)
      const prices: Record<string, number> = await res.json()
      setPositions(prev => prev.map(p =>
        prices[p.ticker] != null ? { ...p, price: prices[p.ticker] } : p
      ))
      showToast('تم تحديث الأسعار ✓')
    } catch {
      showToast('تعذر تحديث الأسعار', 'err')
    } finally {
      setRefreshing(false)
    }
  }, [positions])

  // ── Save positions to Supabase ──────────────────────────────────────────────
  const savePositions = async () => {
    setSaving(true)
    try {
      // delete old, insert fresh (simplest approach for personal app)
      await supabase.from('positions').delete().eq('user_id', userId)
      const rows = positions.map((p, i) => ({
        ...p,
        id: undefined, // let Supabase generate UUID for new rows
        user_id: userId,
        sort_order: i,
      }))
      const { error } = await supabase.from('positions').insert(rows)
      if (error) throw error
      showToast('تم الحفظ ✓')
    } catch {
      showToast('خطأ في الحفظ', 'err')
    } finally {
      setSaving(false)
    }
  }

  // ── Save snapshot (rebalance event) ────────────────────────────────────────
  const saveSnapshot = async () => {
    setSavingSnapshot(true)
    try {
      const totalValue = positions.reduce((s, p) => s + p.shares * p.price, 0)
      const { data, error } = await supabase
        .from('snapshots')
        .insert({
          user_id: userId,
          total_value: totalValue,
          positions: positions,
          note: snapshotNote || null,
        })
        .select()
        .single()
      if (error) throw error
      setSnapshots(prev => [data as Snapshot, ...prev].slice(0, 10))
      setSnapshotNote('')
      showToast('تم حفظ اللقطة ✓')
    } catch {
      showToast('خطأ في حفظ اللقطة', 'err')
    } finally {
      setSavingSnapshot(false)
    }
  }

  // ── Sign out ────────────────────────────────────────────────────────────────
  const signOut = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // ── Position helpers ────────────────────────────────────────────────────────
  const update = (id: string, field: keyof Position, value: string | number | boolean) => {
    setPositions(prev => prev.map(p => p.id === id ? { ...p, [field]: value } : p))
  }

  const remove = (id: string) => setPositions(prev => prev.filter(p => p.id !== id))

  const addPosition = () => {
    setPositions(prev => [
      ...prev,
      { id: uid(), ticker: '', shares: 0, price: 0, target_pct: 0, is_cash: false, sort_order: prev.length }
    ])
  }

  // ── Computed values ─────────────────────────────────────────────────────────
  const totalValue = positions.reduce((s, p) => s + p.shares * p.price, 0)
  const targetSum = positions.reduce((s, p) => s + (Number(p.target_pct) || 0), 0)
  const scaleMax = Math.max(10, ...positions.map(p => Math.max(p.target_pct, totalValue > 0 ? (p.shares * p.price / totalValue) * 100 : 0))) * 1.15

  const rows: Row[] = positions.map(p => {
    const currentValue = p.shares * p.price
    const currentPct = totalValue > 0 ? (currentValue / totalValue) * 100 : 0
    const targetValue = (totalValue * p.target_pct) / 100
    const diffValue = targetValue - currentValue
    let diffShares = p.price > 0 ? diffValue / p.price : 0
    if (!fractional && !p.is_cash) diffShares = Math.round(diffShares)
    return { ...p, currentValue, currentPct, targetValue, diffValue, diffShares }
  })

  const orders = rows
    .filter(r => !r.is_cash && Math.abs(r.diffValue) > MIN_TRADE)
    .sort((a, b) => a.diffValue - b.diffValue) // sells first

  const targetWarn = Math.abs(targetSum - 100) > 0.5

  // ── Styles ──────────────────────────────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    background: C.surfaceAlt, border: `1px solid ${C.border}`, borderRadius: 8,
    color: C.text, fontFamily: FONT_MONO, fontSize: 14,
    padding: '8px 10px', width: '100%', outline: 'none',
  }

  const btnStyle: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    fontFamily: FONT_AR, fontWeight: 700, fontSize: 14, borderRadius: 10,
    padding: '10px 16px', border: `1px solid ${C.border}`,
    background: C.surfaceAlt, color: C.text, cursor: 'pointer',
  }

  return (
    <div dir="rtl" style={{ background: C.bg, minHeight: '100vh', fontFamily: FONT_AR, color: C.text, paddingBottom: 60 }}>

      {/* ── Toast ── */}
      {toast && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'ok' ? C.teal : C.sell,
          color: '#0A0B10', fontWeight: 700, fontSize: 14,
          padding: '10px 20px', borderRadius: 12, zIndex: 9999,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {toast.type === 'ok' ? <Check size={15} /> : <X size={15} />}
          {toast.msg}
        </div>
      )}

      <div style={{ maxWidth: 560, margin: '0 auto', padding: '24px 16px 0' }}>

        {/* ── Header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 10, letterSpacing: 2, color: C.textFaint, marginBottom: 6 }}>
              MANUAL REBALANCE ENGINE
            </div>
            <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>حاسبة إعادة التوازن</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button onClick={signOut} style={{ ...btnStyle, padding: '8px 12px' }}>
              <LogOut size={15} />
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 20 }}>
          مسجّل دخول كـ {userEmail}
        </div>

        {/* ── Stats row ── */}
        <div style={{ display: 'flex', gap: 10, marginBottom: targetWarn ? 10 : 22 }}>
          <div style={{ flex: 1, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>إجمالي المحفظة</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 18, fontWeight: 700, direction: 'ltr', textAlign: 'right' }}>
              ${fmt(totalValue, 0)}
            </div>
          </div>
          <div style={{ flex: 1, background: C.surface, border: `1px solid ${targetWarn ? C.sell : C.border}`, borderRadius: 12, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: C.textDim, marginBottom: 4 }}>مجموع النسب</div>
            <div style={{ fontFamily: FONT_MONO, fontSize: 18, fontWeight: 700, direction: 'ltr', textAlign: 'right', color: targetWarn ? C.sell : C.text }}>
              {fmt(targetSum, 2)}%
            </div>
          </div>
        </div>

        {targetWarn && (
          <div style={{ display: 'flex', gap: 8, background: C.sellDim, border: `1px solid ${C.sell}`, borderRadius: 10, padding: '10px 12px', marginBottom: 22, fontSize: 13 }}>
            <AlertTriangle size={15} color={C.sell} style={{ flexShrink: 0, marginTop: 2 }} />
            <span>مجموع النسب مش 100% — راجع أرقام التحديث قبل ما تنفذ.</span>
          </div>
        )}

        {/* ── Controls ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>المراكز</h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.textDim, cursor: 'pointer' }}>
              <input type="checkbox" checked={fractional} onChange={e => setFractional(e.target.checked)} />
              كسور الأسهم
            </label>
            <button onClick={fetchPrices} disabled={refreshing} style={{ ...btnStyle, padding: '7px 12px', fontSize: 12 }}>
              <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
              أسعار حية
            </button>
          </div>
        </div>

        {/* ── Position cards ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
          {rows.map(r => {
            const drift = r.targetPct - r.currentPct
            const markerColor = r.is_cash ? C.textDim : drift > 0.1 ? C.blue : drift < -0.1 ? C.sell : C.teal

            return (
              <div key={r.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 14 }}>
                {/* top row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <input
                    style={{ ...inputStyle, width: 90, fontWeight: 700 }}
                    dir="ltr"
                    value={r.ticker}
                    disabled={r.is_cash}
                    placeholder="TICKER"
                    onChange={e => update(r.id, 'ticker', e.target.value.toUpperCase())}
                  />
                  <div style={{ flex: 1 }} />
                  <div style={{ fontFamily: FONT_MONO, fontSize: 13, color: C.textDim, direction: 'ltr' }}>
                    ${fmt(r.currentValue, 0)}
                  </div>
                  {!r.is_cash && (
                    <button onClick={() => remove(r.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textFaint, padding: 4 }}>
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {/* inputs */}
                {r.is_cash ? (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>مبلغ الكاش $</div>
                      <input style={inputStyle} dir="ltr" type="number" inputMode="decimal"
                        value={r.shares || ''} placeholder="0"
                        onChange={e => update(r.id, 'shares', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>النسبة المستهدفة %</div>
                      <input style={inputStyle} dir="ltr" type="number" inputMode="decimal"
                        value={r.target_pct || ''} placeholder="0"
                        onChange={e => update(r.id, 'target_pct', parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>الأسهم</div>
                      <input style={inputStyle} dir="ltr" type="number" inputMode="decimal"
                        value={r.shares || ''} placeholder="0"
                        onChange={e => update(r.id, 'shares', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>السعر $</div>
                      <input style={inputStyle} dir="ltr" type="number" inputMode="decimal"
                        value={r.price || ''} placeholder="0"
                        onChange={e => update(r.id, 'price', parseFloat(e.target.value) || 0)} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: C.textFaint, marginBottom: 4 }}>النسبة %</div>
                      <input style={inputStyle} dir="ltr" type="number" inputMode="decimal"
                        value={r.target_pct || ''} placeholder="0"
                        onChange={e => update(r.id, 'target_pct', parseFloat(e.target.value) || 0)} />
                    </div>
                  </div>
                )}

                {/* bar */}
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
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 5, fontSize: 11, fontFamily: FONT_MONO, color: C.textFaint, direction: 'ltr' }}>
                  <span>now {fmt(r.currentPct, 1)}%</span>
                  <span style={{ color: markerColor }}>target {fmt(r.target_pct, 1)}%</span>
                </div>
              </div>
            )
          })}
        </div>

        <button onClick={addPosition} style={{ ...btnStyle, width: '100%', marginBottom: 28 }}>
          <Plus size={15} /> إضافة سهم
        </button>

        {/* ── Orders ── */}
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>أوامر التنفيذ</h2>

        {orders.length === 0 ? (
          <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 14, padding: 24, textAlign: 'center', color: C.textDim, fontSize: 14, marginBottom: 28 }}>
            المحفظة متوازنة ✓
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 28 }}>
            {orders.map(o => {
              const isSell = o.diffValue < 0
              const color = isSell ? C.sell : C.blue
              const bg = isSell ? C.sellDim : C.blueDim
              return (
                <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
                  <div style={{ width: 34, height: 34, borderRadius: 9, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {isSell ? <ArrowDownRight size={17} color={color} /> : <ArrowUpRight size={17} color={color} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontWeight: 700, fontFamily: FONT_MONO, direction: 'ltr' }}>{o.ticker || '—'}</span>
                      <span style={{ fontSize: 12, color, fontWeight: 700 }}>{isSell ? 'بيع' : 'شراء'}</span>
                    </div>
                    <div style={{ fontSize: 12, color: C.textDim, fontFamily: FONT_MONO, direction: 'ltr' }}>
                      {fmt(Math.abs(o.diffShares), fractional ? 4 : 0)} سهم
                    </div>
                  </div>
                  <div style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 16, color, direction: 'ltr' }}>
                    ${fmt(Math.abs(o.diffValue), 0)}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* ── Save / Snapshot ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          <button onClick={savePositions} disabled={saving} style={{ ...btnStyle, background: C.blue, border: `1px solid ${C.blue}`, color: '#0A0B10', justifyContent: 'center' }}>
            {saving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
            حفظ المراكز الحالية
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...inputStyle, flex: 1, fontFamily: FONT_AR, fontSize: 13 }}
              dir="rtl"
              placeholder="ملاحظة (اختياري) — مثال: تحديث يونيو 2026"
              value={snapshotNote}
              onChange={e => setSnapshotNote(e.target.value)}
            />
            <button onClick={saveSnapshot} disabled={savingSnapshot} style={{ ...btnStyle, flexShrink: 0, padding: '8px 14px' }}>
              {savingSnapshot ? <Loader2 size={14} className="animate-spin" /> : <History size={14} />}
              لقطة
            </button>
          </div>
        </div>

        {/* ── History ── */}
        {snapshots.length > 0 && (
          <div style={{ marginBottom: 40 }}>
            <button
              onClick={() => setShowHistory(h => !h)}
              style={{ ...btnStyle, width: '100%', justifyContent: 'center', marginBottom: 10 }}
            >
              <History size={14} />
              سجل التحديثات ({snapshots.length})
              <ChevronDown size={14} style={{ transform: showHistory ? 'rotate(180deg)' : 'none', transition: '.2s' }} />
            </button>

            {showHistory && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {snapshots.map(snap => (
                  <div key={snap.id} style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 13, color: C.textDim }}>
                        {new Date(snap.created_at).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </div>
                      <div style={{ fontFamily: FONT_MONO, fontWeight: 700, fontSize: 15, direction: 'ltr' }}>
                        ${fmt(snap.total_value, 0)}
                      </div>
                    </div>
                    {snap.note && (
                      <div style={{ fontSize: 12, color: C.textFaint, marginTop: 4 }}>{snap.note}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p style={{ fontSize: 12, color: C.textFaint, lineHeight: 1.8, textAlign: 'center' }}>
          بعد التنفيذ على البروكر، عدّل الأسهم والكاش واضغط "حفظ" — كده تبقى جاهز للتحديث الجاي.
        </p>
      </div>
    </div>
  )
}
