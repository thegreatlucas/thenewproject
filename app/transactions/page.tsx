'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/format';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';
import { applyBalanceDelta } from '@/lib/balance';
import { useFinanceGroup } from '@/lib/financeGroupContext';

export default function TransactionsPage() {
  const [user, setUser] = useState<any>(null);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterPeriod, setFilterPeriod] = useState('month');
  const [filterCategory, setFilterCategory] = useState('all');
  const [editingTx, setEditingTx] = useState<any | null>(null);
  const [editForm, setEditForm] = useState({ description: '', amount: '', date: '', category_id: '', split: '' });
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const { activeGroupId } = useFinanceGroup();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
      if (!user) { router.push('/login'); return; }

      const hid = activeGroupId;
      if (!hid) { router.push('/setup'); return; }

      setHouseholdId(hid);
      const { data: cats } = await supabase.from('categories').select('*').eq('household_id', hid).order('name');
      setCategories(cats || []);
      setLoading(false);
    }
    init();
  }, [router, activeGroupId]);

  useEffect(() => { if (householdId) loadTransactions(); }, [householdId, filterPeriod, filterCategory]);

  async function loadTransactions() {
    if (!householdId) return;
    let query = supabase
      .from('transactions')
      .select('*, categories(name, icon, color), accounts(name), transaction_shares(user_id, share_amount)')
      .eq('household_id', householdId)
      .order('date', { ascending: false });
    if (filterPeriod === 'month') {
      const now = new Date();
      query = query.gte('date', new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]);
    } else if (filterPeriod === 'week') {
      query = query.gte('date', new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]);
    }
    if (filterCategory !== 'all') query = query.eq('category_id', filterCategory);
    const { data } = await query.limit(100);
    setTransactions(data || []);
  }

  function openEdit(tx: any) {
    setEditingTx(tx);
    setEditForm({
      description: tx.description || '',
      amount: tx.installment_value ? String(tx.installment_value) : String(tx.amount),
      date: tx.date || '',
      category_id: tx.category_id || '',
      split: tx.split || 'individual',
    });
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editingTx || !householdId || !user) return;
    setSaving(true);
    const newAmt = parseFloat(editForm.amount);
    if (!newAmt || newAmt <= 0) { alert('Valor inválido'); setSaving(false); return; }

    const isParcelado = editingTx.installments_count > 1 && editingTx.installment_value;
    const newTotal = isParcelado ? newAmt * editingTx.installments_count : newAmt;
    const oldTotal = Number(editingTx.amount);
    const amountChanged = Math.abs(newTotal - oldTotal) > 0.001;

    if (editingTx.split === 'shared' && amountChanged) {
      const { data: shareRows } = await supabase
        .from('transaction_shares')
        .select('id, user_id, share_amount')
        .eq('transaction_id', editingTx.id);

      if (shareRows && shareRows.length > 0) {
        const factor = oldTotal !== 0 ? newTotal / oldTotal : 1;
        for (const row of shareRows) {
          const oldShare = Number(row.share_amount);
          const newShare = Number((oldShare * factor).toFixed(2));
          if (Math.abs(newShare - oldShare) < 0.001) continue;

          if (row.user_id !== editingTx.payer_id) {
            const delta = newShare - oldShare;
            await applyBalanceDelta(householdId, editingTx.payer_id, row.user_id, delta);
          }

          await supabase
            .from('transaction_shares')
            .update({ share_amount: newShare })
            .eq('id', row.id);
        }
      } else {
        const { data: members } = await supabase
          .from('household_members')
          .select('user_id')
          .eq('household_id', householdId);
        const otherId = (members || []).map((m: any) => m.user_id).find((id: string) => id !== user.id);
        if (otherId) {
          const wasPayer = editingTx.payer_id === user.id;
          await applyBalanceDelta(householdId, user.id, otherId, wasPayer ? (newTotal - oldTotal) / 2 : -(newTotal - oldTotal) / 2);
        }
      }
    }

    const payload: any = {
      description: editForm.description.trim(),
      date: editForm.date,
      category_id: editForm.category_id || null,
      split: editForm.split,
    };
    if (isParcelado) { payload.installment_value = newAmt; payload.amount = newTotal; }
    else { payload.amount = newAmt; }

    const { error } = await supabase.from('transactions').update(payload).eq('id', editingTx.id);
    setSaving(false);
    if (error) { alert('Erro: ' + error.message); return; }
    setEditingTx(null);
    loadTransactions();
  }

  async function deleteTransaction(tx: any) {
    if (!confirm(`Deletar "${tx.description}"?`)) return;

    if (tx.split === 'shared') {
      const { data: shareRows } = await supabase
        .from('transaction_shares')
        .select('user_id, share_amount')
        .eq('transaction_id', tx.id);

      if (shareRows && shareRows.length > 0) {
        for (const row of shareRows) {
          if (row.user_id === tx.payer_id) continue;
          await applyBalanceDelta(householdId!, tx.payer_id, row.user_id, -Number(row.share_amount));
        }
      } else {
        const { data: members } = await supabase
          .from('household_members')
          .select('user_id')
          .eq('household_id', householdId!);
        const otherId = (members || []).map((m: any) => m.user_id).find((id: string) => id !== user.id);
        if (otherId) {
          const wasPayer = tx.payer_id === user.id;
          await applyBalanceDelta(householdId!, user.id, otherId, wasPayer ? -(Number(tx.amount) / 2) : (Number(tx.amount) / 2));
        }
      }
    }

    // Decrementa a fatura do cartão de crédito, se aplicável
    if (tx.payment_method === 'credit' && tx.credit_card_id && tx.invoice_month) {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('*')
        .eq('credit_card_id', tx.credit_card_id)
        .eq('month', tx.invoice_month)
        .maybeSingle();

      if (invoice) {
        const newTotal = Number(invoice.total) - Number(tx.amount);
        if (newTotal <= 0) {
          // Fatura ficou zerada — pode deletar
          await supabase.from('invoices').delete().eq('id', invoice.id);
        } else {
          await supabase.from('invoices').update({ total: newTotal }).eq('id', invoice.id);
        }
      }
    }

    const { error } = await supabase.from('transactions').delete().eq('id', tx.id);
    if (!error) setTransactions(prev => prev.filter(t => t.id !== tx.id));
    else alert('Erro: ' + error.message);
  }

  if (loading) return <main style={{ padding: 16, color: 'var(--text-muted)' }}>Carregando...</main>;

  const total = transactions.reduce((sum, t) => sum + (t.installments_count > 1 && t.installment_value ? Number(t.installment_value) : Number(t.amount)), 0);

  return (
    <>
      <Header title="Gastos" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>

        {/* Filtros */}
        <div style={{ backgroundColor: 'var(--bg2)', padding: 16, borderRadius: 'var(--radius-sm)', marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>📅 Período:</label>
            <select value={filterPeriod} onChange={e => setFilterPeriod(e.target.value)} style={{ padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 14 }}>
              <option value="month">Este mês</option>
              <option value="week">Última semana</option>
              <option value="all">Todos</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold', fontSize: 14 }}>🏷️ Categoria:</label>
            <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ padding: 8, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 14 }}>
              <option value="all">Todas</option>
              {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>)}
            </select>
          </div>
          {(filterPeriod !== 'month' || filterCategory !== 'all') && (
            <button onClick={() => { setFilterPeriod('month'); setFilterCategory('all'); }} style={{ padding: '8px 12px', borderRadius: 'var(--radius-sm)', backgroundColor: 'var(--red)', color: 'white', border: 'none', cursor: 'pointer' }}>✖️ Limpar</button>
          )}
          <Link href="/transactions/new" style={{ marginLeft: 'auto' }}>
            <button style={{ padding: '8px 16px', backgroundColor: 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 'bold' }}>➕ Novo</button>
          </Link>
        </div>

        {/* Total */}
        <div style={{ backgroundColor: '#fff3cd', padding: 16, borderRadius: 'var(--radius-sm)', marginBottom: 20, textAlign: 'center', border: '2px solid #ffc107' }}>
          <div style={{ fontSize: 14, color: '#856404', marginBottom: 4 }}>Total {filterPeriod === 'month' ? 'deste mês' : filterPeriod === 'week' ? 'da semana' : 'geral'}</div>
          <div style={{ fontSize: 32, fontWeight: 'bold', color: 'var(--red)' }}>{formatCurrency(total)}</div>
          <div style={{ fontSize: 13, color: '#856404' }}>{transactions.length} transações</div>
        </div>

        {/* Lista */}
        {transactions.length === 0 ? (
          <div className="card animate-in" style={{ textAlign: 'center', padding: '40px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 48 }}>📭</div>
            <h3 style={{ margin: 0, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>Nenhum gasto encontrado</h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 14 }}>Seus lançamentos aparecerão listados aqui.</p>
            <Link href="/transactions/new" style={{ marginTop: 8, textDecoration: 'none' }}>
              <button style={{ padding: '10px 20px', backgroundColor: 'var(--green)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600, fontSize: 14, boxShadow: '0 4px 12px rgba(0,200,150,0.3)' }}>
                ➕ Lançar primeiro gasto
              </button>
            </Link>
          </div>
        ) : transactions.map(tx => {
          const display = tx.installments_count > 1 && tx.installment_value ? Number(tx.installment_value) : Number(tx.amount);
          const myShare = Array.isArray(tx.transaction_shares)
            ? Number(tx.transaction_shares.find((s: any) => s.user_id === user?.id)?.share_amount ?? display)
            : display;
          return (
            <div key={tx.id} style={{ border: tx.split === 'shared' ? '1px solid #c5cae9' : '1px solid #ddd', padding: 12, marginBottom: 8, borderRadius: 'var(--radius-sm)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', backgroundColor: tx.split === 'shared' ? '#fafcff' : 'white' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 'bold', marginBottom: 4 }}>{tx.categories?.icon || '📁'} {tx.description}</div>
                <div style={{ fontSize: 13, color: 'var(--text3)' }}>
                  {tx.categories?.name || 'Sem categoria'} · {tx.payment_method}
                  {tx.split === 'shared' && <span style={{ color: 'var(--purple)', marginLeft: 6 }}>· 👫 Compartilhado</span>}
                  {tx.installments_count > 1 && <span style={{ color: 'var(--orange)', marginLeft: 6 }}>· {tx.installments_count}x</span>}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{new Date(tx.date + 'T12:00:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 18, fontWeight: 'bold', color: 'var(--red)' }}>{formatCurrency(display)}</div>
                  {tx.split === 'shared' && (
                    <div style={{ fontSize: 12, color: 'var(--purple)' }}>
                      Sua parte: {formatCurrency(myShare)}
                    </div>
                  )}
                </div>
                <button onClick={() => router.push(`/transactions/${tx.id}`)} style={{ padding: '6px 10px', backgroundColor: 'var(--purple)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }} title="Comentários">💬</button>
                <button onClick={() => openEdit(tx)} style={{ padding: '6px 10px', backgroundColor: 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>✏️</button>
                <button onClick={() => deleteTransaction(tx)} style={{ padding: '6px 10px', backgroundColor: '#ff4444', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>🗑️</button>
              </div>
            </div>
          );
        })}

        {/* Modal edição */}
        {editingTx && (
          <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div style={{ backgroundColor: 'var(--surface)', borderRadius: 'var(--radius-lg)', padding: 24, width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto' }}>
              <h2 style={{ margin: '0 0 20px' }}>✏️ Editar transação</h2>
              <form onSubmit={saveEdit}>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Descrição:</label>
                  <input type="text" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} required style={{ width: '100%', padding: 10, fontSize: 15, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>{editingTx.installments_count > 1 ? 'Valor da parcela:' : 'Valor (R$):'}</label>
                    <input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} step="0.01" min="0.01" required style={{ width: '100%', padding: 10, fontSize: 15, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                    {editingTx.installments_count > 1 && (
                      <div style={{ fontSize: 11, color: 'var(--orange)', marginTop: 4 }}>Total: R$ {(parseFloat(editForm.amount || '0') * editingTx.installments_count).toFixed(2)} ({editingTx.installments_count}x)</div>
                    )}
                  </div>
                  <div>
                    <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Data:</label>
                    <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} required style={{ width: '100%', padding: 10, fontSize: 14, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }} />
                  </div>
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Categoria:</label>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" onClick={() => setEditForm(f => ({ ...f, category_id: '' }))}
                      style={{ padding: '6px 12px', border: !editForm.category_id ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 20, backgroundColor: !editForm.category_id ? '#e8f4ff' : 'white', cursor: 'pointer', fontSize: 13 }}>
                      📁 Sem categoria
                    </button>
                    {categories.map(cat => (
                      <button key={cat.id} type="button" onClick={() => setEditForm(f => ({ ...f, category_id: cat.id }))}
                        style={{ padding: '6px 12px', border: editForm.category_id === cat.id ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 20, backgroundColor: editForm.category_id === cat.id ? (cat.color || '#3498db') : 'white', color: editForm.category_id === cat.id ? 'white' : '#333', cursor: 'pointer', fontSize: 13 }}>
                        {cat.icon} {cat.name}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6 }}>Divisão:</label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    {[['individual', '👤 Individual'], ['shared', '👫 Compartilhado']].map(([val, label]) => (
                      <button key={val} type="button" onClick={() => setEditForm(f => ({ ...f, split: val }))}
                        style={{ padding: 10, border: editForm.split === val ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: editForm.split === val ? '#e8f4ff' : 'white', cursor: 'pointer', fontWeight: editForm.split === val ? 'bold' : 'normal' }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="submit" disabled={saving} style={{ flex: 1, padding: '12px', backgroundColor: saving ? '#95a5a6' : '#2ecc71', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 15 }}>
                    {saving ? '⏳ Salvando...' : '💾 Salvar'}
                  </button>
                  <button type="button" onClick={() => setEditingTx(null)} style={{ flex: 1, padding: '12px', backgroundColor: 'var(--text-muted)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>Cancelar</button>
                </div>
              </form>
            </div>
          </div>
        )}
      </main>
    </>
  );
}