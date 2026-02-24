'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/format';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Header from '@/app/components/Header';
import { useEncryptedInsert } from '@/lib/useEncryptedInsert';
import { applyBalanceDelta } from '@/lib/balance';
import { useFinanceGroup } from '@/lib/financeGroupContext';

type RecurrenceType = 'fixed' | 'variable';

const FIXED_EXAMPLES = ['Netflix', 'Spotify', 'Internet', 'Academia', 'Plano celular', 'iCloud', 'Disney+'];
const VARIABLE_EXAMPLES = ['Água', 'Luz', 'Energia', 'Gás', 'Condomínio'];

const emptyForm = {
  name: '',
  type: 'fixed' as RecurrenceType,
  amount: '',
  due_day: '1',
  // CORRIGIDO: split agora é configurável por recorrência (era hardcoded 'shared' em payNow)
  split: 'individual' as 'individual' | 'shared',
  category: '',
  notes: '',
  payment_method: 'pix' as string,
  credit_card_id: '',
  account_id: '',
};

export default function RecurrencesPage() {
  const [recurrences, setRecurrences] = useState<any[]>([]);
  const [creditCards, setCreditCards] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<RecurrenceType>('fixed');
  const [variableAmounts, setVariableAmounts] = useState<Record<string, string>>({});
  const router = useRouter();
  const { encryptRecord } = useEncryptedInsert();
  const { activeGroupId } = useFinanceGroup();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);
      const hid = activeGroupId;
      if (!hid) { router.push('/setup'); return; }
      setHouseholdId(hid);

      await Promise.all([
        loadRecurrences(hid),
        loadCards(hid),
        loadAccounts(hid),
      ]);
      setLoading(false);
    }
    init();
  }, [activeGroupId]);

  async function loadRecurrences(hid: string) {
    const { data } = await supabase
      .from('recurrence_rules')
      .select('*, credit_cards(name, closing_day)')
      .eq('household_id', hid)
      .eq('active', true)
      .order('due_day');
    setRecurrences(data || []);
  }

  async function loadCards(hid: string) {
    const { data } = await supabase.from('credit_cards').select('*').eq('household_id', hid).order('name');
    setCreditCards(data || []);
  }

  async function loadAccounts(hid: string) {
    const { data } = await supabase.from('accounts').select('*').eq('household_id', hid).order('name');
    setAccounts(data || []);
  }

  function calculateInvoiceMonth(date: string, closingDay: number): string {
    const d = new Date(date + 'T12:00:00');
    const day = d.getDate();
    if (day < closingDay) {
      return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    } else {
      return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split('T')[0];
    }
  }

  async function upsertInvoice(creditCardId: string, month: string, amount: number) {
    const { data: existing } = await supabase
      .from('invoices').select('*')
      .eq('credit_card_id', creditCardId)
      .eq('month', month)
      .maybeSingle();

    if (existing) {
      await supabase.from('invoices').update({ total: Number(existing.total) + amount }).eq('id', existing.id);
    } else {
      await supabase.from('invoices').insert({ credit_card_id: creditCardId, month, total: amount, status: 'open' });
    }
  }

  async function createSharesForHousehold(hid: string, payerId: string, txId: string, total: number) {
    const { data: members } = await supabase
      .from('household_members')
      .select('user_id')
      .eq('household_id', hid);
    const allMembers = (members || []).map((m: any) => m.user_id as string);
    if (!allMembers.length) return;

    const participants = allMembers;
    const count = participants.length;
    const base = Math.floor((total * 100) / count) / 100;
    let accumulated = 0;

    const rows = participants.map((uid, index) => {
      let amount = base;
      if (index === participants.length - 1) {
        amount = Number((total - accumulated).toFixed(2));
      }
      accumulated += amount;
      return {
        transaction_id: txId,
        user_id: uid,
        share_amount: amount,
        share_percent: Number((100 / count).toFixed(2)),
      };
    });

    await supabase.from('transaction_shares').insert(rows);

    for (const r of rows) {
      if (r.user_id === payerId) continue;
      await applyBalanceDelta(hid, payerId, r.user_id, r.share_amount);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!householdId || !userId) return;

    if (formData.payment_method === 'credit_card' && !formData.credit_card_id) {
      alert('⚠️ Selecione o cartão para esta recorrência.');
      return;
    }

    const today = new Date();
    const day = parseInt(formData.due_day);
    const nextDateBase = new Date(today.getFullYear(), today.getMonth(), day);
    if (nextDateBase <= today) nextDateBase.setMonth(nextDateBase.getMonth() + 1);
    const nextDate = nextDateBase.toISOString().split('T')[0];

    const base: any = {
      household_id: householdId,
      user_id: userId,
      name: formData.name.trim(),
      recurrence_type: formData.type,
      amount: formData.type === 'fixed' ? parseFloat(formData.amount) || 0 : null,
      due_day: day,
      // CORRIGIDO: split salvo corretamente na regra
      split: formData.split,
      category: formData.category.trim(),
      notes: formData.notes.trim(),
      payment_method: formData.payment_method,
      active: true,
      frequency: 'monthly',
      next_date: nextDate,
      credit_card_id: formData.payment_method === 'credit_card' ? formData.credit_card_id : null,
      account_id: formData.payment_method !== 'credit_card' && formData.account_id ? formData.account_id : null,
    };

    const payload = await encryptRecord(base);

    if (editingId) {
      await supabase.from('recurrence_rules').update(payload).eq('id', editingId);
    } else {
      await supabase.from('recurrence_rules').insert(payload);
    }

    resetForm();
    if (householdId) loadRecurrences(householdId);
  }

  async function payNow(r: any) {
    if (!householdId || !userId) return;
    const today = new Date().toISOString().split('T')[0];

    // CORRIGIDO: usa o split configurado na regra, não hardcoded 'shared'
    const txSplit = r.split ?? 'individual';

    const txBase = {
      household_id: householdId,
      user_id: userId,
      payer_id: userId,
      amount: r.amount,
      description: r.name,
      date: today,
      payment_method: r.payment_method,
      split: txSplit,
      is_recurring: true,
      account_id: r.account_id || null,
    };

    const txPayload = await encryptRecord(txBase);
    const { data: newTx, error } = await supabase
      .from('transactions')
      .insert(txPayload)
      .select()
      .single();

    if (error) { alert('Erro: ' + error.message); return; }

    if (r.payment_method === 'credit_card' && r.credit_card_id && r.credit_cards?.closing_day) {
      const invoiceMonth = calculateInvoiceMonth(today, r.credit_cards.closing_day);
      await upsertInvoice(r.credit_card_id, invoiceMonth, r.amount);
    }

    if (txSplit === 'shared' && newTx) {
      await createSharesForHousehold(householdId, userId, newTx.id, Number(r.amount));
    }

    alert(`✅ "${r.name}" marcado como pago!`);
    if (householdId) loadRecurrences(householdId);
  }

  async function saveVariableAmount(id: string) {
    const amount = parseFloat(variableAmounts[id]);
    if (!amount || isNaN(amount)) return;

    const rule = recurrences.find(r => r.id === id);
    const today = new Date().toISOString().split('T')[0];

    await supabase.from('recurrence_rules').update({
      last_variable_amount: amount,
      last_updated: today,
    }).eq('id', id);

    const txSplit = rule?.split ?? 'individual';

    const txBase = {
      household_id: householdId,
      user_id: userId,
      payer_id: userId,
      amount,
      description: rule?.name || 'Conta variável',
      date: today,
      payment_method: rule?.payment_method || 'debit',
      split: txSplit,
      is_recurring: true,
      account_id: rule?.account_id || null,
    };

    const txPayload = await encryptRecord(txBase);
    const { data: newTx } = await supabase
      .from('transactions')
      .insert(txPayload)
      .select()
      .single();

    if (rule?.payment_method === 'credit_card' && rule?.credit_card_id && rule?.credit_cards?.closing_day) {
      const invoiceMonth = calculateInvoiceMonth(today, rule.credit_cards.closing_day);
      await upsertInvoice(rule.credit_card_id, invoiceMonth, amount);
    }

    if (txSplit === 'shared' && householdId && userId && newTx) {
      await createSharesForHousehold(householdId, userId, newTx.id, amount);
    }

    setVariableAmounts(prev => ({ ...prev, [id]: '' }));
    if (householdId) loadRecurrences(householdId);
    alert('✅ Valor lançado com sucesso!');
  }

  async function deleteRecurrence(id: string, name: string) {
    if (!confirm(`Remover a recorrência "${name}"?`)) return;
    await supabase.from('recurrence_rules').delete().eq('id', id);
    if (householdId) loadRecurrences(householdId);
  }

  function startEdit(r: any) {
    setFormData({
      name: r.name || '',
      type: r.recurrence_type || 'fixed',
      amount: r.amount?.toString() || '',
      due_day: r.due_day?.toString() || '1',
      split: r.split || 'individual',
      category: r.category || '',
      notes: r.notes || '',
      payment_method: r.payment_method || 'pix',
      credit_card_id: r.credit_card_id || '',
      account_id: r.account_id || '',
    });
    setEditingId(r.id);
    setShowForm(true);
    setActiveTab(r.recurrence_type || 'fixed');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function resetForm() {
    setFormData(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function getDaysUntil(day: number) {
    const today = new Date();
    let target = new Date(today.getFullYear(), today.getMonth(), day);
    if (target <= today) target = new Date(today.getFullYear(), today.getMonth() + 1, day);
    const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 0) return '⚠️ Vence hoje';
    if (diff === 1) return '⚠️ Amanhã';
    if (diff <= 5) return `⚠️ Em ${diff} dias`;
    return `Em ${diff} dias`;
  }

  const fixed = recurrences.filter(r => r.recurrence_type === 'fixed');
  const variable = recurrences.filter(r => r.recurrence_type === 'variable');
  const totalFixed = fixed.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const totalCreditCard = fixed
    .filter(r => r.payment_method === 'credit_card')
    .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);

  const isCreditCard = formData.payment_method === 'credit_card';
  const selectedCard = creditCards.find(c => c.id === formData.credit_card_id);

  if (loading) return <main style={{ padding: 16, color: 'var(--text-muted)' }}>Carregando...</main>;

  return (
    <>
      <Header title="Recorrências" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 24 }}>
          <div style={{ backgroundColor: '#f0f4ff', borderRadius: 'var(--radius)', padding: 16, border: '1px solid #dde' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>📋 Total fixas</div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: 'var(--blue)' }}>{formatCurrency(totalFixed)}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fixed.length} ativas</div>
          </div>
          {totalCreditCard > 0 && (
            <div style={{ backgroundColor: '#faf0ff', borderRadius: 'var(--radius)', padding: 16, border: '1px solid #d7c5e9' }}>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>💳 Recorrentes no cartão</div>
              <div style={{ fontSize: 22, fontWeight: 'bold', color: 'var(--purple)' }}>{formatCurrency(totalCreditCard)}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>lança na fatura</div>
            </div>
          )}
          <div style={{ backgroundColor: '#f0fff4', borderRadius: 'var(--radius)', padding: 16, border: '1px solid #cec' }}>
            <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>📊 Variáveis</div>
            <div style={{ fontSize: 22, fontWeight: 'bold', color: 'var(--green)' }}>{variable.length} contas</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>para lançar todo mês</div>
          </div>
        </div>

        {/* Vencimentos urgentes */}
        {(() => {
          const urgent = recurrences.filter(r => {
            if (r.recurrence_type !== 'fixed') return false;
            const today = new Date();
            let target = new Date(today.getFullYear(), today.getMonth(), r.due_day);
            if (target <= today) target = new Date(today.getFullYear(), today.getMonth() + 1, r.due_day);
            return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)) <= 7;
          });
          if (urgent.length === 0) return null;
          return (
            <div style={{ backgroundColor: '#fff3cd', border: '2px solid #ffc107', borderRadius: 'var(--radius)', padding: 14, marginBottom: 20 }}>
              <div style={{ fontWeight: 'bold', marginBottom: 8 }}>⚠️ Vencimentos próximos</div>
              {urgent.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderTop: '1px solid #ffe69c' }}>
                  <span style={{ fontSize: 14 }}>
                    {r.payment_method === 'credit_card' ? '💳' : r.payment_method === 'boleto' ? '📄' : '⚡'}
                    {' '}<strong>{r.name}</strong>
                    {r.payment_method === 'credit_card' && r.credit_cards?.name && (
                      <span style={{ color: 'var(--purple)', fontSize: 13 }}> · {r.credit_cards.name}</span>
                    )}
                    {' '}<span style={{ color: 'var(--text3)', fontSize: 12 }}>
                      {r.split === 'shared' ? '· 👫 Compartilhado' : '· 👤 Individual'}
                    </span>
                    {' '}— vence dia {r.due_day}
                  </span>
                  <button onClick={() => payNow(r)}
                    style={{ padding: '4px 12px', backgroundColor: r.payment_method === 'credit_card' ? '#9b59b6' : '#2ecc71', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>
                    {r.payment_method === 'credit_card' ? '💳 Lançar' : '✅ Pagar'}
                  </button>
                </div>
              ))}
            </div>
          );
        })()}

        {!showForm && (
          <button onClick={() => { setShowForm(true); setFormData({ ...emptyForm, type: activeTab }); }}
            style={{ width: '100%', padding: '12px', marginBottom: 20, backgroundColor: 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius)', cursor: 'pointer', fontWeight: 'bold', fontSize: 15 }}>
            ➕ Nova recorrência
          </button>
        )}

        {showForm && (
          <div style={{ border: '2px solid #3498db', borderRadius: 'var(--radius)', padding: 20, marginBottom: 24, backgroundColor: '#f8fbff' }}>
            <h3 style={{ margin: '0 0 16px' }}>{editingId ? '✏️ Editar' : '➕ Nova'} recorrência</h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {(['fixed', 'variable'] as RecurrenceType[]).map(t => (
                <button key={t} type="button"
                  onClick={() => setFormData({ ...formData, type: t })}
                  style={{ padding: 12, border: formData.type === t ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: formData.type === t ? '#e8f4ff' : 'white', cursor: 'pointer', fontWeight: formData.type === t ? 'bold' : 'normal' }}>
                  {t === 'fixed' ? '📋 Fixa (assinatura)' : '📊 Variável (água, luz)'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Nome:</label>
                <input type="text" value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder={formData.type === 'fixed' ? 'Ex: Netflix, Spotify...' : 'Ex: Conta de luz, Água...'}
                  required style={{ width: '100%', padding: 10, fontSize: 15, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
                  {(formData.type === 'fixed' ? FIXED_EXAMPLES : VARIABLE_EXAMPLES).map(ex => (
                    <button key={ex} type="button" onClick={() => setFormData({ ...formData, name: ex })}
                      style={{ padding: '3px 8px', fontSize: 12, backgroundColor: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, cursor: 'pointer' }}>
                      {ex}
                    </button>
                  ))}
                </div>
              </div>

              {/* CORRIGIDO: campo de split configurável */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Divisão:</label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {(['individual', 'shared'] as const).map(s => (
                    <button key={s} type="button"
                      onClick={() => setFormData({ ...formData, split: s })}
                      style={{ padding: 10, border: formData.split === s ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: formData.split === s ? '#e8f4ff' : 'white', cursor: 'pointer', fontWeight: formData.split === s ? 'bold' : 'normal', fontSize: 14 }}>
                      {s === 'individual' ? '👤 Individual' : '👫 Compartilhado (50/50)'}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: formData.type === 'fixed' ? '1fr 1fr' : '1fr', gap: 12, marginBottom: 12 }}>
                {formData.type === 'fixed' && (
                  <div>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Valor (R$):</label>
                    <input type="number" value={formData.amount}
                      onChange={e => setFormData({ ...formData, amount: e.target.value })}
                      placeholder="0.00" step="0.01" min="0" required
                      style={{ width: '100%', padding: 10, fontSize: 15, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                  </div>
                )}
                <div>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Dia de vencimento:</label>
                  <select value={formData.due_day}
                    onChange={e => setFormData({ ...formData, due_day: e.target.value })}
                    style={{ width: '100%', padding: 10, fontSize: 15, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>Dia {d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Categoria (opcional):</label>
                <input type="text" value={formData.category}
                  onChange={e => setFormData({ ...formData, category: e.target.value })}
                  placeholder="Ex: Moradia, Lazer..."
                  style={{ width: '100%', padding: 10, fontSize: 15, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Forma de pagamento:</label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                  {([
                    ['pix', '⚡ PIX'],
                    ['boleto', '📄 Boleto'],
                    ['debit', '💳 Débito'],
                    ['credit_card', '💳 Cartão'],
                  ] as const).map(([val, label]) => (
                    <button key={val} type="button"
                      onClick={() => setFormData({ ...formData, payment_method: val, credit_card_id: '', account_id: '' })}
                      style={{ padding: 10, border: formData.payment_method === val ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: formData.payment_method === val ? '#e8f4ff' : 'white', cursor: 'pointer', fontWeight: formData.payment_method === val ? 'bold' : 'normal', fontSize: 12 }}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {isCreditCard && (
                <div style={{ marginBottom: 16, backgroundColor: '#f0f4ff', padding: 14, borderRadius: 'var(--radius-sm)', border: '1px solid #c5cae9' }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 8, color: '#5c35a0' }}>
                    💳 Qual cartão será cobrado?
                  </label>
                  {creditCards.length === 0 ? (
                    <p style={{ color: 'var(--red)', fontSize: 14, margin: 0 }}>
                      Nenhum cartão cadastrado. <a href="/credit-cards" style={{ color: 'var(--blue)' }}>Cadastrar →</a>
                    </p>
                  ) : (
                    <>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 8, marginBottom: 8 }}>
                        {creditCards.map(card => (
                          <button key={card.id} type="button"
                            onClick={() => setFormData({ ...formData, credit_card_id: card.id })}
                            style={{ padding: 10, border: formData.credit_card_id === card.id ? '2px solid #9b59b6' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: formData.credit_card_id === card.id ? '#f3e5f5' : 'white', cursor: 'pointer', textAlign: 'left', fontWeight: formData.credit_card_id === card.id ? 'bold' : 'normal' }}>
                            <div style={{ fontSize: 13 }}>💳 {card.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>Fecha dia {card.closing_day}</div>
                          </button>
                        ))}
                      </div>
                      {selectedCard && (
                        <div style={{ backgroundColor: '#fff3cd', padding: 8, borderRadius: 'var(--radius-sm)', fontSize: 12 }}>
                          📄 Cobranças do dia {formData.due_day} cairão na fatura de{' '}
                          <strong>
                            {(() => {
                              const today = new Date();
                              const d = new Date(today.getFullYear(), today.getMonth(), parseInt(formData.due_day));
                              const month = calculateInvoiceMonth(d.toISOString().split('T')[0], selectedCard.closing_day);
                              return new Date(month + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
                            })()}
                          </strong>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {!isCreditCard && accounts.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>🏦 Conta a debitar (opcional):</label>
                  <select value={formData.account_id}
                    onChange={e => setFormData({ ...formData, account_id: e.target.value })}
                    style={{ width: '100%', padding: 10, fontSize: 15, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                    <option value="">Nenhuma</option>
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
                  </select>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit"
                  style={{ padding: '10px 20px', backgroundColor: 'var(--green)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 'bold' }}>
                  {editingId ? '💾 Salvar' : '➕ Criar'}
                </button>
                <button type="button" onClick={resetForm}
                  style={{ padding: '10px 20px', backgroundColor: 'var(--text-muted)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 20, overflow: 'hidden' }}>
          {(['fixed', 'variable'] as RecurrenceType[]).map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ padding: '12px', border: 'none', cursor: 'pointer', fontWeight: activeTab === t ? 'bold' : 'normal', backgroundColor: activeTab === t ? '#3498db' : 'white', color: activeTab === t ? 'white' : '#333' }}>
              {t === 'fixed' ? `📋 Assinaturas (${fixed.length})` : `📊 Variáveis (${variable.length})`}
            </button>
          ))}
        </div>

        {activeTab === 'fixed' && (
          <>
            {fixed.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <p>Nenhuma assinatura cadastrada ainda.</p>
              </div>
            ) : fixed.map(r => {
              const urgency = getDaysUntil(r.due_day);
              const isUrgent = urgency.startsWith('⚠️');
              const isCc = r.payment_method === 'credit_card';
              return (
                <div key={r.id} style={{
                  border: isUrgent ? '2px solid #f39c12' : isCc ? '1px solid #c5cae9' : '1px solid #ddd',
                  borderRadius: 'var(--radius)', padding: 16, marginBottom: 10,
                  backgroundColor: isUrgent ? '#fffdf0' : isCc ? '#fafcff' : 'white',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 4 }}>{r.name}</div>
                    <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                      {r.category && <span>{r.category} · </span>}
                      Todo dia {r.due_day} · {urgency}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {r.split === 'shared' ? '👫 Compartilhado' : '👤 Individual'}
                    </div>
                    {isCc && r.credit_cards?.name && (
                      <div style={{ fontSize: 12, color: 'var(--purple)', marginTop: 3 }}>💳 {r.credit_cards.name}</div>
                    )}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 'bold', fontSize: 18, color: 'var(--red)', marginBottom: 6 }}>
                      R$ {Number(r.amount).toFixed(2)}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {isUrgent && (
                        <button onClick={() => payNow(r)}
                          style={{ padding: '5px 10px', backgroundColor: isCc ? '#9b59b6' : '#2ecc71', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}>
                          {isCc ? '💳 Lançar' : '✅ Pagar'}
                        </button>
                      )}
                      <button onClick={() => startEdit(r)} style={{ padding: '5px 10px', backgroundColor: 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                      <button onClick={() => deleteRecurrence(r.id, r.name)} style={{ padding: '5px 10px', backgroundColor: 'var(--red)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}

        {activeTab === 'variable' && (
          <>
            {variable.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
                <p>Nenhuma conta variável cadastrada ainda.</p>
              </div>
            ) : variable.map(r => {
              const urgency = getDaysUntil(r.due_day);
              const isUrgent = urgency.startsWith('⚠️');
              const isCc = r.payment_method === 'credit_card';
              return (
                <div key={r.id} style={{ border: isUrgent ? '2px solid #f39c12' : '1px solid #ddd', borderRadius: 'var(--radius)', padding: 16, marginBottom: 10, backgroundColor: isUrgent ? '#fffdf0' : 'white' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 4 }}>{r.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                        {r.category && <span>{r.category} · </span>}
                        Todo dia {r.due_day} · {urgency}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                        {r.split === 'shared' ? '👫 Compartilhado' : '👤 Individual'}
                      </div>
                      {isCc && r.credit_cards?.name && (
                        <div style={{ fontSize: 12, color: 'var(--purple)', marginTop: 3 }}>💳 {r.credit_cards.name}</div>
                      )}
                      {r.last_variable_amount && (
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                          Último: R$ {Number(r.last_variable_amount).toFixed(2)}
                          {r.last_updated ? ` em ${new Date(r.last_updated + 'T12:00:00').toLocaleDateString('pt-BR')}` : ''}
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => startEdit(r)} style={{ padding: '5px 10px', backgroundColor: 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12 }}>✏️</button>
                      <button onClick={() => deleteRecurrence(r.id, r.name)} style={{ padding: '5px 10px', backgroundColor: 'var(--red)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 12 }}>🗑️</button>
                    </div>
                  </div>

                  <div style={{ backgroundColor: 'var(--bg2)', borderRadius: 'var(--radius-sm)', padding: 12, border: '1px solid var(--border2)' }}>
                    <label style={{ fontSize: 13, fontWeight: 'bold', display: 'block', marginBottom: 8 }}>
                      {isCc ? '💳 Lançar valor na fatura:' : '💸 Lançar valor deste mês:'}
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input type="number"
                        placeholder={r.last_variable_amount ? `Último: {ormatCurrency(Number(r.last_variable_amount))}` : 'R$ 0.00'}
                        value={variableAmounts[r.id] || ''}
                        onChange={e => setVariableAmounts(prev => ({ ...prev, [r.id]: e.target.value }))}
                        step="0.01" min="0"
                        style={{ flex: 1, padding: 10, fontSize: 15, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                      <button onClick={() => saveVariableAmount(r.id)}
                        style={{ padding: '10px 16px', backgroundColor: isCc ? '#9b59b6' : '#2ecc71', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                        {isCc ? '💳 Lançar' : '✅ Lançar'}
                      </button>
                    </div>
                    {isCc && r.credit_cards?.name && (
                      <div style={{ fontSize: 12, color: 'var(--purple)', marginTop: 6 }}>
                        Será lançado na fatura do {r.credit_cards.name}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </main>
    </>
  );
}