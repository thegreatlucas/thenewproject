'use client'

import { useTheme } from '@/lib/themeContext'
import { Sun, Moon, Sparkles, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function ThemeToggle({ className }: { className?: string; style?: React.CSSProperties }) {
  const { isDark, isBrutal, toggleColorMode, toggleDesignTheme } = useTheme()

  return (
    <div className={cn('flex items-center gap-1', className)}>
      {/* Color mode toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleColorMode}
        title={isDark ? 'Modo claro' : 'Modo escuro'}
        className="h-8 w-8"
      >
        {isDark ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
        <span className="sr-only">{isDark ? 'Modo claro' : 'Modo escuro'}</span>
      </Button>

      {/* Design theme toggle */}
      <Button
        variant="ghost"
        size="icon"
        onClick={toggleDesignTheme}
        title={isBrutal ? 'Tema GenZ' : 'Tema Brutalista'}
        className="h-8 w-8"
      >
        {isBrutal ? (
          <Sparkles className="h-4 w-4" />
        ) : (
          <Zap className="h-4 w-4" />
        )}
        <span className="sr-only">{isBrutal ? 'Mudar para GenZ' : 'Mudar para Brutalista'}</span>
      </Button>
    </div>
  )
}
