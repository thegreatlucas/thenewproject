'use client';
// app/components/ThemeToggle/index.tsx — Dark/Light + Brutalista toggle

import { useTheme } from '@/lib/themeContext';

export default function ThemeToggle({ style }: { style?: React.CSSProperties }) {
  const { isDark, isBrutalist, toggleColor, toggleStyle } = useTheme();

  return (
    <div style={{ display: 'flex', gap: 4, ...style }}>
      {/* Toggle dark/light */}
      <button
        onClick={toggleColor}
        title={isDark ? 'Modo claro' : 'Modo escuro'}
        style={{
          background: 'none', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '5px 8px',
          cursor: 'pointer', fontSize: 15, lineHeight: 1, color: 'var(--text2)',
        }}
      >
        {isDark ? '☀️' : '🌙'}
      </button>

      {/* Toggle estilo GenZ / Brutalista */}
      <button
        onClick={toggleStyle}
        title={isBrutalist ? 'Mudar para GenZ' : 'Mudar para Brutalista'}
        style={{
          background: isBrutalist ? 'var(--text)' : 'none',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)', padding: '5px 8px',
          cursor: 'pointer', fontSize: 12, lineHeight: 1,
          color: isBrutalist ? 'var(--bg)' : 'var(--text2)',
          fontWeight: isBrutalist ? 700 : 400,
          fontFamily: isBrutalist ? 'var(--font-mono)' : 'inherit',
          letterSpacing: isBrutalist ? 0.5 : 0,
        }}
      >
        {isBrutalist ? 'BRUT' : 'GenZ'}
      </button>
    </div>
  );
}