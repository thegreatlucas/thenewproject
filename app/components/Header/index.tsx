'use client';
// app/components/Header/index.tsx — Com dark mode toggle + seletor de grupo

import Link from 'next/link';
import { useState } from 'react';
import ThemeToggle from '@/app/components/ThemeToggle';
import { useFinanceGroup } from '@/lib/financeGroupContext';

interface HeaderProps {
  title: string;
  backHref?: string;
  action?: { label: string; href: string };
}

const GROUP_ICONS: Record<string, string> = {
  personal: '👤',
  couple:   '💑',
  family:   '👨‍👩‍👧‍👦',
};

export default function Header({ title, backHref, action }: HeaderProps) {
  const { groups, activeGroup, activeGroupId, setActiveGroupId } = useFinanceGroup();
  const [open, setOpen] = useState(false);

  const hasMultiple = groups.length > 1;

  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 50,
      backgroundColor: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      padding: '0 16px',
      display: 'flex', alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 52,
      gap: 8,
    }}>
      {/* Esquerda: back + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {backHref && (
          <Link href={backHref} style={{ textDecoration: 'none', color: 'var(--text3)', fontSize: 20, lineHeight: 1, flexShrink: 0 }}>
            ←
          </Link>
        )}
        <span style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {title}
        </span>
      </div>

      {/* Direita: seletor de grupo + action + theme toggle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, position: 'relative' }}>

        {/* Seletor de grupo — só aparece se tiver mais de 1 */}
        {hasMultiple && activeGroup && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setOpen((o) => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 10px',
                backgroundColor: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 20, cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                color: 'var(--text2)',
                maxWidth: 140, overflow: 'hidden',
              }}
            >
              <span>{GROUP_ICONS[activeGroup.groupType] || '🏠'}</span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {activeGroup.name}
              </span>
              <span style={{ opacity: 0.6, fontSize: 10 }}>{open ? '▲' : '▼'}</span>
            </button>

            {/* Dropdown */}
            {open && (
              <>
                {/* Overlay para fechar ao clicar fora */}
                <div
                  onClick={() => setOpen(false)}
                  style={{ position: 'fixed', inset: 0, zIndex: 98 }}
                />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 6px)', right: 0,
                  backgroundColor: 'var(--surface)',
                  border: '1px solid var(--border)',
                  borderRadius: 12, overflow: 'hidden',
                  boxShadow: 'var(--shadow)',
                  zIndex: 99, minWidth: 180,
                }}>
                  {groups.map((g) => {
                    const isActive = g.id === activeGroupId;
                    return (
                      <button
                        key={g.id}
                        onClick={() => { setActiveGroupId(g.id); setOpen(false); window.location.reload(); }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          width: '100%', padding: '11px 14px',
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                          backgroundColor: isActive ? 'var(--bg3)' : 'transparent',
                          borderBottom: '1px solid var(--border2)',
                          color: 'var(--text)',
                        }}
                      >
                        <span style={{ fontSize: 18 }}>{GROUP_ICONS[g.groupType] || '🏠'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: isActive ? 700 : 400, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {g.name}
                          </div>
                          {g.shipName && (
                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 1 }}>{g.shipName}</div>
                          )}
                        </div>
                        {isActive && <span style={{ color: '#2ecc71', fontSize: 16, flexShrink: 0 }}>✓</span>}
                      </button>
                    );
                  })}
                  <Link href="/setup" style={{ textDecoration: 'none' }} onClick={() => setOpen(false)}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '10px 14px', fontSize: 12,
                      color: 'var(--text-muted)', cursor: 'pointer',
                    }}>
                      ⚙️ Gerenciar grupos
                    </div>
                  </Link>
                </div>
              </>
            )}
          </div>
        )}

        {action && (
          <Link href={action.href} style={{ textDecoration: 'none' }}>
            <button style={{
              padding: '6px 12px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 8, cursor: 'pointer',
              fontSize: 18, color: 'var(--text3)',
            }}>
              {action.label}
            </button>
          </Link>
        )}

        <ThemeToggle />
      </div>
    </header>
  );
}