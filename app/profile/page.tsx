'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';
import { useFinanceGroup } from '@/lib/financeGroupContext';
import { useTheme } from '@/lib/themeContext';
import ThemeToggle from '@/app/components/ThemeToggle';

// ── UI helpers ───────────────────────────────────────────────────────────────

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid var(--border2)' }}>
      <span style={{ fontSize: 14, color: 'var(--text3)', fontWeight: 500 }}>{label}</span>
      <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>{children}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', margin: '24px 0 8px', fontFamily: 'var(--font-display)' }}>
      {children}
    </p>
  );
}

function Card({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="card" style={{ padding: '4px 20px', ...style }}>
      {children}
    </div>
  );
}

function ActionBtn({ onClick, children, color = 'var(--blue)', danger = false }: {
  onClick: () => void; children: React.ReactNode; color?: string; danger?: boolean;
}) {
  return (
    <button onClick={onClick} style={{
      width: '100%', padding: '14px', border: danger ? '1px solid var(--red)' : '1px solid var(--border)',
      borderRadius: 'var(--radius)', backgroundColor: danger ? 'rgba(255,92,124,0.06)' : 'var(--surface)',
      color: danger ? 'var(--red)' : color, fontWeight: 700, fontSize: 14,
      cursor: 'pointer', fontFamily: 'var(--font-display)', textAlign: 'left',
      display: 'flex', alignItems: 'center', gap: 10,
      transition: 'opacity 0.15s ease',
    }}>
      {children}
    </button>
  );
}

// ── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name, size = 72 }: { name: string; size?: number }) {
  const initials = name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
  const hue = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: `hsl(${hue}, 60%, 60%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.35, fontWeight: 800, color: 'white',
      fontFamily: 'var(--font-display)', flexShrink: 0,
      boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
    }}>
      {initials}
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [shipName, setShipName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [partnerName, setPartnerName] = useState('');
  const [memberCount, setMemberCount] = useState(0);
  const [householdId, setHouseholdId] = useState('');
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const router = useRouter();
  const { activeGroup, activeGroupId } = useFinanceGroup();
  const { isDark, isBrutalist, toggleColor, toggleStyle } = useTheme();

  useEffect(() => { init(); }, [activeGroupId]);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    setUserEmail(user.email || '');
    const name = user.user_metadata?.name || user.email?.split('@')[0] || '';
    setUserName(name);
    setNameInput(name);

    if (activeGroupId && activeGroup) {
      setHouseholdId(activeGroupId);
      setHouseholdName(activeGroup.name || '');
      setShipName(activeGroup.shipName || '');

      // Busca invite code
      const { data: hh } = await supabase.from('households').select('invite_code').eq('id', activeGroupId).single();
      if (hh) setInviteCode(hh.invite_code || '');

      // Busca membros
      const { data: members } = await supabase.from('household_members').select('user_id').eq('household_id', activeGroupId);
      setMemberCount(members?.length || 0);

      const partner = (members || []).find((m: any) => m.user_id !== user.id);
      if (partner) {
        const { data: profile } = await supabase.from('profiles').select('name').eq('id', partner.user_id).single();
        setPartnerName(profile?.name || 'Parceiro(a)');
      }
    }

    setLoading(false);
  }

  function showToast(msg: string, type: 'success' | 'error' = 'success') {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  }

  async function saveName() {
    if (!nameInput.trim()) return;
    setSaving(true);
    await supabase.auth.updateUser({ data: { name: nameInput.trim() } });
    const { data: { user } } = await supabase.auth.getUser();
    if (user) await supabase.from('profiles').upsert({ id: user.id, name: nameInput.trim() }, { onConflict: 'id' });
    setUserName(nameInput.trim());
    setEditingName(false);
    setSaving(false);
    showToast('Nome atualizado! ✅');
  }

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push('/login');
  }

  function copyInviteCode() {
    if (!inviteCode) return;
    navigator.clipboard.writeText(inviteCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    showToast('Código copiado! 🎉');
  }

  if (loading) {
    return (
      <>
        <Header title="Perfil" backHref="/dashboard" />
        <main style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px' }}>
          {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 'var(--radius)', marginBottom: 12 }} />)}
        </main>
      </>
    );
  }

  return (
    <>
      <Header title="Perfil" backHref="/dashboard" />

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          backgroundColor: toast.type === 'success' ? 'var(--green)' : 'var(--red)',
          color: 'white', padding: '12px 24px', borderRadius: 'var(--radius)',
          fontSize: 14, fontWeight: 700, zIndex: 999,
          boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
          animation: 'fadeSlideUp 0.3s ease',
        }}>
          {toast.msg}
        </div>
      )}

      <main style={{ maxWidth: 480, margin: '0 auto', padding: '20px 16px 100px' }}>

        {/* ── Avatar + nome ─────────────────────────────────────────────── */}
        <div className="card animate-in" style={{ padding: '24px 20px', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 16 }}>
          <Avatar name={userName} size={64} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {editingName ? (
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={nameInput} onChange={e => setNameInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && saveName()}
                  autoFocus
                  style={{ flex: 1, padding: '8px 12px', fontSize: 15, fontWeight: 700, border: '2px solid var(--blue)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--surface)', color: 'var(--text)', outline: 'none' }}
                />
                <button onClick={saveName} disabled={saving} style={{ padding: '8px 12px', backgroundColor: 'var(--green)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 700 }}>
                  {saving ? '...' : '✓'}
                </button>
                <button onClick={() => { setEditingName(false); setNameInput(userName); }} style={{ padding: '8px 10px', backgroundColor: 'var(--bg3)', color: 'var(--text-muted)', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                  ✕
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', fontFamily: 'var(--font-display)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userName}</span>
                <button onClick={() => setEditingName(true)} style={{ padding: '4px 8px', backgroundColor: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 11, color: 'var(--text-muted)' }}>✏️</button>
              </div>
            )}
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userEmail}</div>
          </div>
        </div>

        {/* ── Grupo ─────────────────────────────────────────────────────── */}
        <SectionTitle>Grupo</SectionTitle>
        <Card>
          <Row label="Nome do grupo">{householdName || '—'}</Row>
          {shipName && <Row label="Nome do casal">💑 {shipName}</Row>}
          <Row label="Membros">
            {memberCount >= 2
              ? <span>👤 Você + 👤 {partnerName}</span>
              : <span style={{ color: 'var(--orange)' }}>Só você (convide seu parceiro!)</span>
            }
          </Row>
          <div style={{ padding: '14px 0' }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8, fontWeight: 600 }}>Código de convite</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ flex: 1, padding: '10px 14px', backgroundColor: 'var(--bg2)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontFamily: 'var(--font-mono)', fontSize: 16, fontWeight: 700, color: 'var(--text)', letterSpacing: 2 }}>
                {inviteCode || '—'}
              </div>
              <button onClick={copyInviteCode} style={{ padding: '10px 14px', backgroundColor: copied ? 'var(--green)' : 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 700, fontSize: 13, transition: 'background-color 0.2s', whiteSpace: 'nowrap' }}>
                {copied ? '✓ Copiado' : '📋 Copiar'}
              </button>
            </div>
          </div>
        </Card>

        {/* ── Aparência ─────────────────────────────────────────────────── */}
        <SectionTitle>Aparência</SectionTitle>
        <Card style={{ padding: '4px 20px' }}>
          <div style={{ padding: '14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border2)' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>Modo</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{isDark ? 'Escuro' : 'Claro'}</div>
            </div>
            <button onClick={toggleColor} style={{ padding: '8px 16px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--surface)', cursor: 'pointer', fontSize: 18 }}>
              {isDark ? '☀️' : '🌙'}
            </button>
          </div>
          <div style={{ padding: '14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 600 }}>Estilo visual</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{isBrutalist ? 'Neo-Brutalista' : 'GenZ Soft UI'}</div>
            </div>
            <button onClick={toggleStyle} style={{
              padding: '8px 16px', border: isBrutalist ? '2px solid var(--border)' : '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12, fontWeight: 700,
              backgroundColor: isBrutalist ? 'var(--text)' : 'var(--surface)',
              color: isBrutalist ? 'var(--bg)' : 'var(--text2)',
              fontFamily: isBrutalist ? 'var(--font-mono)' : 'inherit',
            }}>
              {isBrutalist ? 'BRUT' : 'GenZ'}
            </button>
          </div>
        </Card>

        {/* ── Segurança ─────────────────────────────────────────────────── */}
        <SectionTitle>Segurança</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ActionBtn onClick={() => router.push('/setup-crypto')} color="var(--purple)">
            <span style={{ fontSize: 20 }}>🔐</span>
            <div>
              <div>Cofre criptografado</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>Configurar PIN e criptografia AES-256</div>
            </div>
          </ActionBtn>
          <ActionBtn onClick={() => router.push('/setup')} color="var(--blue)">
            <span style={{ fontSize: 20 }}>⚙️</span>
            <div>
              <div>Configurações do grupo</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--text-muted)', marginTop: 2 }}>Fechamento, modo do grupo, preferências</div>
            </div>
          </ActionBtn>
        </div>

        {/* ── Conta ─────────────────────────────────────────────────────── */}
        <SectionTitle>Conta</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <ActionBtn onClick={handleSignOut} color="var(--text3)">
            <span style={{ fontSize: 20 }}>🚪</span>
            <div>Sair da conta</div>
          </ActionBtn>
          <ActionBtn onClick={() => router.push('/setup?deleteAccount=1')} danger>
            <span style={{ fontSize: 20 }}>🗑️</span>
            <div>
              <div>Excluir minha conta</div>
              <div style={{ fontSize: 11, fontWeight: 400, color: 'var(--red)', marginTop: 2, opacity: 0.8 }}>Ação irreversível — conforme LGPD</div>
            </div>
          </ActionBtn>
        </div>

        {/* ── Rodapé ────────────────────────────────────────────────────── */}
        <div style={{ marginTop: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
            The Rich Couple · v2.0
          </div>
        </div>

      </main>
    </>
  );
}