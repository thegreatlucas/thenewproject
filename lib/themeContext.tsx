'use client';
// lib/themeContext.tsx — Dark/Light + Brutalista

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

type ColorTheme = 'light' | 'dark';
type StyleTheme = 'genz' | 'brutalist';

interface ThemeCtx {
  colorTheme: ColorTheme;
  styleTheme: StyleTheme;
  isDark: boolean;
  isBrutalist: boolean;
  toggleColor: () => void;
  toggleStyle: () => void;
}

const Ctx = createContext<ThemeCtx>({
  colorTheme: 'light', styleTheme: 'genz',
  isDark: false, isBrutalist: false,
  toggleColor: () => {}, toggleStyle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [colorTheme, setColorTheme] = useState<ColorTheme>('light');
  const [styleTheme, setStyleTheme] = useState<StyleTheme>('genz');

  useEffect(() => {
    const savedColor = localStorage.getItem('rc-theme') as ColorTheme | null;
    const savedStyle = localStorage.getItem('rc-style') as StyleTheme | null;
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

    const initColor: ColorTheme = savedColor ?? (prefersDark ? 'dark' : 'light');
    const initStyle: StyleTheme = savedStyle ?? 'genz';

    setColorTheme(initColor);
    setStyleTheme(initStyle);
    applyTheme(initColor, initStyle);
  }, []);

  function applyTheme(color: ColorTheme, style: StyleTheme) {
    const root = document.documentElement;
    root.setAttribute('data-theme', color);
    if (style === 'brutalist') root.classList.add('brutalist');
    else root.classList.remove('brutalist');
  }

  function toggleColor() {
    setColorTheme((prev) => {
      const next: ColorTheme = prev === 'light' ? 'dark' : 'light';
      localStorage.setItem('rc-theme', next);
      applyTheme(next, styleTheme);
      return next;
    });
  }

  function toggleStyle() {
    setStyleTheme((prev) => {
      const next: StyleTheme = prev === 'genz' ? 'brutalist' : 'genz';
      localStorage.setItem('rc-style', next);
      applyTheme(colorTheme, next);
      return next;
    });
  }

  return (
    <Ctx.Provider value={{
      colorTheme, styleTheme,
      isDark: colorTheme === 'dark',
      isBrutalist: styleTheme === 'brutalist',
      toggleColor, toggleStyle,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export const useTheme = () => useContext(Ctx);