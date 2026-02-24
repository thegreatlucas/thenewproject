'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ChevronLeft, ChevronDown, Check, Settings, Users, User, Home } from 'lucide-react'
import ThemeToggle from '@/app/components/ThemeToggle'
import { useFinanceGroup } from '@/lib/financeGroupContext'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface HeaderProps {
  title: string
  backHref?: string
  action?: { label: string; href: string }
}

const GROUP_ICONS: Record<string, React.ReactNode> = {
  personal: <User className="h-3.5 w-3.5" />,
  couple: <Users className="h-3.5 w-3.5" />,
  family: <Home className="h-3.5 w-3.5" />,
}

export default function Header({ title, backHref, action }: HeaderProps) {
  const { groups, activeGroup, activeGroupId, setActiveGroupId } = useFinanceGroup()
  const [open, setOpen] = useState(false)

  const hasMultiple = groups.length > 1

  return (
    <header className="sticky top-0 z-50 flex items-center justify-between gap-2 border-b border-border bg-card px-4 glass" style={{ minHeight: 52 }}>
      {/* Left: back + title */}
      <div className="flex items-center gap-2.5 min-w-0">
        {backHref && (
          <Link href={backHref}>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0">
              <ChevronLeft className="h-5 w-5" />
              <span className="sr-only">Voltar</span>
            </Button>
          </Link>
        )}
        <h1 className="text-base font-bold truncate text-foreground">
          {title}
        </h1>
      </div>

      {/* Right: group selector + action + theme toggle */}
      <div className="flex items-center gap-1.5 shrink-0 relative">
        {/* Group selector */}
        {hasMultiple && activeGroup && (
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOpen((o) => !o)}
              className="h-8 gap-1.5 max-w-[140px] text-xs"
            >
              {GROUP_ICONS[activeGroup.groupType] || <Home className="h-3.5 w-3.5" />}
              <span className="truncate">{activeGroup.name}</span>
              <ChevronDown className={cn('h-3 w-3 opacity-60 transition-transform', open && 'rotate-180')} />
            </Button>

            {/* Dropdown */}
            {open && (
              <>
                <div
                  className="fixed inset-0 z-[98]"
                  onClick={() => setOpen(false)}
                />
                <div className="absolute top-full right-0 mt-1.5 z-[99] min-w-[200px] overflow-hidden border border-border bg-popover text-popover-foreground theme-card animate-slide-up">
                  {groups.map((g) => {
                    const isActive = g.id === activeGroupId
                    return (
                      <button
                        key={g.id}
                        onClick={() => {
                          setActiveGroupId(g.id)
                          setOpen(false)
                          window.location.reload()
                        }}
                        className={cn(
                          'flex items-center gap-2.5 w-full px-3 py-2.5 text-left transition-colors border-b border-border last:border-b-0',
                          isActive ? 'bg-muted' : 'hover:bg-muted/50'
                        )}
                      >
                        <span className="flex items-center justify-center w-7 h-7 rounded-md bg-secondary text-secondary-foreground">
                          {GROUP_ICONS[g.groupType] || <Home className="h-3.5 w-3.5" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className={cn('text-sm truncate', isActive && 'font-semibold')}>
                            {g.name}
                          </div>
                          {g.shipName && (
                            <div className="text-[11px] text-muted-foreground mt-0.5">{g.shipName}</div>
                          )}
                        </div>
                        {isActive && <Check className="h-4 w-4 text-accent shrink-0" />}
                      </button>
                    )
                  })}
                  <Link
                    href="/setup"
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    Gerenciar grupos
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {action && (
          <Link href={action.href}>
            <Button variant="outline" size="sm" className="h-8 text-lg px-2.5">
              {action.label}
            </Button>
          </Link>
        )}

        <ThemeToggle />
      </div>
    </header>
  )
}
