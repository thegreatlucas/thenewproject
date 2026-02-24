'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  title?: string;
  backHref?: string;
  action?: { label: string; href: string };
  showHousehold?: boolean;
  household?: any;
  onHouseholdChange?: (householdId: string) => void;
}

export default function Header({
  title = 'Finanças',
  backHref,
  action,
  showHousehold = true,
  household,
  onHouseholdChange,
}: HeaderProps) {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);
  const isDark = typeof window !== 'undefined' && document.documentElement.getAttribute('data-theme') === 'dark';

  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const goBack = () => {
    if (backHref) {
      router.push(backHref);
    } else {
      router.back();
    }
  };

  return (
    <header
      style={{
        backgroundColor: 'var(--header-bg)',
        borderBottom: '1px solid var(--border)',
        padding: 0,
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backdropFilter: 'blur(10px)',
      }}
    >
      {/* Mobile Header (até 768px) */}
      <div
        className="mobile-header"
        style={{
          display: 'none',
        }}
        <style>{`
          @media (max-width: 768px) {
            .mobile-header {
              display: flex !important;
              flex-direction: column;
              gap: 12px;
              padding: 12px;
            }

            .mobile-header-top {
              display: flex;
              align-items: center;
              justify-content: space-between;
              gap: 8px;
            }

            .mobile-header-title {
              font-size: 18px;
              font-weight: 600;
              color: var(--text1);
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              flex: 1;
            }

            .mobile-header-buttons {
              display: flex;
              gap: 6px;
              align-items: center;
            }

            .mobile-icon-btn {
              width: 40px;
              height: 40px;
              border: none;
              background: var(--surface);
              border-radius: 8px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 18px;
              transition: all 0.2s;
            }

            .mobile-icon-btn:active {
              background: var(--surface2);
              transform: scale(0.95);
            }

            .mobile-household {
              display: flex;
              gap: 8px;
              overflow-x: auto;
              scroll-behavior: smooth;
              padding: 0 0 8px 0;
              -webkit-overflow-scrolling: touch;
            }

            .mobile-household-item {
              flex-shrink: 0;
              padding: 8px 12px;
              background: var(--surface);
              border-radius: 6px;
              font-size: 12px;
              white-space: nowrap;
              border: 1px solid var(--border);
              cursor: pointer;
              transition: all 0.2s;
            }

            .mobile-household-item.active {
              background: var(--primary);
              color: white;
              border-color: var(--primary);
            }

            .mobile-dropdown {
              position: absolute;
              top: 52px;
              right: 8px;
              background: var(--surface);
              border: 1px solid var(--border);
              border-radius: 8px;
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
              z-index: 1000;
              min-width: 150px;
            }

            .mobile-dropdown-item {
              padding: 12px 16px;
              cursor: pointer;
              font-size: 14px;
              color: var(--text1);
              border-bottom: 1px solid var(--border);
              transition: background 0.2s;
            }

            .mobile-dropdown-item:last-child {
              border-bottom: none;
            }

            .mobile-dropdown-item:active {
              background: var(--surface2);
            }
          }
        `}</style>

        {/* Top Row: Title + Action Buttons */}
        <div className="mobile-header-top">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
            {backHref && (
              <button
                className="mobile-icon-btn"
                onClick={goBack}
                title="Voltar"
                style={{ flex: '0 0 auto' }}
              >
                ←
              </button>
            )}
            <h1 className="mobile-header-title">{title}</h1>
          </div>
          <div className="mobile-header-buttons">
            {/* Theme Toggle */}
            <button
              className="mobile-icon-btn"
              onClick={toggleTheme}
              title="Tema"
              style={{
                color: isDark ? '#ffd700' : '#3498db',
              }}
            >
              {isDark ? '🌙' : '☀️'}
            </button>

            {/* Mais opções */}
            <button
              className="mobile-icon-btn"
              onClick={() => setShowThemeMenu(!showThemeMenu)}
              title="Menu"
            >
              ⋮
            </button>

            {action && (
              <Link
                href={action.href}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '40px',
                  height: '40px',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                  borderRadius: '8px',
                  textDecoration: 'none',
                  fontSize: '12px',
                  fontWeight: 'bold',
                }}
              >
                +
              </Link>
            )}

            {/* Dropdown Menu */}
            {showThemeMenu && (
              <div className="mobile-dropdown">
                <div
                  className="mobile-dropdown-item"
                  onClick={() => {
                    router.push('/profile');
                    setShowThemeMenu(false);
                  }}
                >
                  👤 Perfil
                </div>
                <div
                  className="mobile-dropdown-item"
                  onClick={() => {
                    router.push('/settings');
                    setShowThemeMenu(false);
                  }}
                >
                  ⚙️ Configurações
                </div>
                <div
                  className="mobile-dropdown-item"
                  onClick={() => {
                    localStorage.removeItem('token');
                    router.push('/login');
                    setShowThemeMenu(false);
                  }}
                >
                  🚪 Sair
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Household Selector (scrollable) */}
        {showHousehold && household && (
          <div className="mobile-household">
            {Array.isArray(household) ? (
              household.map((h: any) => (
                <div
                  key={h.id}
                  className="mobile-household-item active"
                  onClick={() => onHouseholdChange?.(h.id)}
                >
                  {h.name || 'Sem nome'}
                </div>
              ))
            ) : (
              <div className="mobile-household-item active">
                {household?.name || 'Seu Orçamento'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop Header (768px+) */}
      <div
        className="desktop-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 24px',
          gap: 16,
        }}
        <style>{`
          @media (max-width: 768px) {
            .desktop-header {
              display: none !important;
            }
          }
        `}</style>

        {/* Left: Title + Household */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flex: 1, minWidth: 0 }}>
          {backHref && (
            <button
              onClick={goBack}
              title="Voltar"
              style={{
                width: '40px',
                height: '40px',
                padding: 0,
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '18px',
                transition: 'all 0.2s',
              }}
            >
              ←
            </button>
          )}
          <h1
            style={{
              margin: 0,
              fontSize: 24,
              fontWeight: 600,
              color: 'var(--text1)',
            }}
          >
            {title}
          </h1>

          {showHousehold && household && (
            <select
              style={{
                padding: '8px 12px',
                backgroundColor: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--text1)',
                fontSize: 14,
                cursor: 'pointer',
                maxWidth: 200,
              }}
              defaultValue={typeof household === 'object' && household.id ? household.id : ''}
              onChange={(e) => onHouseholdChange?.(e.target.value)}
            >
              {Array.isArray(household) ? (
                household.map((h: any) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))
              ) : (
                <option value={household?.id || ''}>{household?.name || 'Seu Orçamento'}</option>
              )}
            </select>
          )}
        </div>

        {/* Right: Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {action && (
            <Link
              href={action.href}
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--primary)',
                color: 'white',
                border: 'none',
                borderRadius: 'var(--radius)',
                textDecoration: 'none',
                cursor: 'pointer',
                fontSize: 14,
                fontWeight: 600,
                transition: 'all 0.2s',
              }}
            >
              {action.label}
            </Link>
          )}

          {/* Theme Toggle */}
          <button
            onClick={toggleTheme}
            title="Alternar tema"
            style={{
              padding: '8px 16px',
              backgroundColor: isDark ? '#ffd700' : '#3498db',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.opacity = '0.8')}
            onMouseLeave={(e) => (e.currentTarget.opacity = '1')}
          >
            {isDark ? '🌙 Escuro' : '☀️ Claro'}
          </button>

          {/* Settings Button */}
          <Link
            href="/profile"
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text1)',
              textDecoration: 'none',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface2)')}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface)')}
          >
            👤 Perfil
          </Link>

          {/* Logout Button */}
          <button
            onClick={() => {
              localStorage.removeItem('token');
              router.push('/login');
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--danger)',
              color: 'white',
              border: 'none',
              borderRadius: 'var(--radius)',
              cursor: 'pointer',
              fontSize: 14,
              fontWeight: 600,
              transition: 'all 0.2s',
            }}
            onMouseEnter={(e) => (e.currentTarget.opacity = '0.8')}
            onMouseLeave={(e) => (e.currentTarget.opacity = '1')}
          >
            🚪 Sair
          </button>
        </div>
      </div>
    </header>
  );
}