'use client'

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react'

type ColorMode = 'light' | 'dark'
type DesignTheme = 'genz' | 'brutal'

interface ThemeCtx {
  colorMode: ColorMode
  designTheme: DesignTheme
  isDark: boolean
  isBrutal: boolean
  toggleColorMode: () => void
  toggleDesignTheme: () => void
  setColorMode: (mode: ColorMode) => void
  setDesignTheme: (theme: DesignTheme) => void
  /** @deprecated Use colorMode / isDark instead */
  theme: ColorMode
  /** @deprecated Use toggleColorMode instead */
  toggle: () => void
}

const Ctx = createContext<ThemeCtx>({
  colorMode: 'light',
  designTheme: 'genz',
  isDark: false,
  isBrutal: false,
  toggleColorMode: () => {},
  toggleDesignTheme: () => {},
  setColorMode: () => {},
  setDesignTheme: () => {},
  theme: 'light',
  toggle: () => {},
})

function applyThemeClasses(colorMode: ColorMode, designTheme: DesignTheme) {
  const html = document.documentElement

  // Color mode
  html.classList.toggle('dark', colorMode === 'dark')
  html.setAttribute('data-theme', colorMode)

  // Design theme
  html.classList.toggle('brutal', designTheme === 'brutal')
  html.setAttribute('data-design', designTheme)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorMode, setColorModeState] = useState<ColorMode>('light')
  const [designTheme, setDesignThemeState] = useState<DesignTheme>('genz')

  useEffect(() => {
    const savedColor = localStorage.getItem('rc-theme') as ColorMode | null
    const savedDesign = localStorage.getItem('rc-design') as DesignTheme | null
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches

    const initialColor: ColorMode = savedColor ?? (prefersDark ? 'dark' : 'light')
    const initialDesign: DesignTheme = savedDesign ?? 'genz'

    setColorModeState(initialColor)
    setDesignThemeState(initialDesign)
    applyThemeClasses(initialColor, initialDesign)
  }, [])

  const setColorMode = useCallback((mode: ColorMode) => {
    setColorModeState(mode)
    localStorage.setItem('rc-theme', mode)
    setDesignThemeState((dt) => {
      applyThemeClasses(mode, dt)
      return dt
    })
  }, [])

  const setDesignTheme = useCallback((theme: DesignTheme) => {
    setDesignThemeState(theme)
    localStorage.setItem('rc-design', theme)
    setColorModeState((cm) => {
      applyThemeClasses(cm, theme)
      return cm
    })
  }, [])

  const toggleColorMode = useCallback(() => {
    setColorModeState((prev) => {
      const next: ColorMode = prev === 'light' ? 'dark' : 'light'
      localStorage.setItem('rc-theme', next)
      setDesignThemeState((dt) => {
        applyThemeClasses(next, dt)
        return dt
      })
      return next
    })
  }, [])

  const toggleDesignTheme = useCallback(() => {
    setDesignThemeState((prev) => {
      const next: DesignTheme = prev === 'genz' ? 'brutal' : 'genz'
      localStorage.setItem('rc-design', next)
      setColorModeState((cm) => {
        applyThemeClasses(cm, next)
        return cm
      })
      return next
    })
  }, [])

  return (
    <Ctx.Provider
      value={{
        colorMode,
        designTheme,
        isDark: colorMode === 'dark',
        isBrutal: designTheme === 'brutal',
        toggleColorMode,
        toggleDesignTheme,
        setColorMode,
        setDesignTheme,
        // Backward compat
        theme: colorMode,
        toggle: toggleColorMode,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export const useTheme = () => useContext(Ctx)
