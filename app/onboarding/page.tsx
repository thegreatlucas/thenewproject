'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { generateHouseholdKey, encryptHouseholdKey } from '@/lib/crypto';
import { useCrypto } from '@/lib/cryptoContext';

const BUDGET_CATEGORIES = ['Mercado', 'Moradia', 'Lazer', 'Transporte', 'Saúde'];
const GOAL_SUGGESTIONS = ['Viagem de Férias', 'Reserva de Emergência', 'Carro Novo', 'Casamento'];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const router = useRouter();
  const { setHouseholdKey } = useCrypto();

  // Step 2 (Household)
  const [householdMode, setHouseholdMode] = useState<'create' | 'join'>('create');
  const [newHouseholdName, setNewHouseholdName] = useState('');
  const [joinCode, setJoinCode] = useState('');

  // Step 3 (Budget)
  const [budgetAmount, setBudgetAmount] = useState('');
  const [budgetName, setBudgetName] = useState('');

  // Step 4 (Goal)
  const [goalName, setGoalName] = useState('');
  const [goalAmount, setGoalAmount] = useState('');

  // Step 5 (Security)
  const [vaultPin, setVaultPin] = useState('');

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }

    setUserId(user.id);
    setUserName(user.user_metadata?.name || user.email?.split('@')[0] || '');

    // Verifica se já tem household
    const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).maybeSingle();
    if (member) {
      setHouseholdId(member.household_id);
    }
    setInitLoading(false);
  }

  // ==== AÇÕES POR STEP ====

  // Step 1: Bem vindo
  async function completeStep1() {
    if (userName.trim()) {
      await supabase.auth.updateUser({ data: { name: userName.trim() } });
      if (userId) {
        await supabase.from('profiles').upsert({ id: userId, name: userName.trim() }, { onConflict: 'id' });
      }
    }
    if (householdId) {
      // Já tem grupo, pula o Step 2
      setStep(3);
    } else {
      setStep(2);
    }
  }

  // Step 2: Household
  async function completeStep2() {
    setErrorMsg(null);
    setLoading(true);

    if (householdMode === 'create') {
      if (!newHouseholdName.trim()) { setErrorMsg('Digite um nome para o grupo.'); setLoading(false); return; }
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();

      const { data: hh, error } = await supabase.from('households').insert({
        name: newHouseholdName.trim(),
        invite_code: code,
      }).select().single();

      if (error || !hh) { setErrorMsg('Erro ao criar espaço.'); setLoading(false); return; }
      await supabase.from('household_members').insert({ household_id: hh.id, user_id: userId, role: 'admin' });
      setHouseholdId(hh.id);

    } else {
      if (!joinCode.trim()) { setErrorMsg('Informe o código de convite.'); setLoading(false); return; }
      const { data: hh, error } = await supabase.from('households').select('*').eq('invite_code', joinCode.trim().toUpperCase()).single();
      if (error || !hh) { setErrorMsg('Código inválido.'); setLoading(false); return; }

      const { data: existing } = await supabase.from('household_members').select('*').eq('household_id', hh.id).eq('user_id', userId).maybeSingle();
      if (existing) { setErrorMsg('Você já está neste grupo.'); setLoading(false); return; }

      await supabase.from('household_members').insert({ household_id: hh.id, user_id: userId, role: 'member' });
      setHouseholdId(hh.id);
    }

    setLoading(false);
    setStep(3);
  }

  // Step 3: Budget
  async function completeStep3() {
    if (!budgetName || !budgetAmount || !householdId || !userId) {
      setStep(4); return;
    }
    setLoading(true);

    // Create category first
    let catId = '';
    const { data: newCat } = await supabase.from('categories').insert({
      household_id: householdId,
      name: budgetName,
      type: 'expense',
      color: '#3498db',
      icon: '🛒'
    }).select().single();
    if (newCat) catId = newCat.id;

    // Create budget
    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

    if (catId) {
      await supabase.from('budgets').insert({
        household_id: householdId,
        category_id: catId,
        amount: parseFloat(budgetAmount),
        month
      });
    }

    setLoading(false);
    setStep(4);
  }

  // Step 4: Goal
  async function completeStep4() {
    if (!goalName || !goalAmount || !householdId || !userId) {
      setStep(5); return;
    }
    setLoading(true);

    await supabase.from('goals').insert({
      household_id: householdId,
      owner_id: userId,
      name: goalName,
      target_amount: parseFloat(goalAmount),
      current_amount: 0,
      type: 'individual',
      color: '#2ecc71',
      icon: '🎯'
    });

    setLoading(false);
    setStep(5);
  }

  // Step 5: PIN & Finish
  async function finishOnboarding() {
    setLoading(true);
    setErrorMsg(null);

    if (vaultPin && vaultPin.length >= 4 && householdId) {
      const hKey = await generateHouseholdKey();
      const result = await encryptHouseholdKey(hKey, vaultPin);

      await supabase.from('households').update({
        encrypted_key: result.encryptedKey,
        key_salt: result.salt
      }).eq('id', householdId);

      setHouseholdKey(hKey);
    } else if (vaultPin && vaultPin.length > 0 && vaultPin.length < 4) {
      setErrorMsg('O PIN deve ter 4 dígitos no mínimo (ou deixe em branco para pular).');
      setLoading(false);
      return;
    }

    if (householdId) {
      await supabase.from('households').update({ onboarding_done: true }).eq('id', householdId);
    }

    setLoading(false);
    // Force remount by redirecting hard to dashboard
    window.location.href = '/dashboard';
  }

  function skipToDashboard() {
    window.location.href = '/dashboard';
  }

  // ==== RENDER ====

  if (initLoading) {
    return (
      <main style={{ padding: 32, maxWidth: 500, margin: '0 auto', textAlign: 'center' }}>
        <p className="skeleton" style={{ height: 200, borderRadius: 20 }}></p>
      </main>
    );
  }

  const STEPS_TOTAL = 5;
  const progressPct = ((step - 1) / (STEPS_TOTAL - 1)) * 100;

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '32px 20px', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>

      {/* Progress Bar Topo */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ flex: 1, backgroundColor: 'var(--bg2)', height: 8, borderRadius: 4, overflow: 'hidden', marginRight: 16 }}>
          <div style={{ height: '100%', width: `${progressPct}%`, backgroundColor: 'var(--blue)', transition: 'width 0.4s cubic-bezier(0.2, 0.8, 0.2, 1)' }} />
        </div>
        <button onClick={skipToDashboard} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Pular tudo
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>

        {/* VIEW 1: WELCOME */}
        {step === 1 && (
          <div className="animate-in" style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16, textAlign: 'center' }}>👋</div>
            <h1 style={{ fontSize: 28, fontWeight: 800, textAlign: 'center', marginBottom: 16, fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
              Bem-vindo ao<br />The Rich Couple
            </h1>
            <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: 32, fontSize: 15, lineHeight: 1.5 }}>
              Vamos configurar seu espaço financeiro em poucos passos para que você aproveite ao máximo nossa plataforma orgânica e premium.
            </p>

            <div style={{ backgroundColor: 'var(--surface)', padding: 24, borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase' }}>Como podemos te chamar?</label>
              <input
                type="text"
                autoFocus
                value={userName}
                onChange={e => setUserName(e.target.value)}
                placeholder="Seu nome ou apelido"
                style={{ width: '100%', padding: '14px', fontSize: 16, borderRadius: 'var(--radius-sm)', border: '2px solid var(--blue)', outline: 'none', backgroundColor: 'var(--bg)', color: 'var(--text)', transition: 'border 0.2s' }}
              />
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 32 }}>
              <button onClick={completeStep1} style={{ width: '100%', padding: '18px', backgroundColor: 'var(--text)', color: 'var(--bg)', border: 'none', borderRadius: 'var(--radius)', fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-display)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10 }}>
                Começar <span style={{ fontSize: 20 }}>→</span>
              </button>
            </div>
          </div>
        )}

        {/* VIEW 2: HOUSEHOLD */}
        {step === 2 && (
          <div className="animate-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Seu Espaço Financeiro</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
              Você precisa de um "Cofre" para guardar suas finanças. Pode criar um novo ou entrar no da sua parceira(o).
            </p>

            <div style={{ display: 'flex', backgroundColor: 'var(--bg2)', padding: 4, borderRadius: 'var(--radius-sm)', marginBottom: 24 }}>
              <button
                onClick={() => setHouseholdMode('create')}
                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 'var(--radius-sm)', backgroundColor: householdMode === 'create' ? 'var(--surface)' : 'transparent', color: householdMode === 'create' ? 'var(--blue)' : 'var(--text-muted)', fontWeight: householdMode === 'create' ? 700 : 500, cursor: 'pointer', transition: 'all 0.2s', boxShadow: householdMode === 'create' ? 'var(--shadow-sm)' : 'none' }}>
                Novo Espaço
              </button>
              <button
                onClick={() => setHouseholdMode('join')}
                style={{ flex: 1, padding: '10px', border: 'none', borderRadius: 'var(--radius-sm)', backgroundColor: householdMode === 'join' ? 'var(--surface)' : 'transparent', color: householdMode === 'join' ? 'var(--blue)' : 'var(--text-muted)', fontWeight: householdMode === 'join' ? 700 : 500, cursor: 'pointer', transition: 'all 0.2s', boxShadow: householdMode === 'join' ? 'var(--shadow-sm)' : 'none' }}>
                Entrar com Código
              </button>
            </div>

            <div style={{ flex: 1 }}>
              {householdMode === 'create' ? (
                <div className="animate-in">
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>Nome do Espaço</label>
                  <input
                    type="text"
                    autoFocus
                    value={newHouseholdName}
                    onChange={e => setNewHouseholdName(e.target.value)}
                    placeholder="Ex: Vida a Dois, Família Silva..."
                    style={{ width: '100%', padding: '14px', fontSize: 16, borderRadius: 'var(--radius-sm)', border: '2px solid var(--border)', outline: 'none', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                  />
                </div>
              ) : (
                <div className="animate-in">
                  <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>Código do Parceiro(a)</label>
                  <input
                    type="text"
                    autoFocus
                    value={joinCode}
                    onChange={e => setJoinCode(e.target.value.toUpperCase())}
                    placeholder="ABC123"
                    maxLength={8}
                    style={{ width: '100%', padding: '14px', fontSize: 24, textAlign: 'center', letterSpacing: 6, fontFamily: 'monospace', borderRadius: 'var(--radius-sm)', border: '2px dashed var(--green)', outline: 'none', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                  />
                </div>
              )}

              {errorMsg && (
                <div style={{ padding: '12px 16px', backgroundColor: 'rgba(255,92,124,0.1)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', marginTop: 16, fontSize: 13, fontWeight: 600 }}>
                  ⚠️ {errorMsg}
                </div>
              )}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 32 }}>
              <button disabled={loading} onClick={completeStep2} style={{ width: '100%', padding: '16px', backgroundColor: 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer', transition: 'opacity 0.2s', opacity: loading ? 0.7 : 1 }}>
                {loading ? 'Criando/Validando...' : 'Avançar →'}
              </button>
            </div>
          </div>
        )}

        {/* VIEW 3: BUDGET */}
        {step === 3 && (
          <div className="animate-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Seu 1º Orçamento</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
              Defina um teto de gastos para uma categoria principal neste mês. Se não quiser agora, apenas pule.
            </p>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {BUDGET_CATEGORIES.map(c => (
                  <button
                    key={c}
                    onClick={() => setBudgetName(c)}
                    style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid var(--border)', backgroundColor: budgetName === c ? 'var(--blue)' : 'var(--surface)', color: budgetName === c ? 'white' : 'var(--text)', fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' }}>
                    {c}
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>Categoria</label>
                <input
                  type="text"
                  value={budgetName}
                  onChange={e => setBudgetName(e.target.value)}
                  placeholder="Nome da categoria"
                  style={{ width: '100%', padding: '14px', fontSize: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', outline: 'none', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>Teto de Gastos (R$)</label>
                <input
                  type="number"
                  value={budgetAmount}
                  onChange={e => setBudgetAmount(e.target.value)}
                  placeholder="Ex: 1500"
                  style={{ width: '100%', padding: '14px', fontSize: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', outline: 'none', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                />
              </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', gap: 12 }}>
              <button disabled={loading} onClick={() => setStep(4)} style={{ padding: '16px', backgroundColor: 'var(--bg2)', color: 'var(--text-muted)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                Pular
              </button>
              <button disabled={loading} onClick={completeStep3} style={{ flex: 1, padding: '16px', backgroundColor: 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Salvando...' : 'Avançar →'}
              </button>
            </div>
          </div>
        )}

        {/* VIEW 4: GOAL */}
        {step === 4 && (
          <div className="animate-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Uma Meta Financeira</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
              O que você quer conquistar com seu dinheiro? Defina sua primeira meta.
            </p>

            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 24 }}>
                {GOAL_SUGGESTIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => setGoalName(c)}
                    style={{ padding: '8px 16px', borderRadius: 20, border: '1px solid var(--border)', backgroundColor: goalName === c ? 'var(--green)' : 'var(--surface)', color: goalName === c ? 'white' : 'var(--text)', fontSize: 13, cursor: 'pointer', transition: 'all 0.2s' }}>
                    {c}
                  </button>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>Objetivo</label>
                <input
                  type="text"
                  value={goalName}
                  onChange={e => setGoalName(e.target.value)}
                  placeholder="Qual o nome do seu sonho?"
                  style={{ width: '100%', padding: '14px', fontSize: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', outline: 'none', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>Valor Alvo (R$)</label>
                <input
                  type="number"
                  value={goalAmount}
                  onChange={e => setGoalAmount(e.target.value)}
                  placeholder="Ex: 5000"
                  style={{ width: '100%', padding: '14px', fontSize: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', outline: 'none', backgroundColor: 'var(--surface)', color: 'var(--text)' }}
                />
              </div>
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', gap: 12 }}>
              <button disabled={loading} onClick={() => setStep(5)} style={{ padding: '16px', backgroundColor: 'var(--bg2)', color: 'var(--text-muted)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 15, fontWeight: 700, cursor: 'pointer' }}>
                Pular
              </button>
              <button disabled={loading} onClick={completeStep4} style={{ flex: 1, padding: '16px', backgroundColor: 'var(--green)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 15, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
                {loading ? 'Salvando...' : 'Avançar →'}
              </button>
            </div>
          </div>
        )}

        {/* VIEW 5: PIN & SECURITY */}
        {step === 5 && (
          <div className="animate-in" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h2 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8, color: 'var(--text)' }}>Segurança Máxima</h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: 24, fontSize: 14 }}>
              Nós não temos acesso aos seus dados financeiros. Defina um PIN de acesso único (AES-256) para criptografar o banco.
            </p>

            <div style={{ flex: 1 }}>
              <div style={{ padding: 24, backgroundColor: 'rgba(156, 136, 255,0.08)', borderRadius: 'var(--radius)', border: '1px solid rgba(156, 136, 255,0.3)', marginBottom: 24, textAlign: 'center' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🔐</div>
                <div style={{ fontSize: 13, color: '#6c5ce7', fontWeight: 600 }}>Criptografia de Ponta a Ponta Ativada</div>
              </div>

              <div className="animate-in">
                <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--text3)', marginBottom: 8 }}>PIN do Cofre (4 a 6 dígitos)</label>
                <input
                  type="password"
                  inputMode="numeric"
                  autoFocus
                  value={vaultPin}
                  onChange={e => setVaultPin(e.target.value)}
                  placeholder="••••"
                  style={{ width: '100%', padding: '16px', fontSize: 28, letterSpacing: 8, textAlign: 'center', borderRadius: 'var(--radius-sm)', border: '2px solid var(--purple)', outline: 'none', backgroundColor: 'var(--surface)', color: 'var(--text)', transition: 'border 0.2s' }}
                />
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8, textAlign: 'center' }}>
                  Aviso: Se você perder o PIN, jamais poderemos recuperar seus dados. Salve bem!
                </div>
              </div>

              {errorMsg && (
                <div style={{ padding: '12px 16px', backgroundColor: 'rgba(255,92,124,0.1)', color: 'var(--red)', borderRadius: 'var(--radius-sm)', marginTop: 16, fontSize: 13, fontWeight: 600 }}>
                  ⚠️ {errorMsg}
                </div>
              )}
            </div>

            <div style={{ marginTop: 'auto', paddingTop: 32, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button disabled={loading} onClick={finishOnboarding} style={{ width: '100%', padding: '18px', backgroundColor: 'var(--purple)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 16, fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
                {loading ? 'Finalizando...' : 'Concluir Setup 🎉'}
              </button>
              <button disabled={loading} onClick={() => finishOnboarding()} style={{ padding: '12px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                Deixar desprotegido por agora
              </button>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}