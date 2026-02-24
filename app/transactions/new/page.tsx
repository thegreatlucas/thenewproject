'use client';

import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';
import { useEncryptedInsert } from '@/lib/useEncryptedInsert';
import { applyBalanceDelta } from '@/lib/balance';
import { useFinanceGroup } from '@/lib/financeGroupContext';
import { formatCurrency } from '@/lib/format';
import type { TransactionShare } from '@/lib/types/finance';

// ── Helpers de UI ────────────────────────────────────────────────────────────

function OptionBtn({ active, onClick, children, accent = 'var(--blue)' }: {
  active: boolean; onClick: () => void; children: React.ReactNode; accent?: string;
}) {
  return (
    <button type="button" onClick={onClick} style={{
      padding: '12px 10px', cursor: 'pointer', textAlign: 'center',
      border: active ? `2px solid ${accent}` : '1px solid var(--border)',
      borderRadius: 'var(--radius)', fontSize: 13, fontWeight: active ? 700 : 400,
      backgroundColor: active ? accent + '18' : 'var(--surface)',
      color: active ? accent : 'var(--text2)',
      transition: 'all 0.15s ease',
    }}>
      {children}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', margin: '0 0 10px', fontFamily: 'var(--font-display)' }}>
      {children}
    </p>
  );
}

function Section({ children, style = {} }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ marginBottom: 24, ...style }}>{children}</div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export default function NewTransaction() {
  const [user, setUser] = useState<any>(null);
  const [categories, setCategories] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [creditCards, setCreditCards] = useState<any[]>([]);
  const [selectedHousehold, setSelectedHousehold] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [creditCardId, setCreditCardId] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [splitType, setSplitType] = useState('individual');
  const [isRecurring, setIsRecurring] = useState(false);
  const [isSubscription, setIsSubscription] = useState(false);
  const [recurringFrequency, setRecurringFrequency] = useState('monthly');
  const [recurringDayOfMonth, setRecurringDayOfMonth] = useState('');
  const [invoiceMonth, setInvoiceMonth] = useState('');
  const [creditPaymentType, setCreditPaymentType] = useState<'avista' | 'parcelado'>('avista');
  const [installments, setInstallments] = useState('2');
  const [hasInterest, setHasInterest] = useState(false);
  const [installmentValue, setInstallmentValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [groupMembers, setGroupMembers] = useState<{ id: string; name: string }[]>([]);
  const [shares, setShares] = useState<Record<string, { enabled: boolean }>>({});

  const router = useRouter();
  const { encryptRecord } = useEncryptedInsert();
  const { activeGroupId } = useFinanceGroup();

  useEffect(() => {
    async function loadData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUser(user);
      const householdId = activeGroupId;
      if (!householdId) { router.push('/setup'); return; }
      setSelectedHousehold(householdId);
      await Promise.all([loadHouseholdData(householdId), loadGroupMembers(householdId, user.id)]);
    }
    loadData();
  }, [router, activeGroupId]);

  useEffect(() => {
    if (paymentMethod !== 'credit' || !creditCardId || !date) return;
    const card = creditCards.find(c => c.id === creditCardId);
    if (!card) return;
    setInvoiceMonth(calculateInvoiceMonth(date, card.closing_day));
  }, [date, creditCardId, creditCards, paymentMethod]);

  async function loadHouseholdData(householdId: string) {
    const [catRes, accRes, cardRes] = await Promise.all([
      supabase.from('categories').select('*').eq('household_id', householdId).order('name').order('parent_id', { nullsFirst: true }),
      supabase.from('accounts').select('*').eq('household_id', householdId).order('name'),
      supabase.from('credit_cards').select('*').eq('household_id', householdId).order('name'),
    ]);
    setCategories(catRes.data || []);
    setAccounts(accRes.data || []);
    setCreditCards(cardRes.data || []);
    setAccountId(accRes.data?.[0]?.id || '');
    setCreditCardId(cardRes.data?.[0]?.id || '');
    setCategoryId('');
  }

  async function loadGroupMembers(householdId: string, currentUserId: string) {
    const { data } = await supabase.from('household_members').select('user_id, profiles(name)').eq('household_id', householdId);
    const mapped = (data || []).map((row: any) => ({ id: row.user_id as string, name: row.profiles?.name || (row.user_id === currentUserId ? 'Você' : 'Membro') }));
    setGroupMembers(mapped);
    const initialShares: Record<string, { enabled: boolean }> = {};
    for (const m of mapped) initialShares[m.id] = { enabled: true };
    setShares(initialShares);
  }

  function calculateInvoiceMonth(purchaseDate: string, closingDay: number): string {
    const d = new Date(purchaseDate + 'T12:00:00');
    if (d.getDate() < closingDay) return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
    return new Date(d.getFullYear(), d.getMonth() + 1, 1).toISOString().split('T')[0];
  }

  function getInvoiceMonthLabel(isoMonth: string) {
    if (!isoMonth) return '';
    return new Date(isoMonth + 'T12:00:00').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  }

  const originalAmount = parseFloat(amount || '0');
  const numInstallments = parseInt(installments || '1');
  const instValue = parseFloat(installmentValue || '0');
  const isParcelado = paymentMethod === 'credit' && creditPaymentType === 'parcelado';
  const totalWithInterest = hasInterest && instValue > 0 ? instValue * numInstallments : 0;
  const interestAmount = totalWithInterest > 0 ? totalWithInterest - originalAmount : 0;
  const interestPercent = originalAmount > 0 && interestAmount > 0 ? ((interestAmount / originalAmount) * 100).toFixed(1) : '0';
  const finalAmount = isParcelado && hasInterest && totalWithInterest > 0 ? totalWithInterest : originalAmount;
  const enabledSharedMembers = splitType === 'shared' && groupMembers.length ? groupMembers.filter(m => shares[m.id]?.enabled !== false) : [];
  const sharedParticipantsCount = enabledSharedMembers.length || 1;

  function clearForm() {
    setAmount(''); setDescription(''); setCategoryId('');
    setDate(new Date().toISOString().split('T')[0]);
    setSplitType('individual'); setPaymentMethod('cash');
    setIsRecurring(false); setIsSubscription(false);
    setRecurringFrequency('monthly'); setRecurringDayOfMonth('');
    setCreditCardId(creditCards[0]?.id || ''); setInvoiceMonth('');
    setCreditPaymentType('avista'); setInstallments('2');
    setHasInterest(false); setInstallmentValue('');
  }

  function buildSharesForTransaction(total: number, payerId: string, txId: string): TransactionShare[] {
    if (splitType !== 'shared' || !groupMembers.length) return [{ transactionId: txId, userId: payerId, shareAmount: total, sharePercent: 100 }];
    const participants = enabledSharedMembers.length ? enabledSharedMembers : groupMembers;
    const count = participants.length || 1;
    const base = Math.floor((total * 100) / count) / 100;
    const sharesResult: TransactionShare[] = [];
    let accumulated = 0;
    participants.forEach((m, index) => {
      let amt = base;
      if (index === participants.length - 1) amt = Number((total - accumulated).toFixed(2));
      accumulated += amt;
      sharesResult.push({ transactionId: txId, userId: m.id, shareAmount: amt, sharePercent: Number((100 / count).toFixed(2)) });
    });
    return sharesResult;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedHousehold) { alert('⚠️ Grupo não encontrado'); return; }
    if (!amount || parseFloat(amount) <= 0) { alert('⚠️ Digite um valor válido'); return; }
    if (!description.trim()) { alert('⚠️ Digite uma descrição'); return; }
    if (paymentMethod !== 'credit' && !accountId) { alert('⚠️ Selecione uma conta'); return; }
    if (paymentMethod === 'credit' && !creditCardId) { alert('⚠️ Selecione um cartão'); return; }
    setLoading(true);

    const txBase: any = {
      household_id: selectedHousehold, account_id: paymentMethod !== 'credit' ? accountId : null,
      user_id: user.id, payer_id: user.id, category_id: categoryId || null,
      amount: finalAmount, original_amount: originalAmount,
      description: description.trim(), date, payment_method: paymentMethod,
      split: splitType, is_recurring: isRecurring || isSubscription, is_subscription: isSubscription,
      credit_card_id: paymentMethod === 'credit' ? creditCardId : null,
      invoice_month: paymentMethod === 'credit' ? invoiceMonth : null,
    };

    if (isParcelado) {
      txBase.installments_count = numInstallments;
      txBase.installment_value = hasInterest && instValue > 0 ? instValue : originalAmount / numInstallments;
      if (hasInterest && totalWithInterest > 0) txBase.total_with_interest = totalWithInterest;
    }

    const txPayload = await encryptRecord(txBase);
    const { data: newTx, error: transError } = await supabase.from('transactions').insert(txPayload).select().single();
    if (transError) { alert('❌ Erro ao salvar: ' + transError.message); setLoading(false); return; }
    if (!newTx) { setLoading(false); return; }

    const sharesForTx = buildSharesForTransaction(finalAmount, user.id, newTx.id);
    if (sharesForTx.length) {
      await supabase.from('transaction_shares').insert(sharesForTx.map(s => ({ transaction_id: s.transactionId, user_id: s.userId, share_amount: s.shareAmount, share_percent: s.sharePercent })));
    }

    if (paymentMethod === 'credit' && creditCardId && invoiceMonth) {
      const { data: existingInvoice } = await supabase.from('invoices').select('*').eq('credit_card_id', creditCardId).eq('month', invoiceMonth).maybeSingle();
      if (existingInvoice) {
        await supabase.from('invoices').update({ total: Number(existingInvoice.total) + finalAmount }).eq('id', existingInvoice.id);
      } else {
        await supabase.from('invoices').insert({ credit_card_id: creditCardId, month: invoiceMonth, total: finalAmount, status: 'open' });
      }
    }

    if (splitType === 'shared') {
      for (const share of sharesForTx) {
        if (share.userId === user.id) continue;
        await applyBalanceDelta(selectedHousehold, user.id, share.userId, share.shareAmount);
      }
    }

    if ((isRecurring || isSubscription) && newTx) {
      const selectedDate = new Date(date + 'T12:00:00');
      const dayOfMonth = recurringDayOfMonth ? parseInt(recurringDayOfMonth) : selectedDate.getDate();
      const nextDate = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, dayOfMonth);
      await supabase.from('recurrence_rules').insert({ household_id: selectedHousehold, base_transaction_id: newTx.id, frequency: recurringFrequency, day_of_month: dayOfMonth, next_date: nextDate.toISOString().split('T')[0], active: true, split: splitType });
    }

    router.push('/transactions');
  }

  const selectedCard = creditCards.find(c => c.id === creditCardId);
  const roots = categories.filter((c: any) => !c.parent_id);
  const subs  = categories.filter((c: any) => c.parent_id);

  const PAYMENT_METHODS = [
    { value: 'cash',         label: '💵', name: 'Dinheiro' },
    { value: 'pix',          label: '🔷', name: 'PIX' },
    { value: 'debit',        label: '💳', name: 'Débito' },
    { value: 'credit',       label: '💳', name: 'Crédito' },
    { value: 'transfer',     label: '🏦', name: 'Transf.' },
    { value: 'meal_voucher', label: '🍽️', name: 'Vale Ref.' },
  ];

  return (
    <>
      <Header title="💸 Novo Gasto" backHref="/transactions" />
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '20px 16px 120px' }}>

        <form onSubmit={handleSubmit}>

          {/* ── Valor ──────────────────────────────────────────────────── */}
          <Section>
            <div style={{
              background: 'linear-gradient(135deg, var(--red), #ff8c69)',
              borderRadius: 'var(--radius-lg)', padding: '28px 24px', textAlign: 'center',
              boxShadow: '0 8px 32px rgba(255,92,124,0.25)',
            }}>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', marginBottom: 8, fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase' }}>
                Quanto custou?
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                <span style={{ fontSize: 22, color: 'rgba(255,255,255,0.8)', fontWeight: 700 }}>R$</span>
                <input
                  type="number" value={amount}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="0,00" step="0.01" min="0.01"
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    fontSize: 42, fontWeight: 800, color: 'white', width: '180px',
                    textAlign: 'center', fontFamily: 'var(--font-display)',
                    caretColor: 'white',
                  }}
                  required
                />
              </div>
              {amount && (
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
                  {formatCurrency(originalAmount)}
                </div>
              )}
            </div>
          </Section>

          {/* ── Descrição ──────────────────────────────────────────────── */}
          <Section>
            <SectionLabel>Descrição</SectionLabel>
            <input
              type="text" value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Compras no mercado"
              style={{
                width: '100%', padding: '14px 16px', fontSize: 15,
                border: '1px solid var(--border)', borderRadius: 'var(--radius)',
                backgroundColor: 'var(--surface)', color: 'var(--text)',
                outline: 'none', boxSizing: 'border-box',
              }}
              required
            />
          </Section>

          {/* ── Método de pagamento ─────────────────────────────────────── */}
          <Section>
            <SectionLabel>Pagamento</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {PAYMENT_METHODS.map(m => (
                <OptionBtn key={m.value} active={paymentMethod === m.value} onClick={() => setPaymentMethod(m.value)} accent="var(--blue)">
                  <div style={{ fontSize: 20, marginBottom: 3 }}>{m.label}</div>
                  <div style={{ fontSize: 11 }}>{m.name}</div>
                </OptionBtn>
              ))}
            </div>
          </Section>

          {/* ── Cartão de crédito ───────────────────────────────────────── */}
          {paymentMethod === 'credit' && (
            <Section>
              <SectionLabel>Cartão</SectionLabel>
              {creditCards.length === 0 ? (
                <div style={{ padding: '16px', borderRadius: 'var(--radius)', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>
                  Nenhum cartão. <Link href="/credit-cards" style={{ color: 'var(--blue)' }}>Cadastrar →</Link>
                </div>
              ) : (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, marginBottom: 12 }}>
                    {creditCards.map(card => (
                      <OptionBtn key={card.id} active={creditCardId === card.id} onClick={() => setCreditCardId(card.id)} accent="var(--purple)">
                        <div style={{ fontWeight: 700, fontSize: 13 }}>💳 {card.name}</div>
                        <div style={{ fontSize: 10, opacity: 0.7, marginTop: 2 }}>Fecha dia {card.closing_day}</div>
                      </OptionBtn>
                    ))}
                  </div>

                  {selectedCard && invoiceMonth && (
                    <div style={{ backgroundColor: 'rgba(108,99,255,0.08)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--purple)', border: '1px solid rgba(108,99,255,0.2)' }}>
                      📄 Fatura de <strong style={{ textTransform: 'capitalize' }}>{getInvoiceMonthLabel(invoiceMonth)}</strong>
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 }}>
                    <OptionBtn active={creditPaymentType === 'avista'} onClick={() => { setCreditPaymentType('avista'); setHasInterest(false); setInstallmentValue(''); }} accent="var(--green)">
                      💳 À vista
                    </OptionBtn>
                    <OptionBtn active={creditPaymentType === 'parcelado'} onClick={() => setCreditPaymentType('parcelado')} accent="var(--orange)">
                      📊 Parcelado
                    </OptionBtn>
                  </div>

                  {creditPaymentType === 'parcelado' && (
                    <div style={{ marginTop: 12, padding: 16, backgroundColor: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                        <div>
                          <SectionLabel>Parcelas</SectionLabel>
                          <select value={installments} onChange={e => { setInstallments(e.target.value); setInstallmentValue(''); }}
                            style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}>
                            {[2,3,4,5,6,7,8,9,10,11,12,18,24].map(n => <option key={n} value={n}>{n}x</option>)}
                          </select>
                        </div>
                        <div>
                          <SectionLabel>Juros</SectionLabel>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            <OptionBtn active={!hasInterest} onClick={() => { setHasInterest(false); setInstallmentValue(''); }} accent="var(--green)">✅ Não</OptionBtn>
                            <OptionBtn active={hasInterest} onClick={() => setHasInterest(true)} accent="var(--red)">📈 Sim</OptionBtn>
                          </div>
                        </div>
                      </div>

                      {!hasInterest && amount && (
                        <div style={{ backgroundColor: 'rgba(0,200,150,0.1)', padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: 14, textAlign: 'center', color: 'var(--green)', fontWeight: 700 }}>
                          {installments}x de {formatCurrency(originalAmount / numInstallments)} sem juros
                        </div>
                      )}

                      {hasInterest && (
                        <div>
                          <SectionLabel>Valor de cada parcela com juros</SectionLabel>
                          <input type="number" value={installmentValue} onChange={e => setInstallmentValue(e.target.value)}
                            placeholder="Ex: 85.90" step="0.01" min="0"
                            style={{ width: '100%', padding: 10, fontSize: 16, borderRadius: 'var(--radius-sm)', border: '2px solid var(--red)', backgroundColor: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
                          />
                          {installmentValue && amount && (
                            <div style={{ marginTop: 10, padding: 14, backgroundColor: 'rgba(255,92,124,0.08)', borderRadius: 'var(--radius-sm)', border: '1px solid rgba(255,92,124,0.2)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, textAlign: 'center' }}>
                                {[
                                  { label: 'Original', value: formatCurrency(originalAmount), color: 'var(--text)' },
                                  { label: 'Com juros', value: formatCurrency(totalWithInterest), color: 'var(--red)' },
                                  { label: `+${interestPercent}%`, value: formatCurrency(interestAmount), color: '#c0392b' },
                                ].map(item => (
                                  <div key={item.label}>
                                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 3 }}>{item.label}</div>
                                    <div style={{ fontWeight: 700, fontSize: 13, color: item.color }}>{item.value}</div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </Section>
          )}

          {/* ── Conta (débito/dinheiro) ─────────────────────────────────── */}
          {paymentMethod !== 'credit' && (
            <Section>
              <SectionLabel>Conta</SectionLabel>
              {accounts.length === 0 ? (
                <div style={{ padding: '16px', borderRadius: 'var(--radius)', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>
                  Nenhuma conta. <Link href="/accounts" style={{ color: 'var(--blue)' }}>Criar →</Link>
                </div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
                  {accounts.map(acc => (
                    <OptionBtn key={acc.id} active={accountId === acc.id} onClick={() => setAccountId(acc.id)} accent="var(--blue)">
                      <div style={{ fontSize: 13, fontWeight: 700 }}>🏦 {acc.name}</div>
                    </OptionBtn>
                  ))}
                </div>
              )}
            </Section>
          )}

          {/* ── Categoria ───────────────────────────────────────────────── */}
          <Section>
            <SectionLabel>Categoria</SectionLabel>
            {categories.length === 0 ? (
              <div style={{ padding: '16px', borderRadius: 'var(--radius)', border: '1px dashed var(--border)', color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>
                Sem categorias. <Link href="/categories" style={{ color: 'var(--blue)' }}>Criar →</Link>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {roots.map((cat: any) => {
                  const children = subs.filter((s: any) => s.parent_id === cat.id);
                  const isSelected = categoryId === cat.id;
                  return (
                    <div key={cat.id}>
                      <button type="button" onClick={() => setCategoryId(isSelected ? '' : cat.id)} style={{
                        width: '100%', padding: '10px 14px', cursor: 'pointer', textAlign: 'left',
                        border: isSelected ? `2px solid ${cat.color || 'var(--blue)'}` : '1px solid var(--border)',
                        borderRadius: 'var(--radius)', backgroundColor: isSelected ? (cat.color || 'var(--blue)') + '18' : 'var(--surface)',
                        color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 10, fontSize: 14,
                        fontWeight: isSelected ? 700 : 400, transition: 'all 0.15s ease',
                      }}>
                        <span style={{ fontSize: 22 }}>{cat.icon || '📁'}</span>
                        <span style={{ flex: 1 }}>{cat.name}</span>
                        {isSelected && <span style={{ color: cat.color || 'var(--blue)', fontSize: 16 }}>✓</span>}
                        {children.length > 0 && !isSelected && <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{children.length} sub</span>}
                      </button>
                      {children.length > 0 && (
                        <div style={{ marginLeft: 16, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {children.map((sub: any) => {
                            const isSubSel = categoryId === sub.id;
                            return (
                              <button key={sub.id} type="button" onClick={() => setCategoryId(isSubSel ? '' : sub.id)} style={{
                                padding: '8px 12px', cursor: 'pointer', textAlign: 'left',
                                border: isSubSel ? `2px solid ${sub.color || cat.color || 'var(--blue)'}` : '1px solid var(--border2)',
                                borderLeft: `3px solid ${cat.color || 'var(--blue)'}`,
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: isSubSel ? (sub.color || cat.color || 'var(--blue)') + '18' : 'var(--bg2)',
                                color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                                fontWeight: isSubSel ? 600 : 400,
                              }}>
                                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>↳</span>
                                <span style={{ fontSize: 17 }}>{sub.icon || cat.icon || '📁'}</span>
                                <span>{sub.name}</span>
                                {isSubSel && <span style={{ marginLeft: 'auto', color: sub.color || cat.color || 'var(--blue)' }}>✓</span>}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ── Data ────────────────────────────────────────────────────── */}
          <Section>
            <SectionLabel>Data</SectionLabel>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ width: '100%', padding: '12px 16px', fontSize: 15, border: '1px solid var(--border)', borderRadius: 'var(--radius)', backgroundColor: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
              required
            />
          </Section>

          {/* ── Divisão ─────────────────────────────────────────────────── */}
          <Section>
            <SectionLabel>Divisão</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
              <OptionBtn active={splitType === 'individual'} onClick={() => setSplitType('individual')} accent="var(--blue)">
                <div style={{ fontSize: 20, marginBottom: 4 }}>👤</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Individual</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Só para você</div>
              </OptionBtn>
              <OptionBtn active={splitType === 'shared'} onClick={() => setSplitType('shared')} accent="var(--purple)">
                <div style={{ fontSize: 20, marginBottom: 4 }}>👥</div>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Compartilhado</div>
                <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>Entre o grupo</div>
              </OptionBtn>
            </div>

            {splitType === 'shared' && groupMembers.length > 0 && (
              <div style={{ padding: 14, borderRadius: 'var(--radius)', border: '1px dashed var(--border)', backgroundColor: 'var(--bg2)', marginBottom: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>Quem participa?</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {groupMembers.map(m => {
                    const enabled = shares[m.id]?.enabled !== false;
                    return (
                      <button key={m.id} type="button"
                        onClick={() => setShares(prev => ({ ...prev, [m.id]: { enabled: !enabled } }))}
                        style={{ padding: '6px 12px', borderRadius: 20, border: enabled ? '2px solid var(--purple)' : '1px solid var(--border)', backgroundColor: enabled ? 'rgba(182,99,255,0.1)' : 'var(--surface)', fontSize: 13, cursor: 'pointer', color: enabled ? 'var(--purple)' : 'var(--text-muted)', fontWeight: enabled ? 700 : 400 }}>
                        {enabled ? '✓ ' : ''}{m.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {splitType === 'shared' && amount && (
              <div style={{ padding: '10px 14px', backgroundColor: 'rgba(182,99,255,0.08)', borderRadius: 'var(--radius-sm)', fontSize: 14, textAlign: 'center', color: 'var(--purple)', fontWeight: 700 }}>
                Cada um paga ≈ {formatCurrency(finalAmount / sharedParticipantsCount)}
              </div>
            )}
          </Section>

          {/* ── Recorrência ─────────────────────────────────────────────── */}
          {!isParcelado && (
            <Section>
              <SectionLabel>Recorrência</SectionLabel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                <OptionBtn active={isRecurring} onClick={() => { setIsRecurring(!isRecurring); if (isSubscription) setIsSubscription(false); }} accent="var(--purple)">
                  <div style={{ fontSize: 18, marginBottom: 3 }}>🔁</div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>Recorrente</div>
                  <div style={{ fontSize: 10, opacity: 0.7 }}>Aluguel, fixo...</div>
                </OptionBtn>
                <OptionBtn active={isSubscription} onClick={() => { setIsSubscription(!isSubscription); if (isRecurring) setIsRecurring(false); }} accent="var(--purple)">
                  <div style={{ fontSize: 18, marginBottom: 3 }}>📺</div>
                  <div style={{ fontWeight: 700, fontSize: 12 }}>Assinatura</div>
                  <div style={{ fontSize: 10, opacity: 0.7 }}>Netflix, Spotify...</div>
                </OptionBtn>
              </div>
              {(isRecurring || isSubscription) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, padding: 14, backgroundColor: 'var(--bg2)', borderRadius: 'var(--radius)', border: '1px solid var(--border)' }}>
                  <div>
                    <SectionLabel>Frequência</SectionLabel>
                    <select value={recurringFrequency} onChange={e => setRecurringFrequency(e.target.value)}
                      style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)' }}>
                      <option value="monthly">Mensal</option>
                      <option value="weekly">Semanal</option>
                    </select>
                  </div>
                  {recurringFrequency === 'monthly' && (
                    <div>
                      <SectionLabel>Todo dia</SectionLabel>
                      <input type="number" value={recurringDayOfMonth} onChange={e => setRecurringDayOfMonth(e.target.value)}
                        placeholder={`${new Date(date + 'T12:00:00').getDate()}`} min="1" max="31"
                        style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', color: 'var(--text)', boxSizing: 'border-box' }}
                      />
                    </div>
                  )}
                </div>
              )}
            </Section>
          )}

          {/* ── Resumo + Submit ──────────────────────────────────────────── */}
          {amount && description && (
            <div className="card" style={{ padding: '16px 20px', marginBottom: 16, borderColor: 'var(--green)', backgroundColor: 'rgba(0,200,150,0.06)' }}>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>Resumo</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
                <span>{description}</span>
                <span style={{ fontWeight: 700, color: 'var(--red)' }}>{formatCurrency(finalAmount)}</span>
              </div>
              {isParcelado && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {numInstallments}x de {formatCurrency(hasInterest && instValue > 0 ? instValue : originalAmount / numInstallments)}
                  {hasInterest && totalWithInterest > 0 && ` · total ${formatCurrency(totalWithInterest)}`}
                </div>
              )}
              {splitType === 'shared' && <div style={{ fontSize: 12, color: 'var(--purple)', marginTop: 2 }}>👥 Compartilhado · {formatCurrency(finalAmount / sharedParticipantsCount)} cada</div>}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button type="submit" disabled={loading} style={{
              flex: 1, padding: '16px', fontSize: 16, fontWeight: 700,
              backgroundColor: loading ? 'var(--text-muted)' : 'var(--green)',
              color: 'white', border: 'none', borderRadius: 'var(--radius)',
              cursor: loading ? 'not-allowed' : 'pointer', fontFamily: 'var(--font-display)',
              boxShadow: loading ? 'none' : '0 4px 16px rgba(0,200,150,0.3)',
            }}>
              {loading ? '⏳ Salvando...' : '✅ Salvar Gasto'}
            </button>
            <button type="button" onClick={clearForm} style={{
              padding: '16px 20px', fontSize: 16, backgroundColor: 'var(--bg3)',
              color: 'var(--text-muted)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius)', cursor: 'pointer',
            }}>
              🗑️
            </button>
          </div>

        </form>
      </main>
    </>
  );
}