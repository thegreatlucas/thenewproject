'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/format';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';

export default function BalancesPage() {
  const [loading, setLoading] = useState(true);
  const [settling, setSettling] = useState(false);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [balance, setBalance] = useState<{ amount: number; iOwe: boolean } | null>(null);
  const [sharedTransactions, setSharedTransactions] = useState<any[]>([]);
  const [settlementHistory, setSettlementHistory] = useState<any[]>([]);
  const [hasPartner, setHasPartner] = useState(false);
  const [partnerName, setPartnerName] = useState('Parceiro(a)');
  const [activeTab, setActiveTab] = useState<'current' | 'history'>('current');
  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setCurrentUserId(user.id);
      const { data: member } = await supabase.from('household_members').select('household_id').eq('user_id', user.id).single();
      if (!member) { router.push('/setup'); return; }
      setHouseholdId(member.household_id);
      await loadData(member.household_id, user.id);
      setLoading(false);
    }
    init();
  }, []);

  async function loadData(hid: string, uid: string) {
    const { data: memberRows } = await supabase.from('household_members').select('user_id').eq('household_id', hid);
    const userIds = (memberRows || []).map((m: any) => m.user_id);
    setHasPartner(userIds.length >= 2);

    const partnerUserId = userIds.find((id: string) => id !== uid);
    if (partnerUserId) {
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', partnerUserId).single();
      if (profile?.name) setPartnerName(profile.name);
    }

    // Saldo atual
    const { data: balRows } = await supabase.from('balances').select('*').eq('household_id', hid);
    let net = 0;
    for (const row of balRows || []) {
      if (row.to_user_id === uid) net += Number(row.amount);
      else if (row.from_user_id === uid) net -= Number(row.amount);
    }
    setBalance(Math.abs(net) > 0.001 ? { amount: Math.abs(net), iOwe: net < 0 } : null);

    // Despesas compartilhadas recentes
    const { data: txs } = await supabase
      .from('transactions')
      .select('*, categories(name, icon)')
      .eq('household_id', hid)
      .eq('split', 'shared')
      .order('date', { ascending: false })
      .limit(30);
    setSharedTransactions(txs || []);

    // Histórico de acertos (monthly_closings)
    const { data: closings } = await supabase
      .from('monthly_closings')
      .select('*')
      .eq('household_id', hid)
      .order('closed_at', { ascending: false })
      .limit(20);
    setSettlementHistory(closings || []);
  }

  async function settleBalance() {
    if (!householdId || !currentUserId || !balance) return;
    const amount = balance.amount;
    if (!confirm(`Confirmar acerto de {ormatCurrency(amount)} com ${partnerName}? O saldo será zerado.`)) return;
    setSettling(true);

    // Registra no histórico via monthly_closings
    const now = new Date();
    const monthStr = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];

    // Busca IDs dos membros para registrar quem deve quem
    const { data: memberRows } = await supabase.from('household_members').select('user_id').eq('household_id', householdId);
    const userIds = (memberRows || []).map((m: any) => m.user_id);
    const partnerId = userIds.find((id: string) => id !== currentUserId);

    // Soma despesas do mês atual por usuário
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const { data: monthlyTxs } = await supabase.from('transactions').select('amount, payer_id').eq('household_id', householdId).gte('date', firstOfMonth);
    const u1Exp = (monthlyTxs || []).filter((t: any) => t.payer_id === currentUserId).reduce((s: number, t: any) => s + Number(t.amount), 0);
    const u2Exp = (monthlyTxs || []).filter((t: any) => t.payer_id === partnerId).reduce((s: number, t: any) => s + Number(t.amount), 0);

    await supabase.from('monthly_closings').insert({
      household_id: householdId,
      month: monthStr,
      total_income: 0,
      total_expenses: u1Exp + u2Exp,
      balance: (u1Exp + u2Exp) > 0 ? u1Exp + u2Exp : 0,
      user1_id: currentUserId,
      user1_expenses: u1Exp,
      user2_id: partnerId,
      user2_expenses: u2Exp,
      settlement_amount: amount,
      closed_by: currentUserId,
      notes: `Acerto manual de {ormatCurrency(amount)} — ${balance.iOwe ? `${partnerName} recebeu` : `${partnerName} pagou`}`,
    });

    // Zera balances
    await supabase.from('balances').delete().eq('household_id', householdId);
    await loadData(householdId, currentUserId);
    setSettling(false);
  }

  if (loading) return <main style={{ padding: 16, color: 'var(--text-muted)' }}>Carregando...</main>;

  const isZeroed = !balance || balance.amount < 0.001;

  return (
    <>
      <Header title="Acerto de Contas" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 700, margin: '0 auto' }}>

        {!hasPartner ? (
          <div style={{ border: '1px solid var(--border)', padding: 24, borderRadius: 'var(--radius)', textAlign: 'center', color: 'var(--text3)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>👤</div>
            <h3>Nenhum parceiro(a) no household ainda</h3>
            <Link href="/setup"><button style={{ padding: '10px 20px', backgroundColor: 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', marginTop: 16 }}>Ver código de convite</button></Link>
          </div>
        ) : (
          <>
            {/* Card de saldo */}
            <div style={{ padding: 28, borderRadius: 'var(--radius-lg)', marginBottom: 24, textAlign: 'center', border: isZeroed ? '2px solid #2ecc71' : '2px solid #f39c12', backgroundColor: isZeroed ? '#f0fff4' : '#fffdf0' }}>
              {isZeroed ? (
                <>
                  <div style={{ fontSize: 52 }}>🎉</div>
                  <h2 style={{ color: '#27ae60', margin: '12px 0 4px' }}>Tudo zerado!</h2>
                  <p style={{ color: 'var(--text3)', fontSize: 14 }}>Você e {partnerName} estão quites.</p>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 40, marginBottom: 8 }}>{balance?.iOwe ? '😬' : '💰'}</div>
                  <div style={{ fontSize: 15, color: 'var(--text3)', marginBottom: 8 }}>{balance?.iOwe ? `Você deve para ${partnerName}` : `${partnerName} deve para você`}</div>
                  <div style={{ fontSize: 40, fontWeight: 'bold', color: balance?.iOwe ? '#e74c3c' : '#27ae60', marginBottom: 20 }}>R$ {formatCurrency(balance?.amount ?? 0)}</div>
                  <button onClick={settleBalance} disabled={settling}
                    style={{ padding: '12px 32px', backgroundColor: settling ? '#95a5a6' : '#2ecc71', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: settling ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 15 }}>
                    {settling ? '⏳ Registrando...' : '✅ Marcar acerto como feito'}
                  </button>
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>Faça a transferência fora do app e clique acima para zerar o saldo.</p>
                </>
              )}
            </div>

            {/* Tabs */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 20, overflow: 'hidden' }}>
              {([['current', '📋 Despesas compartilhadas'], ['history', '🤝 Histórico de acertos']] as const).map(([tab, label]) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  style={{ padding: 12, border: 'none', cursor: 'pointer', fontWeight: activeTab === tab ? 'bold' : 'normal', backgroundColor: activeTab === tab ? '#3498db' : 'white', color: activeTab === tab ? 'white' : '#333', fontSize: 13 }}>
                  {label}
                </button>
              ))}
            </div>

            {/* Tab: despesas compartilhadas */}
            {activeTab === 'current' && (
              sharedTransactions.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <p style={{ marginBottom: 12 }}>Nenhuma despesa compartilhada ainda.</p>
                  <Link href="/transactions/new"><button style={{ padding: '10px 20px', backgroundColor: 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}>➕ Lançar despesa</button></Link>
                </div>
              ) : (
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  {sharedTransactions.map((tx, i) => {
                    const isPayer = tx.payer_id === currentUserId;
                    const half = Number(tx.amount) / 2;
                    return (
                      <div key={tx.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: i < sharedTransactions.length - 1 ? '1px solid #f0f0f0' : 'none', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                            <span>{tx.categories?.icon || '💸'}</span>
                            <span style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.description}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            {new Date(tx.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                            {tx.categories?.name ? ` · ${tx.categories.name}` : ''}
                            {' · '}<span style={{ color: isPayer ? '#27ae60' : '#e67e22' }}>{isPayer ? '💳 Você pagou' : `💳 ${partnerName} pagou`}</span>
                          </div>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <div style={{ fontWeight: 'bold', color: 'var(--text2)' }}>R$ {Number(tx.amount).toFixed(2)}</div>
                          <div style={{ fontSize: 12, color: isPayer ? '#27ae60' : '#e74c3c', marginTop: 2 }}>{isPayer ? `+{ormatCurrency(half)}` : `-{ormatCurrency(half)}`}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* Tab: histórico de acertos */}
            {activeTab === 'history' && (
              settlementHistory.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: 12 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
                  <p>Nenhum acerto registrado ainda.</p>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>Quando você clicar em "Marcar acerto como feito", o registro aparece aqui.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {settlementHistory.map((closing) => {
                    const date = new Date(closing.closed_at);
                    const meSettled = closing.closed_by === currentUserId;
                    return (
                      <div key={closing.id} style={{ border: '1px solid #dde', borderRadius: 'var(--radius)', padding: 16, backgroundColor: '#f8fbff' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div>
                            <div style={{ fontWeight: 'bold', fontSize: 15 }}>
                              🤝 Acerto de {date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                              Registrado por {meSettled ? 'você' : partnerName}
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 'bold', fontSize: 18, color: '#27ae60' }}>R$ {Number(closing.settlement_amount).toFixed(2)}</div>
                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>transferido</div>
                          </div>
                        </div>
                        {closing.notes && (
                          <div style={{ fontSize: 13, color: 'var(--text3)', backgroundColor: 'var(--surface)', padding: '6px 10px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border2)' }}>
                            {closing.notes}
                          </div>
                        )}
                        {(closing.user1_expenses > 0 || closing.user2_expenses > 0) && (
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                            <div style={{ backgroundColor: 'var(--surface)', padding: 8, borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border2)' }}>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Você gastou</div>
                              <div style={{ fontWeight: 'bold', color: 'var(--red)' }}>R$ {Number(closing.user1_expenses).toFixed(2)}</div>
                            </div>
                            <div style={{ backgroundColor: 'var(--surface)', padding: 8, borderRadius: 'var(--radius-sm)', textAlign: 'center', border: '1px solid var(--border2)' }}>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{partnerName} gastou</div>
                              <div style={{ fontWeight: 'bold', color: 'var(--red)' }}>R$ {Number(closing.user2_expenses).toFixed(2)}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </>
        )}
      </main>
    </>
  );
}