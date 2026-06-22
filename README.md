# Portfolio Rebalancer

حاسبة إعادة توازن المحفظة — Next.js + Supabase + Vercel

---

## الخطوات (من الصفر للـ deploy)

### 1. Supabase

1. اعمل حساب على https://supabase.com
2. New Project — سمّيه `portfolio-tracker`
3. روح **SQL Editor** والصق محتوى `supabase/schema.sql` وشغّله
4. روح **Authentication → Providers → Google** وفعّله
   - هتحتاج Google OAuth credentials من https://console.cloud.google.com
   - Authorized redirect URI: `https://xxxx.supabase.co/auth/v1/callback`
5. من **Project Settings → API**، انسخ:
   - `Project URL`
   - `anon public` key

### 2. GitHub

```bash
git init
git add .
git commit -m "init portfolio tracker"
git remote add origin https://github.com/YOUR_USERNAME/portfolio-tracker.git
git push -u origin main
```

### 3. Vercel

1. https://vercel.com → New Project → Import من GitHub
2. في **Environment Variables** أضف:
   ```
   NEXT_PUBLIC_SUPABASE_URL     = https://xxxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY = eyJ...
   ```
3. اضغط Deploy

### 4. Google OAuth Redirect

بعد ما Vercel يديك الـ domain (مثلاً `portfolio-tracker.vercel.app`):
- روح Supabase → Authentication → URL Configuration
- أضف في Redirect URLs:
  `https://portfolio-tracker.vercel.app/auth/callback`

---

## تشغيل محلي

```bash
cp .env.local.example .env.local
# أملا الـ env variables

npm install
npm run dev
# افتح http://localhost:3000
```

---

## المميزات

- ✅ Google Login آمن
- ✅ Fractional shares support
- ✅ أوامر التنفيذ (بيع أولاً ثم شراء)
- ✅ أسعار حية من Yahoo Finance (كل 5 دقائق cache)
- ✅ سجل التحديثات (snapshots) مع ملاحظات
- ✅ حفظ تلقائي على Supabase
- ✅ يعمل من أي جهاز / موبايل
