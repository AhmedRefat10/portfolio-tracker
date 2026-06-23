import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import RebalanceCalculator from '@/components/RebalanceCalculator'

export default async function DashboardPage() {
  const cookieStore = cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Load saved positions
  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', user.id)
    .order('sort_order')

  // Load last 10 snapshots
  const { data: snapshots } = await supabase
    .from('snapshots')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(10)

  // Load closed trades
  const { data: closedTrades } = await supabase
    .from('closed_trades')
    .select('*')
    .eq('user_id', user.id)
    .order('closed_at', { ascending: false })

  return (
    <RebalanceCalculator
      userId={user.id}
      userEmail={user.email ?? ''}
      initialPositions={positions ?? []}
      initialSnapshots={snapshots ?? []}
      initialClosedTrades={closedTrades ?? []}
    />
  )
}
