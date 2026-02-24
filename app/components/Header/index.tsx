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

  const handleLogout = () => {
    localStorage.removeItem('token');
    router.push('/login');
  };

  return (
    <>
      <style>{`
        .header-container {
          background-color: var(--header-bg);
          border-bottom: 1px solid var(--border);
          position: sticky;
          top: 0;
          z-index: 100;
          backdrop-filter: blur(10px);
        }

        /* Desktop Header */
        .header-desktop {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          gap: 16px;
        }

        /* Mobile Header */
        .header-mobile {
          display: none;
        }

        @media (max-width: 768px) {
          .header-desktop {
            display: none;
          }

          .header-mobile {
            display: flex;
            flex-direction: column;
            gap: 12px;
            padding: 12px;
          }

          .header-mobile-top {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
          }

          .header-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--text1);
            margin: 0;
            flex: 1;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }

          .header-buttons {
            display: flex;
            gap: 6px;
            align-items: center;
          }

          .header-icon-btn {
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

          .header-icon-btn:active {
            background: var(--surface2);
            transform: scale(0.95);
          }

          .header-household {
            display: flex;
            gap: 8px;
            overflow-x: auto;
            padding: 0 0 8px 0;
            -webkit-overflow-scrolling: touch;
          }

          .header-household-item {
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

          .header-household-item.active {
            background: var(--primary);
            color: white;
            border-color: var(--primary);
          }

          .header-dropdown {
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

          .header-dropdown-item {
            padding: 12px 16px;
            cursor: pointer;
            font-size: 14px;
            color: var(--text1);
            border-bottom: 1px solid var(--border);
            transition: background 0.2s;
          }

          .header-dropdown-item:last-child {
            border-bottom: none;
          }

          .header-dropdown-item:active {
            background: var(--surface2);
          }
        }

        .header-left {
          display: flex;
          align-items: center;
          gap: 16px;
          flex: 1;
          min-width: 0;
        }

        .header-title-desktop {
          margin: 0;
          font-size: 24px;
          font-weight: 600;
          color: var(--text1);
        }

        .header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .header-btn-primary {
          padding: 8px 16px;
          background-color: var(--primary);
          color: white;
          border: none;
          border-radius: var(--radius);
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
        }

        .header-btn-primary:hover {
          opacity: 0.8;
        }

        .header-btn-secondary {
          padding: 8px 16px;
          background-color: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text1);
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
        }

        .header-btn-secondary:hover {
          background-color: var(--surface2);
        }

        .header-btn-danger {
          padding: 8px 16px;
          background-color: var(--danger);
          color: white;
          border: none;
          border-radius: var(--radius);
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .header-btn-danger:hover {
          opacity: 0.8;
        }

        .header-select {
          padding: 8px 12px;
          background-color: var(--surface);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          color: var(--text1);
          font-size: 14px;
          cursor: pointer;
          max-width: 200px;
        }

        .header-theme-btn {
          padding: 8px 16px;
          background-color: ${isDark ? '#ffd700' : '#3498db'};
          color: white;
          border: none;
          border-radius: var(--radius);
          cursor: pointer;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s;
        }

        .header-theme-btn:hover {
          opacity: 0.8;
        }
      `}</style>

      <div className="header-container">
        {/* Mobile Header */}
        <div className="header-mobile">
          <div className="header-mobile-top">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
              {backHref && (
                <button className="header-icon-btn" onClick={goBack} title="Voltar">
                  ←
                </button>
              )}
              <h1 className="header-title">{title}</h1>
            </div>
            <div className="header-buttons">
              <button
                className="header-icon-btn"
                onClick={toggleTheme}
                title="Tema"
                style={{
                  color: isDark ? '#ffd700' : '#3498db',
                }}
              >
                {isDark ? '🌙' : '☀️'}
              </button>

              <button
                className="header-icon-btn"
                onClick={() => setShowThemeMenu(!showThemeMenu)}
                title="Menu"
              >
                ⋮
              </button>

              {action && (
                <Link
                  href={action.href}
                  className="header-icon-btn"
                  style={{
                    background: 'var(--primary)',
                    color: 'white',
                  }}
                >
                  +
                </Link>
              )}

              {showThemeMenu && (
                <div className="header-dropdown">
                  <div
                    className="header-dropdown-item"
                    onClick={() => {
                      router.push('/profile');
                      setShowThemeMenu(false);
                    }}
                  >
                    👤 Perfil
                  </div>
                  <div
                    className="header-dropdown-item"
                    onClick={() => {
                      router.push('/settings');
                      setShowThemeMenu(false);
                    }}
                  >
                    ⚙️ Configurações
                  </div>
                  <div
                    className="header-dropdown-item"
                    onClick={() => {
                      handleLogout();
                      setShowThemeMenu(false);
                    }}
                  >
                    🚪 Sair
                  </div>
                </div>
              )}
            </div>
          </div>

          {showHousehold && household && (
            <div className="header-household">
              {Array.isArray(household) ? (
                household.map((h: any) => (
                  <div
                    key={h.id}
                    className="header-household-item active"
                    onClick={() => onHouseholdChange?.(h.id)}
                  >
                    {h.name || 'Sem nome'}
                  </div>
                ))
              ) : (
                <div className="header-household-item active">
                  {household?.name || 'Seu Orçamento'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Desktop Header */}
        <div className="header-desktop">
          <div className="header-left">
            {backHref && (
              <button
                onClick={goBack}
                title="Voltar"
                className="header-btn-secondary"
                style={{
                  width: '40px',
                  height: '40px',
                  padding: 0,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ←
              </button>
            )}
            <h1 className="header-title-desktop">{title}</h1>

            {showHousehold && household && (
              <select
                className="header-select"
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

          <div className="header-right">
            {action && (
              <Link href={action.href} className="header-btn-primary">
                {action.label}
              </Link>
            )}

            <button className="header-theme-btn" onClick={toggleTheme} title="Alternar tema">
              {isDark ? '🌙 Escuro' : '☀️ Claro'}
            </button>

            <Link href="/profile" className="header-btn-secondary">
              👤 Perfil
            </Link>

            <button className="header-btn-danger" onClick={handleLogout}>
              🚪 Sair
            </button>
          </div>
        </div>
      </div>
    </>
  );
}