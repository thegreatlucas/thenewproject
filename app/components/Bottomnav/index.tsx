'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Home, CreditCard, Plus, PiggyBank, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

const HIDDEN_PATHS = ['/', '/login', '/setup', '/onboarding']

export default function BottomNav() {
  const pathname = usePathname()
  const [pendingRecurrences, setPendingRecurrences] = useState(0)
  const [hasBalance, setHasBalance] = useState(false)

  useEffect(() => {
    loadBadges()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  async function loadBadges() {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return

    const { data: member } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .single()

    if (!member) return
    const hid = member.household_id
    const today = new Date().toISOString().split('T')[0]

    const { data: rules } = await supabase
      .from('recurrence_rules')
      .select('id')
      .eq('household_id', hid)
      .eq('active', true)
      .lte('next_date', today)

    setPendingRecurrences((rules || []).length)

    const { data: balRows } = await supabase
      .from('balances')
      .select('amount')
      .eq('household_id', hid)

    const total = (balRows || []).reduce((s, r) => s + Number(r.amount), 0)
    setHasBalance(total > 0.01)
  }

  if (HIDDEN_PATHS.includes(pathname)) return null

  const NAV_ITEMS = [
    {
      href: '/dashboard',
      label: 'Inicio',
      badge: 0,
      icon: Home,
    },
    {
      href: '/transactions',
      label: 'Gastos',
      badge: 0,
      icon: CreditCard,
    },
    {
      href: '/transactions/new',
      label: 'Lancar',
      badge: pendingRecurrences,
      icon: null, // Central button
    },
    {
      href: '/budgets',
      label: 'Orcamento',
      badge: 0,
      icon: PiggyBank,
    },
    {
      href: '/balances',
      label: 'Acerto',
      badge: hasBalance ? 1 : 0,
      icon: Users,
    },
  ]

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-[100] flex items-center justify-around border-t border-border bg-card glass pb-[env(safe-area-inset-bottom)]" style={{ height: 64 }}>
      {NAV_ITEMS.map(({ href, icon: Icon, label, badge }) => {
        // Central action button
        if (!Icon) {
          return (
            <Link key={href} href={href} className="relative -mt-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 active:scale-95">
                <Plus className="h-6 w-6" strokeWidth={2.5} />
                {badge > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground ring-2 ring-card">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </div>
            </Link>
          )
        }

        const isActive =
          pathname === href ||
          (href !== '/dashboard' && pathname.startsWith(href))

        return (
          <Link key={href} href={href} className="flex flex-col items-center gap-0.5 pt-1 min-w-[52px]">
            <div className="relative">
              <Icon
                className={cn(
                  'h-[22px] w-[22px] transition-colors',
                  isActive ? 'text-primary' : 'text-muted-foreground'
                )}
                strokeWidth={isActive ? 2.2 : 1.8}
              />
              {badge > 0 && (
                <span className="absolute -top-1 -right-1 h-2 w-2 rounded-full bg-destructive ring-[1.5px] ring-card" />
              )}
            </div>
            <span
              className={cn(
                'text-[10px] tracking-wide transition-colors',
                isActive ? 'text-primary font-semibold' : 'text-muted-foreground font-normal'
              )}
            >
              {label}
            </span>
            <div
              className={cn(
                'h-1 w-1 rounded-full mt-0.5 transition-colors',
                isActive ? 'bg-primary' : 'bg-transparent'
              )}
            />
          </Link>
        )
      })}
    </nav>
  )
}
