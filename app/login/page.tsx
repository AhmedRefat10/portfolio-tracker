'use client'

import { createClient } from '@/lib/supabase'
import { useState } from 'react'

const C = {
  bg: '#0A0B10', surface: '#131520', border: '#262A3A',
  text: '#F3F4F7', textDim: '#8B8FA3', textFaint: '#5B5F70',
  blue: '#4C8DFF', teal: '#34D399', sell: '#FF6B5B',
}

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const supabase = createClient()

  const handleLogin = async () => {
    if (!email.trim()) return
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${location.origin}/auth/callback`,
      },
    })
    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Tajawal', sans-serif", padding: 16,
    }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 20, padding: '40px 32px', width: '100%', maxWidth: 380,
        textAlign: 'center',
      }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 2, color: C.textFaint, marginBottom: 14 }}>
          PORTFOLIO REBALANCER
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 8px', color: C.text }}>
          حاسبة إعادة التوازن
        </h1>

        {!sent ? (
          <>
            <p style={{ fontSize: 14, color: C.textDim, marginBottom: 28, lineHeight: 1.8 }}>
              دخّل إيميلك وهنبعتلك رابط دخول فوري
            </p>

            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleLogin()}
              placeholder="your@email.com"
              dir="ltr"
              style={{
                width: '100%', padding: '12px 14px', borderRadius: 10, marginBottom: 12,
                background: '#1A1D2B', border: `1px solid ${C.border}`,
                color: C.text, fontFamily: "'IBM Plex Mono', monospace", fontSize: 14,
                outline: 'none', textAlign: 'left',
              }}
            />

            {error && (
              <div style={{ fontSize: 13, color: C.sell, marginBottom: 12 }}>{error}</div>
            )}

            <button
              onClick={handleLogin}
              disabled={loading || !email.trim()}
              style={{
                width: '100%', padding: '13px 20px', borderRadius: 12,
                background: C.blue, border: 'none', color: '#0A0B10',
                fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 16,
                cursor: loading || !email.trim() ? 'not-allowed' : 'pointer',
                opacity: loading || !email.trim() ? 0.6 : 1,
              }}
            >
              {loading ? 'جاري الإرسال...' : 'إرسال رابط الدخول'}
            </button>
          </>
        ) : (
          <div style={{ padding: '16px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>📬</div>
            <p style={{ fontSize: 15, color: C.teal, fontWeight: 700, marginBottom: 8 }}>
              تم الإرسال!
            </p>
            <p style={{ fontSize: 14, color: C.textDim, lineHeight: 1.8 }}>
              افتح إيميلك على <span style={{ color: C.text, fontFamily: 'monospace' }}>{email}</span> واضغط على الرابط اللي بعتناهولك
            </p>
            <button
              onClick={() => { setSent(false); setEmail('') }}
              style={{
                marginTop: 20, background: 'none', border: 'none',
                color: C.textDim, fontSize: 13, cursor: 'pointer',
                fontFamily: "'Tajawal', sans-serif",
              }}
            >
              رجوع
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
