'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';
import { generateHouseholdKey, encryptHouseholdKey } from '@/lib/crypto';
import { useCrypto } from '@/lib/cryptoContext';
import { useFinanceGroup } from '@/lib/financeGroupContext';

type View = 'loading' | 'settings' | 'choose' | 'create' | 'join';

export default function SetupPage() {
  const [view, setView] = useState<View>('loading');
  const [household, setHousehold] = useState<any>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);

  // Form fields
  const [userName, setUserName] = useState('');
  const [householdName, setHouseholdName] = useState('');
  const [shipName, setShipName] = useState('');
  const [closeMode, setCloseMode] = useState<'manual' | 'auto'>('manual');
  const [closeDay, setCloseDay] = useState('');
  const [vaultPin, setVaultPin] = useState('');

  // Create/join
  const [newHouseholdName, setNewHouseholdName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const [loading, setLoading] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const router = useRouter();
  const { setHouseholdKey } = useCrypto();
  const { groups, activeGroup, activeGroupId } = useFinanceGroup();

  useEffect(() => {
    init();
  }, [activeGroupId, activeGroup, groups.length]);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    setUserName(user.user_metadata?.name || '');

    if (activeGroup && activeGroupId) {
      setHousehold(activeGroup);
      setHouseholdId(activeGroupId);
      setHouseholdName(activeGroup.name || '');
      setShipName(activeGroup.shipName || '');
      setCloseMode(activeGroup.closeMode || 'manual');
      setCloseDay(activeGroup.closeDay ? String(activeGroup.closeDay) : '');
      setView('settings');
    } else {
      setView('choose');
    }
  }

  // ── Save all settings ──────────────────────────────────────────
  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    setSavingSettings(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setSavingSettings(false); return; }

    // Save display name
    await supabase.auth.updateUser({ data: { name: userName.trim() } });

    // Save to profiles table (if it exists)
    await supabase.from('profiles').upsert({ id: user.id, name: userName.trim() }, { onConflict: 'id' });

    // Save household settings
    if (householdId) {
      const updates: any = {
        name: householdName.trim() || household?.name,
        ship_name: shipName.trim() || null,
        close_mode: closeMode,
        close_day: closeMode === 'auto' && closeDay ? parseInt(closeDay) : null,
      };

      const { error } = await supabase
        .from('households')
        .update(updates)
        .eq('id', householdId);

      if (error) {
        setErrorMsg('Erro ao salvar configurações: ' + error.message);
        setSavingSettings(false);
        return;
      }

      setHousehold((prev: any) => ({ ...prev, ...updates }));
    }

    setSavingSettings(false);
    setSuccessMsg('Configurações salvas com sucesso! ✅');
    setTimeout(() => setSuccessMsg(null), 3000);
  }

  // ── Create household ──────────────────────────────────────────
  async function handleCreateHousehold(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    if (!newHouseholdName.trim()) { setErrorMsg('Digite um nome para o grupo.'); return; }
    if (vaultPin && vaultPin.length < 4) { setErrorMsg('O PIN deve ter pelo menos 4 dígitos.'); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg('Faça login primeiro.'); setLoading(false); return; }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    let encryptedKey: string | undefined;
    let salt: string | undefined;
    let hKey: CryptoKey | undefined;

    if (vaultPin && vaultPin.length >= 4) {
      hKey = await generateHouseholdKey();
      const result = await encryptHouseholdKey(hKey, vaultPin);
      encryptedKey = result.encryptedKey;
      salt = result.salt;
    }

    const { data: hh, error: householdError } = await supabase
      .from('households')
      .insert({
        name: newHouseholdName.trim(),
        invite_code: code,
        ...(encryptedKey ? { encrypted_key: encryptedKey, key_salt: salt } : {}),
      })
      .select()
      .single();

    if (householdError) { setErrorMsg('Erro ao criar: ' + householdError.message); setLoading(false); return; }

    await supabase.from('household_members').insert({ household_id: hh.id, user_id: user.id, role: 'admin' });
    await supabase.auth.updateUser({ data: { name: userName.trim() || user.email } });
    await supabase.from('profiles').upsert({ id: user.id, name: userName.trim() || '' }, { onConflict: 'id' });

    if (hKey) setHouseholdKey(hKey);

    setLoading(false);
    // ✅ CORRIGIDO: navegação hard para forçar remount do FinanceGroupProvider
    // Isso garante que o contexto busca os grupos novamente do zero
    window.location.href = '/dashboard';
  }

  // ── Join household ──────────────────────────────────────────
  async function handleJoinHousehold(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);
    const code = joinCode.trim().toUpperCase();
    if (!code) { setErrorMsg('Digite o código de convite.'); return; }

    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setErrorMsg('Faça login primeiro.'); setLoading(false); return; }

    const { data: hh, error } = await supabase
      .from('households').select('*').eq('invite_code', code).single();

    if (error || !hh) { setErrorMsg('Código inválido ou não encontrado.'); setLoading(false); return; }

    const { data: existing } = await supabase
      .from('household_members').select('*')
      .eq('household_id', hh.id).eq('user_id', user.id).maybeSingle();

    if (existing) { setErrorMsg('Você já faz parte deste espaço financeiro.'); setLoading(false); return; }

    await supabase.from('household_members').insert({ household_id: hh.id, user_id: user.id, role: 'member' });
    await supabase.auth.updateUser({ data: { name: userName.trim() || user.email } });
    await supabase.from('profiles').upsert({ id: user.id, name: userName.trim() || '' }, { onConflict: 'id' });

    setLoading(false);
    // ✅ CORRIGIDO: navegação hard para forçar remount do FinanceGroupProvider
    window.location.href = '/dashboard';
  }

  // ── Leave household ──────────────────────────────────────────
  async function handleLeave() {
    if (!confirm('Sair deste espaço financeiro? Seus dados não serão apagados.')) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('household_members')
      .delete().eq('household_id', household.id).eq('user_id', user.id);
    setHousehold(null);
    setHouseholdId(null);
    setView('choose');
    setSuccessMsg(null);
  }

  // ── Copy code ──────────────────────────────────────────
  function copyCode(code: string) {
    navigator.clipboard.writeText(code);
    setSuccessMsg('Código copiado! 📋');
    setTimeout(() => setSuccessMsg(null), 2000);
  }

  // ── Shared styles ──────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '12px 14px', fontSize: 15,
    borderRadius: 'var(--radius)', border: '1px solid #e0e0e0',
    outline: 'none', boxSizing: 'border-box',
    backgroundColor: 'var(--surface)', color: 'var(--text)',
    transition: 'border-color 0.15s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontWeight: '600', fontSize: 13,
    color: 'var(--text2)', marginBottom: 6,
  };

  const sectionStyle: React.CSSProperties = {
    border: '1px solid var(--border2)', borderRadius: 14, padding: '20px 22px', marginBottom: 16,
    backgroundColor: 'var(--bg2)',
  };

  const sectionTitle: React.CSSProperties = {
    fontSize: 14, fontWeight: '700', color: '#222',
    marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8,
  };

  if (view === 'loading') return (
    <>
      <Header title="⚙️ Configurações" />
      <main style={{ padding: 16 }}><p style={{ color: 'var(--text-muted)' }}>Carregando...</p></main>
    </>
  );

  // ──────────────────────────────────────────────────────────────
  // SETTINGS VIEW
  // ──────────────────────────────────────────────────────────────
  if (view === 'settings' && household) return (
    <>
      <Header title="⚙️ Configurações" action={{ label: '← Dashboard', href: '/dashboard' }} />
      <main style={{ padding: 16, maxWidth: 520, margin: '0 auto', paddingBottom: 60 }}>

        {successMsg && (
          <div style={{ backgroundColor: '#d4edda', border: '1px solid #b8dfc7', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, color: '#1a5e34', fontSize: 14 }}>
            {successMsg}
          </div>
        )}
        {errorMsg && (
          <div style={{ backgroundColor: '#fde8e8', border: '1px solid #f5c6cb', borderRadius: 'var(--radius)', padding: '12px 16px', marginBottom: 16, color: '#7b1a1a', fontSize: 14 }}>
            ❌ {errorMsg}
          </div>
        )}

        <form onSubmit={handleSaveSettings}>

          {/* Perfil */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>👤 Seu perfil</div>
            <label style={labelStyle}>Seu nome</label>
            <input
              type="text"
              value={userName}
              onChange={e => setUserName(e.target.value)}
              placeholder="Como você quer ser chamado(a)"
              style={inputStyle}
            />
          </div>

          {/* Grupo */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>🏠 Identidade do espaço financeiro</div>

            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>Nome do grupo</label>
              <input
                type="text"
                value={householdName}
                onChange={e => setHouseholdName(e.target.value)}
                placeholder="Lucas & Victória"
                style={inputStyle}
              />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
                Nome do espaço financeiro, exibido no dashboard e relatórios.
              </div>
            </div>

            <div>
              <label style={labelStyle}>Ship name <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional)</span></label>
              <input
                type="text"
                value={shipName}
                onChange={e => setShipName(e.target.value)}
                placeholder="Lucktória ❤️, Vicucas 💕, The Rich Couple..."
                style={inputStyle}
              />
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
                Um apelido criativo do grupo. Aparece no topo do dashboard.
              </div>
            </div>
          </div>

          {/* Fechamento mensal */}
          <div style={sectionStyle}>
            <div style={sectionTitle}>📅 Fechamento mensal</div>
            <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 14, lineHeight: 1.5 }}>
              O fechamento salva um snapshot do mês: renda, gastos, saldo e acertos entre os membros do grupo.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              {(['manual', 'auto'] as const).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setCloseMode(mode)}
                  style={{
                    padding: '14px 10px',
                    border: closeMode === mode ? '2px solid #3498db' : '1px solid #ddd',
                    borderRadius: 'var(--radius)', cursor: 'pointer', textAlign: 'center',
                    backgroundColor: closeMode === mode ? '#eaf4fd' : 'white',
                    fontWeight: closeMode === mode ? 600 : 400,
                    fontSize: 14, transition: 'all 0.15s',
                  }}
                >
                  {mode === 'manual' ? '🖐️ Manual' : '⚡ Automático'}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontWeight: 400 }}>
                    {mode === 'manual' ? 'Você decide quando fechar' : 'Fecha num dia fixo'}
                  </div>
                </button>
              ))}
            </div>

            {closeMode === 'auto' && (
              <div>
                <label style={labelStyle}>Dia do mês para fechar</label>
                <select
                  value={closeDay}
                  onChange={e => setCloseDay(e.target.value)}
                  style={{ ...inputStyle, cursor: 'pointer' }}
                >
                  <option value="">Selecione o dia</option>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>Dia {d}</option>
                  ))}
                </select>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
                  Limitado ao dia 28 para funcionar em todos os meses.
                </div>
              </div>
            )}
          </div>

          {/* Botão salvar */}
          <button
            type="submit"
            disabled={savingSettings}
            style={{
              width: '100%', padding: '15px',
              backgroundColor: savingSettings ? '#95a5a6' : '#2ecc71',
              color: 'white', border: 'none', borderRadius: 'var(--radius)',
              cursor: savingSettings ? 'not-allowed' : 'pointer',
              fontWeight: 'bold', fontSize: 16, marginBottom: 16,
              transition: 'background-color 0.15s',
            }}
          >
            {savingSettings ? 'Salvando...' : '💾 Salvar configurações'}
          </button>
        </form>

        {/* Código de convite */}
        <div style={sectionStyle}>
          <div style={sectionTitle}>🔑 Código de convite</div>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>
            Compartilhe com outras pessoas para que elas entrem neste espaço financeiro.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              flex: 1, fontSize: 26, fontWeight: 'bold', letterSpacing: 6,
              backgroundColor: '#f0f4ff', border: '2px dashed #3498db',
              borderRadius: 'var(--radius)', padding: '12px 16px', textAlign: 'center',
              fontFamily: 'monospace',
            }}>
              {household.invite_code}
            </div>
            <button
              onClick={() => copyCode(household.invite_code)}
              style={{
                padding: '12px 16px', backgroundColor: 'var(--blue)', color: 'white',
                border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
              }}
            >
              📋 Copiar
            </button>
          </div>
        </div>

        {/* Compartilhamento de chave cripto */}
        <div style={sectionStyle}>
          <div style={sectionTitle}>🔐 Chave do cofre</div>
          <p style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 12 }}>
            Para que seu parceiro(a) veja os dados criptografados neste dispositivo, é preciso compartilhar a chave AES do cofre de forma segura.
          </p>
          <Link href="/setup-crypto" style={{ textDecoration: 'none', display: 'block' }}>
            <button
              style={{
                width: '100%', padding: '12px 16px',
                backgroundColor: 'var(--purple)', color: 'white',
                border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer',
                fontSize: 14, fontWeight: 600, display: 'flex',
                alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              🔐 Compartilhar / Receber chave via QR
            </button>
          </Link>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Gera um QR code de 1 uso que expira em 10 minutos. Nunca trafega a chave em texto puro.
          </div>
        </div>

        {/* Zona de perigo */}
        <div style={{ border: '1px solid #fde8e8', borderRadius: 14, padding: '16px 22px', backgroundColor: '#fff8f8' }}>
          <div style={{ ...sectionTitle, color: '#c0392b' }}>⚠️ Zona de perigo</div>
          <button
            onClick={handleLeave}
            style={{
              padding: '10px 20px', backgroundColor: 'transparent',
              color: 'var(--red)', border: '1px solid #e74c3c',
              borderRadius: 'var(--radius)', cursor: 'pointer', fontSize: 13,
            }}
          >
            Sair deste espaço financeiro
          </button>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
            Seus dados financeiros não serão apagados.
          </div>
        </div>

      </main>
    </>
  );

  // ──────────────────────────────────────────────────────────────
  // CHOOSE VIEW
  // ──────────────────────────────────────────────────────────────
  if (view === 'choose') return (
    <>
      <Header title="⚙️ Configurações" />
      <main style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <h2 style={{ marginBottom: 6 }}>👋 Bem-vindo(a)!</h2>
        <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 28 }}>
          Você ainda não está em nenhum espaço financeiro. Crie um novo ou entre com um código de convite.
        </p>

        {/* Nome do usuário antes de prosseguir */}
        <div style={{ ...sectionStyle, marginBottom: 24 }}>
          <label style={labelStyle}>Seu nome <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(opcional agora)</span></label>
          <input
            type="text"
            value={userName}
            onChange={e => setUserName(e.target.value)}
            placeholder="Como você quer ser chamado(a)"
            style={inputStyle}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <button
            onClick={() => { setView('create'); setErrorMsg(null); }}
            style={{
              padding: 24, border: '2px solid #3498db', borderRadius: 14,
              backgroundColor: '#f0f8ff', cursor: 'pointer', textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>🏠</div>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Criar espaço</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Sou o primeiro(a) a entrar</div>
          </button>

          <button
            onClick={() => { setView('join'); setErrorMsg(null); }}
            style={{
              padding: 24, border: '2px solid #2ecc71', borderRadius: 14,
              backgroundColor: '#f0fff4', cursor: 'pointer', textAlign: 'center',
            }}
          >
            <div style={{ fontSize: 36, marginBottom: 8 }}>🔑</div>
            <div style={{ fontWeight: 'bold', marginBottom: 4 }}>Entrar com código</div>
            <div style={{ fontSize: 12, color: 'var(--text3)' }}>Tenho um convite</div>
          </button>
        </div>
      </main>
    </>
  );

  // ──────────────────────────────────────────────────────────────
  // CREATE VIEW
  // ──────────────────────────────────────────────────────────────
  if (view === 'create') return (
    <>
      <Header title="⚙️ Criar espaço" />
      <main style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => setView('choose')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', marginBottom: 16, padding: 0, fontSize: 14 }}>
          ← Voltar
        </button>
        <h2 style={{ marginBottom: 6 }}>🏠 Criar espaço financeiro</h2>
        <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 24 }}>
          Depois de criar, você receberá um código para compartilhar com seu parceiro(a).
        </p>

        <form onSubmit={handleCreateHousehold}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Nome do grupo</label>
            <input
              type="text"
              value={newHouseholdName}
              onChange={e => setNewHouseholdName(e.target.value)}
              placeholder="Família Silva, Meu financeiro pessoal..."
              style={inputStyle}
            />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
              Pode ser qualquer nome — você pode mudar depois nas configurações.
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>PIN do cofre <span style={{ fontWeight: 400, color: 'var(--text-muted)' }}>(recomendado)</span></label>
            <input
              type="password"
              inputMode="numeric"
              value={vaultPin}
              onChange={e => setVaultPin(e.target.value)}
              placeholder="Mínimo 4 dígitos"
              style={inputStyle}
            />
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 5 }}>
              Protege seus dados com criptografia. Os membros deste grupo vão usar este PIN para acessar as finanças. Guarde bem — não é possível recuperá-lo.
            </div>
          </div>

          {errorMsg && (
            <div style={{ color: 'var(--red)', backgroundColor: '#fde8e8', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 14, fontSize: 14 }}>
              ❌ {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px',
              backgroundColor: loading ? '#95a5a6' : '#3498db',
              color: 'white', border: 'none', borderRadius: 'var(--radius)',
              cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 16,
            }}
          >
            {loading ? 'Criando...' : '✅ Criar espaço'}
          </button>
        </form>
      </main>
    </>
  );

  // ──────────────────────────────────────────────────────────────
  // JOIN VIEW
  // ──────────────────────────────────────────────────────────────
  return (
    <>
      <Header title="⚙️ Entrar com código" />
      <main style={{ padding: 16, maxWidth: 480, margin: '0 auto' }}>
        <button onClick={() => setView('choose')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--blue)', marginBottom: 16, padding: 0, fontSize: 14 }}>
          ← Voltar
        </button>
        <h2 style={{ marginBottom: 6 }}>🔑 Entrar com código</h2>
        <p style={{ color: 'var(--text3)', fontSize: 14, marginBottom: 24 }}>
          Digite o código que seu parceiro(a) te enviou.
        </p>

        <form onSubmit={handleJoinHousehold}>
          <input
            type="text"
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={8}
            style={{
              ...inputStyle,
              fontSize: 28, textAlign: 'center', letterSpacing: 8,
              fontFamily: 'monospace', border: '2px dashed #2ecc71', marginBottom: 8,
            }}
          />
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 20 }}>
            6 caracteres, não diferencia maiúsculas/minúsculas.
          </div>

          {errorMsg && (
            <div style={{ color: 'var(--red)', backgroundColor: '#fde8e8', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 14, fontSize: 14 }}>
              ❌ {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%', padding: '14px',
              backgroundColor: loading ? '#95a5a6' : '#2ecc71',
              color: 'white', border: 'none', borderRadius: 'var(--radius)',
              cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 16,
            }}
          >
            {loading ? 'Verificando...' : '🚀 Entrar no casal'}
          </button>
        </form>
      </main>
    </>
  );
}