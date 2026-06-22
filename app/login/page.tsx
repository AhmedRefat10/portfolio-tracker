'use client'

import { createClient } from '@/lib/supabase'
import { useState } from 'react'

const C = {
  bg: '#0A0B10', surface: '#131520', border: '#262A3A',
  text: '#F3F4F7', textDim: '#8B8FA3', blue: '#4C8DFF',
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const signInWithGoogle = async () => {
    setLoading(true)
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${location.origin}/auth/callback` },
    })
  }

  return (
    <div style={{
      minHeight: '100vh', background: C.bg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: "'Tajawal', sans-serif",
    }}>
      <div style={{
        background: C.surface, border: `1px solid ${C.border}`,
        borderRadius: 20, padding: '40px 36px', width: '100%', maxWidth: 380,
        textAlign: 'center',
      }}>
        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, letterSpacing: 2, color: '#5B5F70', marginBottom: 16 }}>
          PORTFOLIO REBALANCER
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 900, margin: '0 0 8px', color: C.text }}>
          حاسبة إعادة التوازن
        </h1>
        <p style={{ fontSize: 14, color: C.textDim, marginBottom: 32, lineHeight: 1.8 }}>
          سجّل دخولك عشان تقدر توصل لمحفظتك من أي جهاز
        </p>
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          style={{
            width: '100%', padding: '13px 20px', borderRadius: 12,
            background: C.blue, border: 'none', color: '#0A0B10',
            fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 16,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.7 : 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#0A0B10" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#0A0B10" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#0A0B10" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#0A0B10" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          {loading ? 'جاري تسجيل الدخول...' : 'تسجيل الدخول بـ Google'}
        </button>
      </div>
    </div>
  )
}
