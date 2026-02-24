'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/format';

const INCOME_TYPES = [
  { value: 'salary',     label: '💼 Salário' },
  { value: 'freelance',  label: '💻 Freelance' },
  { value: 'bonus',      label: '🎯 Bônus' },
  { value: 'vr',         label: '🍽️ Vale Refeição' },
  { value: 'va',         label: '🛒 Vale Alimentação' },
  { value: 'investment', label: '📈 Rendimento' },
  { value: 'other',      label: '❓ Outro' },
];

const ACCOUNT_TYPES = [
  { value: 'checking',     label: '🏦 Conta Corrente' },
  { value: 'savings',      label: '💰 Poupança' },
  { value: 'cash',         label: '💵 Dinheiro' },
  { value: 'meal_voucher', label: '🍽️ Vale Refeição' },
  { value: 'food_voucher', label: '🛒 Vale Alimentação' },
  { value: 'investment',   label: '📈 Investimento' },
  { value: 'other',        label: '❓ Outro' },
];

const RECURRENCE_SUGGESTIONS = [
  { name: 'Netflix',   amount: '' },
  { name: 'Spotify',   amount: '' },
  { name: 'Internet',  amount: '' },
  { name: 'Academia',  amount: '' },
  { name: 'Aluguel',   amount: '' },
];

export default function OnboardingPage() {
  const [step, setStep] = useState(1);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(false);
  const [initLoading, setInitLoading] = useState(true);
  const router = useRouter();

  // Step 1 — Renda
  const [incomes, setIncomes] = useState([
    { description: '', amount: '', type: 'salary' },
  ]);

  // Step 2 — Contas
  const [accounts, setAccounts] = useState([
    { name: '', type: 'checking' },
  ]);

  // Step 3 — Recorrências
  const [recurrences, setRecurrences] = useState([
    { name: '', amount: '', due_day: '1' },
  ]);

  useEffect(() => { init(); }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUserId(user.id);
    setUserName(user.user_metadata?.name || user.email?.split('@')[0] || '');

    const { data: member } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .single();

    if (!member) { router.push('/setup'); return; }
    setHouseholdId(member.household_id);
    setInitLoading(false);
  }

  // ── Step 1: Save incomes ──────────────────────────────────
  async function handleSaveIncomes() {
    if (!householdId || !userId) return;
    setLoading(true);

    const validIncomes = incomes.filter(i => i.description.trim() && parseFloat(i.amount) > 0);

    if (validIncomes.length > 0) {
      const now = new Date();
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

      await supabase.from('incomes').insert(
        validIncomes.map(i => ({
          household_id: householdId,
          user_id: userId,
          description: i.description.trim(),
          amount: parseFloat(i.amount),
          type: i.type,
          recurrence: 'monthly',
          month,
        }))
      );
    }

    setLoading(false);
    setStep(2);
  }

  // ── Step 2: Save accounts ──────────────────────────────────
  async function handleSaveAccounts() {
    if (!householdId || !userId) return;
    setLoading(true);

    const validAccounts = accounts.filter(a => a.name.trim());

    if (validAccounts.length > 0) {
      await supabase.from('accounts').insert(
        validAccounts.map(a => ({
          household_id: householdId,
          owner_id: userId,
          name: a.name.trim(),
          type: a.type,
        }))
      );
    }

    setLoading(false);
    setStep(3);
  }

  // ── Step 3: Save recurrences ──────────────────────────────
  async function handleSaveRecurrences() {
    if (!householdId) return;
    setLoading(true);

    const validRec = recurrences.filter(r => r.name.trim() && parseFloat(r.amount) > 0);

    if (validRec.length > 0) {
      const now = new Date();

      for (const r of validRec) {
        const dueDay = parseInt(r.due_day) || 1;
        const nextDate = new Date(now.getFullYear(), now.getMonth(), dueDay);
        if (nextDate <= now) nextDate.setMonth(nextDate.getMonth() + 1);

        await supabase.from('recurrence_rules').insert({
          household_id: householdId,
          name: r.name.trim(),
          recurrence_type: 'fixed',
          amount: parseFloat(r.amount),
          due_day: dueDay,
          day_of_month: dueDay,
          frequency: 'monthly',
          next_date: nextDate.toISOString().split('T')[0],
          active: true,
          split: 'individual',
          payment_method: 'pix',
        });
      }
    }

    // Mark onboarding as done
    await supabase.from('households')
      .update({ onboarding_done: true })
      .eq('id', householdId);

    setLoading(false);
    router.push('/dashboard');
  }

  // ── Shared styles ──────────────────────────────────────────
  const inputStyle: React.CSSProperties = {
    padding: '11px 14px', fontSize: 14, borderRadius: 'var(--radius)',
    border: '1px solid #e0e0e0', outline: 'none',
    backgroundColor: 'var(--surface)', boxSizing: 'border-box',
  };

  if (initLoading) return <main style={{ padding: 24 }}><p style={{ color: 'var(--text-muted)' }}>Carregando...</p></main>;

  // ── Progress bar ──────────────────────────────────────────
  const steps = ['Renda', 'Contas', 'Recorrências'];

  return (
    <main style={{ maxWidth: 520, margin: '0 auto', padding: '32px 16px 80px' }}>

      {/* Header */}
      <div style={{ marginBottom: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>💑</div>
        <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
          Olá{userName ? `, ${userName}` : ''}! Vamos configurar tudo.
        </h1>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', margin: '8px 0 0' }}>
          3 passos rápidos para começar a usar o app.
        </p>
      </div>

      {/* Progress */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 32, gap: 0 }}>
        {steps.map((s, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <div key={s} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', display: 'flex',
                  alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700,
                  backgroundColor: done ? '#2ecc71' : active ? '#3498db' : '#eee',
                  color: done || active ? 'white' : '#aaa',
                  transition: 'all 0.3s',
                }}>
                  {done ? '✓' : n}
                </div>
                <div style={{ fontSize: 11, color: active ? '#3498db' : done ? '#2ecc71' : '#aaa', marginTop: 4, fontWeight: active ? 600 : 400 }}>
                  {s}
                </div>
              </div>
              {i < steps.length - 1 && (
                <div style={{ height: 2, flex: 0.8, backgroundColor: done ? '#2ecc71' : '#eee', marginBottom: 18, transition: 'background 0.3s' }} />
              )}
            </div>
          );
        })}
      </div>

      {/* ── STEP 1: Renda ── */}
      {step === 1 && (
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>💵 Sua renda mensal</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Adicione suas fontes de renda. Pode pular e adicionar depois.
          </p>

          {incomes.map((inc, i) => (
            <div key={i} style={{ border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 12, backgroundColor: 'var(--bg2)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Descrição</div>
                  <input
                    type="text"
                    placeholder="Ex: Salário CLT"
                    value={inc.description}
                    onChange={e => setIncomes(incomes.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Valor (R$)</div>
                  <input
                    type="number"
                    placeholder="5000"
                    value={inc.amount}
                    onChange={e => setIncomes(incomes.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Tipo</div>
                <select
                  value={inc.type}
                  onChange={e => setIncomes(incomes.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
                  style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
                >
                  {INCOME_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {incomes.length > 1 && (
                <button
                  onClick={() => setIncomes(incomes.filter((_, j) => j !== i))}
                  style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12 }}
                >
                  × Remover
                </button>
              )}
            </div>
          ))}

          <button
            onClick={() => setIncomes([...incomes, { description: '', amount: '', type: 'salary' }])}
            style={{ width: '100%', padding: '10px', border: '1px dashed #3498db', borderRadius: 'var(--radius)', backgroundColor: 'transparent', color: 'var(--blue)', cursor: 'pointer', fontSize: 14, marginBottom: 20 }}
          >
            + Adicionar outra renda
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              onClick={() => setStep(2)}
              style={{ padding: '13px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', backgroundColor: 'var(--surface)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}
            >
              Pular por agora
            </button>
            <button
              onClick={handleSaveIncomes}
              disabled={loading}
              style={{ padding: '13px', border: 'none', borderRadius: 'var(--radius)', backgroundColor: loading ? '#95a5a6' : '#3498db', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}
            >
              {loading ? 'Salvando...' : 'Próximo →'}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 2: Contas ── */}
      {step === 2 && (
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>🏦 Suas contas</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Cadastre suas contas bancárias para rastrear de onde saem os gastos.
          </p>

          {accounts.map((acc, i) => (
            <div key={i} style={{ border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 12, backgroundColor: 'var(--bg2)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Nome</div>
                  <input
                    type="text"
                    placeholder="Ex: Nubank, Inter, Bradesco..."
                    value={acc.name}
                    onChange={e => setAccounts(accounts.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Tipo</div>
                  <select
                    value={acc.type}
                    onChange={e => setAccounts(accounts.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
                    style={{ ...inputStyle, width: '100%', cursor: 'pointer' }}
                  >
                    {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              {accounts.length > 1 && (
                <button
                  onClick={() => setAccounts(accounts.filter((_, j) => j !== i))}
                  style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12 }}
                >
                  × Remover
                </button>
              )}
            </div>
          ))}

          <button
            onClick={() => setAccounts([...accounts, { name: '', type: 'checking' }])}
            style={{ width: '100%', padding: '10px', border: '1px dashed #3498db', borderRadius: 'var(--radius)', backgroundColor: 'transparent', color: 'var(--blue)', cursor: 'pointer', fontSize: 14, marginBottom: 20 }}
          >
            + Adicionar outra conta
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              onClick={() => setStep(1)}
              style={{ padding: '13px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', backgroundColor: 'var(--surface)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}
            >
              ← Voltar
            </button>
            <button
              onClick={handleSaveAccounts}
              disabled={loading}
              style={{ padding: '13px', border: 'none', borderRadius: 'var(--radius)', backgroundColor: loading ? '#95a5a6' : '#3498db', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 14 }}
            >
              {loading ? 'Salvando...' : 'Próximo →'}
            </button>
          </div>

          <button
            onClick={() => setStep(3)}
            style={{ width: '100%', marginTop: 10, padding: '10px', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
          >
            Pular por agora
          </button>
        </div>
      )}

      {/* ── STEP 3: Recorrências ── */}
      {step === 3 && (
        <div>
          <h2 style={{ fontSize: 18, marginBottom: 4 }}>🔁 Contas fixas mensais</h2>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 20 }}>
            Adicione contas que se repetem todo mês. O app vai lembrá-los de pagar.
          </p>

          {/* Sugestões rápidas */}
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Sugestões rápidas:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {RECURRENCE_SUGGESTIONS.map(s => (
                <button
                  key={s.name}
                  onClick={() => {
                    const alreadyAdded = recurrences.some(r => r.name === s.name);
                    if (!alreadyAdded) {
                      setRecurrences([...recurrences.filter(r => r.name.trim() || r.amount.trim()), { name: s.name, amount: '', due_day: '1' }]);
                    }
                  }}
                  style={{
                    padding: '6px 12px', border: '1px solid var(--border)', borderRadius: 20,
                    backgroundColor: recurrences.some(r => r.name === s.name) ? '#e8f4fd' : 'white',
                    cursor: 'pointer', fontSize: 13,
                    color: recurrences.some(r => r.name === s.name) ? '#3498db' : '#555',
                  }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          {recurrences.map((rec, i) => (
            <div key={i} style={{ border: '1px solid var(--border2)', borderRadius: 'var(--radius)', padding: 16, marginBottom: 12, backgroundColor: 'var(--bg2)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Nome</div>
                  <input
                    type="text"
                    placeholder="Netflix"
                    value={rec.name}
                    onChange={e => setRecurrences(recurrences.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Valor (R$)</div>
                  <input
                    type="number"
                    placeholder="55,90"
                    value={rec.amount}
                    onChange={e => setRecurrences(recurrences.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4, fontWeight: 600 }}>Dia venc.</div>
                  <input
                    type="number"
                    placeholder="1"
                    min="1"
                    max="28"
                    value={rec.due_day}
                    onChange={e => setRecurrences(recurrences.map((x, j) => j === i ? { ...x, due_day: e.target.value } : x))}
                    style={{ ...inputStyle, width: '100%' }}
                  />
                </div>
              </div>
              {recurrences.length > 1 && (
                <button
                  onClick={() => setRecurrences(recurrences.filter((_, j) => j !== i))}
                  style={{ marginTop: 10, background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', fontSize: 12 }}
                >
                  × Remover
                </button>
              )}
            </div>
          ))}

          <button
            onClick={() => setRecurrences([...recurrences, { name: '', amount: '', due_day: '1' }])}
            style={{ width: '100%', padding: '10px', border: '1px dashed #3498db', borderRadius: 'var(--radius)', backgroundColor: 'transparent', color: 'var(--blue)', cursor: 'pointer', fontSize: 14, marginBottom: 20 }}
          >
            + Adicionar outra recorrência
          </button>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <button
              onClick={() => setStep(2)}
              style={{ padding: '13px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', backgroundColor: 'var(--surface)', cursor: 'pointer', color: 'var(--text-muted)', fontSize: 14 }}
            >
              ← Voltar
            </button>
            <button
              onClick={handleSaveRecurrences}
              disabled={loading}
              style={{ padding: '13px', border: 'none', borderRadius: 'var(--radius)', backgroundColor: loading ? '#95a5a6' : '#2ecc71', color: 'white', cursor: loading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 16 }}
            >
              {loading ? 'Salvando...' : '🚀 Concluir!'}
            </button>
          </div>

          <button
            onClick={() => router.push('/dashboard')}
            style={{ width: '100%', marginTop: 10, padding: '10px', border: 'none', background: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 13 }}
          >
            Pular e ir para o dashboard
          </button>
        </div>
      )}
    </main>
  );
}