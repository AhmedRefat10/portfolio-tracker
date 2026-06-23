'use client'

import { createClient } from '@/lib/supabase'
import { useState } from 'react'

const C = {
  bg: '#0A0B10', surface: '#131520', border: '#262A3A',
  text: '#F3F4F7', textDim: '#8B8FA3', textFaint: '#5B5F70',
  blue: '#4C8DFF', teal: '#34D399', sell: '#FF6B5B',
  surfaceAlt: '#1A1D2B',
}

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10, marginBottom: 12,
  background: C.surfaceAlt, border: `1px solid ${C.border}`,
  color: C.text, fontFamily: "'Tajawal', sans-serif", fontSize: 14,
  outline: 'none',
}

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const supabase = createClient()

  const handleSubmit = async () => {
    setError('')
    if (!email.trim() || !password.trim()) { setError('إيميل وكلمة السر مطلوبين'); return }
    if (mode === 'signup' && !name.trim()) { setError('الاسم مطلوب'); return }
    if (password.length < 6) { setError('كلمة السر لازم تكون 6 حروف على الأقل'); return }

    setLoading(true)

    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: name.trim() },
          emailRedirectTo: `${location.origin}/auth/callback`,
        },
      })
      if (error) { setError(error.message); setLoading(false) }
      else { setDone(true); setLoading(false) }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })
      if (error) {
        setError(error.message === 'Invalid login credentials'
          ? 'إيميل أو كلمة سر غلط'
          : error.message)
        setLoading(false)
      } else {
        window.location.href = '/dashboard'
      }
    }
  }

  if (done) return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Tajawal', sans-serif", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: '40px 32px', width: '100%', maxWidth: 380, textAlign: 'center' }}>
        <div style={{ fontSize: 44, marginBottom: 16 }}>📬</div>
        <h2 style={{ fontSize: 20, fontWeight: 900, marginBottom: 10, color: C.teal }}>تم التسجيل!</h2>
        <p style={{ fontSize: 14, color: C.textDim, lineHeight: 1.9 }}>
          بعتنالك رابط تأكيد على <span style={{ color: C.text }}>{email}</span>
          <br />افتح الإيميل واضغط على الرابط، وبعدين ارجع هنا وسجّل دخولك.
        </p>
        <button onClick={() => { setDone(false); setMode('login') }}
          style={{ marginTop: 24, background: C.blue, border: 'none', color: '#0A0B10', fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 15, padding: '12px 28px', borderRadius: 10, cursor: 'pointer' }}>
          تسجيل الدخول
        </button>
      </div>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Tajawal', sans-serif", padding: 16 }}>
      <div style={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 20, padding: '40px 32px', width: '100%', maxWidth: 380 }}>

        <div style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, letterSpacing: 2, color: C.textFaint, marginBottom: 14, textAlign: 'center' }}>
          PORTFOLIO REBALANCER
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: '0 0 6px', color: C.text, textAlign: 'center' }}>
          {mode === 'login' ? 'تسجيل الدخول' : 'حساب جديد'}
        </h1>
        <p style={{ fontSize: 13, color: C.textDim, marginBottom: 28, textAlign: 'center' }}>
          {mode === 'login' ? 'أهلاً — دخّل بياناتك' : 'سجّل بياناتك عشان تبدأ'}
        </p>

        {mode === 'signup' && (
          <input
            style={inputStyle}
            dir="rtl"
            type="text"
            placeholder="الاسم"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        )}

        <input
          style={inputStyle}
          dir="ltr"
          type="email"
          placeholder="الإيميل"
          value={email}
          onChange={e => setEmail(e.target.value)}
        />

        <input
          style={{ ...inputStyle, marginBottom: 0 }}
          dir="ltr"
          type="password"
          placeholder="كلمة السر"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
        />

        {error && (
          <div style={{ fontSize: 13, color: C.sell, margin: '10px 0 0', textAlign: 'center' }}>
            {error}
          </div>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            width: '100%', padding: '13px', borderRadius: 12, marginTop: 16,
            background: C.blue, border: 'none', color: '#0A0B10',
            fontFamily: "'Tajawal', sans-serif", fontWeight: 700, fontSize: 16,
            cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '...' : mode === 'login' ? 'دخول' : 'إنشاء الحساب'}
        </button>

        <div style={{ marginTop: 20, textAlign: 'center', fontSize: 13, color: C.textDim }}>
          {mode === 'login' ? (
            <>مش عندك حساب؟{' '}
              <button onClick={() => { setMode('signup'); setError('') }}
                style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontFamily: "'Tajawal', sans-serif", fontSize: 13, fontWeight: 700 }}>
                سجّل دلوقتي
              </button>
            </>
          ) : (
            <>عندك حساب بالفعل؟{' '}
              <button onClick={() => { setMode('login'); setError('') }}
                style={{ background: 'none', border: 'none', color: C.blue, cursor: 'pointer', fontFamily: "'Tajawal', sans-serif", fontSize: 13, fontWeight: 700 }}>
                سجّل دخول
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
