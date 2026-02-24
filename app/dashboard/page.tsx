'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';
import { useCrypto } from '@/lib/cryptoContext';
import { usePinUnlock } from '@/lib/usePinUnlock';
import { useFinanceGroup } from '@/lib/financeGroupContext';
import { formatCurrency } from '@/lib/format';

interface Member {
  user_id: string;
}

interface Transaction {
  amount: number;
  installment_value?: number;
  installments_count?: number;
  split?: string;
  payer_id?: string;
  categories?: any;
}

interface Recurrence {
  id: string;
  name: string;
  amount: number;
  next_date: string;
  active: boolean;
}

interface Goal {
  id: string;
  name: string;
  type: string;
  current_amount: number;
  target_amount: number;
}

function Skeleton({ w = '100%', h = 20 }: { w?: string; h?: number }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: 'var(--radius-sm)' }} />;
}

function SectionHeader({ title, href, linkLabel = 'Ver tudo →' }: { title: string; href: string; linkLabel?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>{title}</span>
      <Link href={href} style={{ fontSize: 12, color: 'var(--blue)', textDecoration: 'none', fontWeight: 600 }}>{linkLabel}</Link>
    </div>
  );
}

function ProgressBar({ pct, color = 'var(--blue)' }: { pct: number; color?: string }) {
  return (
    <div style={{ width: '100%', height: 6, backgroundColor: 'var(--bg3)', borderRadius: 99, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', backgroundColor: color, borderRadius: 99, transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)' }} />
    </div>
  );
}

function ModuleBtn({ href, icon, label }: { href: string; icon: string; label: string }) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <div style={{
        padding: '12px 4px', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
        textAlign: 'center', cursor: 'pointer', backgroundColor: 'var(--surface)', boxShadow: 'var(--shadow-sm)',
        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
      }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-sm)'; }}
      >
        <div style={{ fontSize: 20, marginBottom: 4 }}>{icon}</div>
        <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</div>
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [householdName, setHouseholdName] = useState('');
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [hasPartner, setHasPartner] = useState(false);
  const [partnerName, setPartnerName] = useState('Parceiro(a)');
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [sharedExpenses, setSharedExpenses] = useState(0);
  const [topCategories, setTopCategories] = useState<{ name: string; icon: string; color: string; amount: number }[]>([]);
  const [upcomingRecurrences, setUpcomingRecurrences] = useState<Recurrence[]>([]);
  const [balance, setBalance] = useState<{ amount: number; iOwe: boolean } | null>(null);
  const [activeGoals, setActiveGoals] = useState<Goal[]>([]);
  const [budgetSummary, setBudgetSummary] = useState<{ total: number; spent: number } | null>(null);
  const [showPinModal, setShowPinModal] = useState(false);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [pinLoading, setPinLoading] = useState(false);
  const [householdHasCrypto, setHouseholdHasCrypto] = useState(false);

  const router = useRouter();
  const { householdKey } = useCrypto();
  const { unlockWithPin } = usePinUnlock();
  const { activeGroupId, activeGroup } = useFinanceGroup();

  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
  const monthLabel = now.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
  const today = now.toISOString().split('T')[0];
  const in7days = new Date(now.getTime() + 7 * 86400000).toISOString().split('T')[0];

  useEffect(() => {
    async function bootstrap() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: members, error } = await supabase.from('household_members').select('household_id').eq('user_id', user.id);
      if (error || !members || members.length === 0) { router.push('/setup'); return; }
      init(activeGroupId || members[0].household_id);
    }
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function init(groupId: string) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setUserName(user.user_metadata?.name || user.email?.split('@')[0] || '');
    setCurrentUserId(user.id);
    setHouseholdId(groupId);
    setHouseholdName(activeGroup?.name || '');
    const hasCrypto = !!activeGroup?.hasCrypto;
    setHouseholdHasCrypto(hasCrypto);
    if (hasCrypto && !householdKey) setShowPinModal(true);
    await Promise.all([
      loadFinancials(groupId, user.id),
      loadUpcomingRecurrences(groupId),
      loadBalance(groupId, user.id),
      loadGoals(groupId, user.id),
      loadBudgetSummary(groupId),
      checkPartner(groupId, user.id),
    ]);
    setLoading(false);
  }

  async function handlePinSubmit() {
    if (!pin || pin.length < 4) { setPinError('Digite pelo menos 4 dígitos.'); return; }
    if (!householdId) return;
    setPinLoading(true); setPinError('');
    const ok = await unlockWithPin(householdId, pin);
    if (ok) { setShowPinModal(false); setPin(''); } else setPinError('PIN incorreto. Tente novamente.');
    setPinLoading(false);
  }

  async function checkPartner(hid: string, uid: string) {
    const { data } = await supabase.from('household_members').select('user_id').eq('household_id', hid);
    const members = data || [];
    setHasPartner(members.length >= 2);
    const partnerRow = members.find((m: Member) => m.user_id !== uid);
    if (partnerRow) {
      const { data: profile } = await supabase.from('profiles').select('name').eq('id', partnerRow.user_id).single();
      if (profile?.name) setPartnerName(profile.name);
    }
  }

  async function loadFinancials(hid: string, uid: string) {
    const { data: incomes } = await supabase.from('incomes').select('amount')
      .eq('household_id', hid).eq('user_id', uid).gte('month', firstDay).lte('month', lastDay);
    setTotalIncome((incomes || []).reduce((s, i) => s + Number(i.amount), 0));

    const { data: txs } = await supabase.from('transactions')
      .select('amount, installment_value, installments_count, split, payer_id, categories(name, icon, color)')
      .eq('household_id', hid).eq('user_id', uid).gte('created_at', firstDay).lte('created_at', lastDay);

    const all = txs || [];
    const eff = (t: Transaction) => t.installments_count && t.installments_count > 1 && t.installment_value ? Number(t.installment_value) : Number(t.amount);
    setTotalExpenses(all.reduce((s, t) => s + eff(t), 0));
    setSharedExpenses(all.filter(t => t.split === 'shared').reduce((s, t) => s + eff(t), 0));

    const catMap = new Map<string, { name: string; icon: string; color: string; amount: number }>();
    all.forEach((t: Transaction) => {
      const key = t.categories?.name || 'Sem categoria';
      const ex = catMap.get(key);
      catMap.set(key, { name: key, icon: t.categories?.icon || '📁', color: t.categories?.color || '#95a5a6', amount: (ex?.amount || 0) + eff(t) });
    });
    setTopCategories(Array.from(catMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 3));
  }

  async function loadUpcomingRecurrences(hid: string) {
    const { data } = await supabase.from('recurrence_rules').select('*')
      .eq('household_id', hid).eq('active', true).lte('next_date', in7days).order('next_date');
    setUpcomingRecurrences(data || []);
  }

  async function loadBalance(hid: string, uid: string) {
    const { data: balRows } = await supabase.from('balances').select('*').eq('household_id', hid);
    let net = 0;
    for (const row of balRows || []) {
      if (row.to_user_id === uid) net += Number(row.amount);
      else if (row.from_user_id === uid) net -= Number(row.amount);
    }
    setBalance(Math.abs(net) > 0.001 ? { amount: Math.abs(net), iOwe: net < 0 } : null);
  }

  async function loadGoals(hid: string, uid: string) {
    const { data } = await supabase.from('goals').select('*')
      .eq('household_id', hid).or(`type.eq.shared,owner_id.eq.${uid}`).order('created_at');
    setActiveGoals((data || []).filter(g => Number(g.current_amount) < Number(g.target_amount)).slice(0, 3));
  }

  async function loadBudgetSummary(hid: string) {
    const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const { data: budgets } = await supabase.from('budgets').select('amount').eq('household_id', hid).eq('month', monthStr);
    if (!budgets || budgets.length === 0) { setBudgetSummary(null); return; }
    const total = budgets.reduce((s, b) => s + Number(b.amount), 0);
    const { data: txs } = await supabase.from('transactions').select('amount')
      .eq('household_id', hid).gte('created_at', firstDay).lte('created_at', lastDay);
    setBudgetSummary({ total, spent: (txs || []).reduce((s, t) => s + Number(t.amount), 0) });
  }

  function daysUntil(dateStr: string) {
    const diff = Math.round((new Date(dateStr + 'T12:00:00').getTime() - now.getTime()) / 86400000);
    if (diff < 0) return 'atrasado';
    if (diff === 0) return 'hoje';
    if (diff === 1) return 'amanhã';
    return `em ${diff} dias`;
  }

  const balance_display = totalIncome > 0 ? totalIncome - totalExpenses : null;
  const budgetPct = budgetSummary ? (budgetSummary.spent / budgetSummary.total) * 100 : 0;

  const MODULES = [
    { href: '/transactions', icon: '💸', label: 'Gastos' },
    { href: '/budgets', icon: '💰', label: 'Orçamento' },
    { href: '/incomes', icon: '📥', label: 'Renda' },
    { href: '/goals', icon: '🎯', label: 'Metas' },
    { href: '/credit-cards', icon: '💳', label: 'Cartões' },
    { href: '/accounts', icon: '🏦', label: 'Contas' },
    { href: '/recurrences', icon: '🔁', label: 'Recorrências' },
    { href: '/analytics', icon: '📊', label: 'Analytics' },
    { href: '/cashflow', icon: '📅', label: 'Fluxo' },
    { href: '/financings', icon: '🏠', label: 'Financ.' },
    { href: '/balances', icon: '🤝', label: 'Acerto' },
    { href: '/categories', icon: '🏷️', label: 'Categorias' },
    { href: '/simulator', icon: '🧮', label: 'Simulador' },
    { href: '/closings', icon: '📋', label: 'Fechamentos' },
    { href: '/export', icon: '📤', label: 'Exportar' },
    { href: '/setup', icon: '⚙️', label: 'Config.' },
  ];

  return (
    <>
      <Header title="💑 Finanças" action={{ label: '⚙️', href: '/setup' }} />

      {/* PIN Modal */}
      {showPinModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, backdropFilter: 'blur(8px)' }}>
          <div className="card animate-in" style={{ padding: 32, maxWidth: 360, width: '100%' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ fontSize: 48, marginBottom: 8 }}>🔐</div>
              <h2 style={{ margin: 0, fontSize: 20, fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Digite seu PIN</h2>
              <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: 14 }}>Para descriptografar seus dados financeiros</p>
            </div>
            <input type="password" inputMode="numeric" placeholder="••••" value={pin}
              onChange={e => { setPin(e.target.value); setPinError(''); }}
              onKeyDown={e => e.key === 'Enter' && handlePinSubmit()} autoFocus
              style={{ width: '100%', padding: '14px', fontSize: 24, textAlign: 'center', letterSpacing: 8, border: `2px solid ${pinError ? 'var(--red)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', outline: 'none', boxSizing: 'border-box' }}
            />
            {pinError && <div style={{ color: 'var(--red)', fontSize: 13, textAlign: 'center', marginTop: 8 }}>{pinError}</div>}
            <button onClick={handlePinSubmit} disabled={pinLoading} style={{ width: '100%', marginTop: 16, padding: '14px', backgroundColor: pinLoading ? 'var(--text-muted)' : 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: pinLoading ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 16 }}>
              {pinLoading ? '⏳ Verificando...' : '🔓 Desbloquear'}
            </button>
            <button onClick={() => setShowPinModal(false)} style={{ width: '100%', marginTop: 10, padding: '10px', backgroundColor: 'transparent', color: 'var(--text-muted)', border: 'none', cursor: 'pointer', fontSize: 13 }}>
              Pular por agora
            </button>
          </div>
        </div>
      )}

      <main style={{ maxWidth: 720, margin: '0 auto', padding: '20px 16px 100px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Saudação */}
        <div className="animate-in" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, fontFamily: 'var(--font-display)', color: 'var(--text)' }}>
              Olá{userName ? `, ${userName.split(' ')[0]}` : ''}! 👋
            </h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              {householdName && `🏠 ${householdName} · `}
              <span style={{ textTransform: 'capitalize' }}>{monthLabel}</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {householdHasCrypto && (
              <button onClick={() => { if (!householdKey) setShowPinModal(true); }} style={{ width: 36, height: 36, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', backgroundColor: 'var(--surface)', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {householdKey ? '🔓' : '🔒'}
              </button>
            )}
            <Link href="/transactions/new" style={{ textDecoration: 'none' }}>
              <button style={{ padding: '8px 18px', backgroundColor: 'var(--green)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', fontWeight: 700, fontSize: 14, cursor: 'pointer', fontFamily: 'var(--font-display)', boxShadow: '0 4px 12px rgba(0,200,150,0.3)' }}>
                ➕ Lançar
              </button>
            </Link>
          </div>
        </div>

        {/* Aviso sem parceiro */}
        {!hasPartner && (
          <div className="animate-in card" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderColor: '#f59e0b', backgroundColor: 'rgba(245,158,11,0.08)' }}>
            <span style={{ fontSize: 13, color: '#b45309' }}>🧑‍🤝‍🧑 Seu parceiro(a) ainda não entrou.</span>
            <Link href="/setup" style={{ fontSize: 12, fontWeight: 700, color: '#b45309', textDecoration: 'underline' }}>Convidar →</Link>
          </div>
        )}

        <div className="card animate-in stagger" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden' }}>
          {[
            { label: 'Renda', value: formatCurrency(totalIncome), accent: 'var(--green)', sub: totalIncome === 0 ? 'Cadastre sua renda' : undefined },
            { label: 'Gastos', value: formatCurrency(totalExpenses), accent: 'var(--red)', sub: sharedExpenses > 0 ? `${formatCurrency(sharedExpenses)} compartilhado` : undefined },
            { label: 'Saldo', value: balance_display === null ? '—' : formatCurrency(balance_display), accent: balance_display === null ? 'var(--text-muted)' : balance_display >= 0 ? 'var(--blue)' : 'var(--red)', sub: balance_display === null ? 'Cadastre sua renda' : undefined },
          ].map((k, i, arr) => (
            <div key={k.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: i < arr.length - 1 ? '1px solid var(--border2)' : 'none' }}>
              <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)' }}>{k.label}</span>
              <div style={{ textAlign: 'right' }}>
                {loading ? <div className="skeleton" style={{ width: 80, height: 20, borderRadius: 'var(--radius-sm)' }} /> : (
                  <>
                    <div style={{ fontSize: 18, fontWeight: 800, color: k.accent, fontFamily: 'var(--font-display)' }}>{k.value}</div>
                    {k.sub && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{k.sub}</div>}
                  </>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Orçamento */}
        {(budgetSummary || loading) && (
          <div className="card animate-in" style={{ padding: '16px 20px' }}>
            <SectionHeader title="💰 Orçamento do mês" href="/budgets" linkLabel="Detalhes →" />
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}><Skeleton h={14} w="60%" /><Skeleton h={6} /></div>
            ) : budgetSummary ? (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'var(--text3)', marginBottom: 8 }}>
                  <span>{formatCurrency(budgetSummary.spent)} gasto</span>
                  <span style={{ fontWeight: 700, color: budgetPct > 100 ? 'var(--red)' : budgetPct > 80 ? 'var(--orange)' : 'var(--text)' }}>
                    {budgetPct.toFixed(0)}% de {formatCurrency(budgetSummary.total)}
                  </span>
                </div>
                <ProgressBar pct={budgetPct} color={budgetPct > 100 ? 'var(--red)' : budgetPct > 80 ? 'var(--orange)' : 'var(--green)'} />
                {budgetSummary.spent > budgetSummary.total && (
                  <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 8, fontWeight: 600 }}>
                    ⚠️ Estourado em {formatCurrency(budgetSummary.spent - budgetSummary.total)}
                  </div>
                )}
              </>
            ) : null}
          </div>
        )}

        {/* Top Categorias */}
        {(topCategories.length > 0 || loading) && (
          <div className="card animate-in" style={{ padding: '16px 20px' }}>
            <SectionHeader title="📊 Top categorias" href="/analytics" />
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {[1, 2, 3].map(i => <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><Skeleton h={12} w="50%" /><Skeleton h={5} /></div>)}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {topCategories.map((cat, i) => {
                  const pct = totalExpenses > 0 ? (cat.amount / totalExpenses) * 100 : 0;
                  return (
                    <div key={i}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5, alignItems: 'center' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)' }}>
                          <span style={{ width: 28, height: 28, borderRadius: 'var(--radius-sm)', backgroundColor: cat.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14 }}>{cat.icon}</span>
                          {cat.name}
                        </span>
                        <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                          {formatCurrency(cat.amount)} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>({pct.toFixed(0)}%)</span>
                        </span>
                      </div>
                      <ProgressBar pct={pct} color={cat.color || 'var(--blue)'} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Acerto de contas */}
        {hasPartner && (
          <Link href="/balances" style={{ textDecoration: 'none' }}>
            <div className="card animate-in" style={{ padding: '16px 20px', cursor: 'pointer', borderColor: balance ? 'var(--orange)' : 'var(--green)', backgroundColor: balance ? 'rgba(255,154,60,0.06)' : 'rgba(0,200,150,0.06)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', fontFamily: 'var(--font-display)' }}>🤝 Acerto de contas</div>
                  <div style={{ fontSize: 13, color: 'var(--text3)', marginTop: 4 }}>
                    {balance
                      ? (balance.iOwe ? `Você deve ${formatCurrency(balance.amount)} para ${partnerName}` : `${partnerName} deve ${formatCurrency(balance.amount)} para você`)
                      : `Você e ${partnerName} estão quites! 🎉`}
                  </div>
                </div>
                <span style={{ color: 'var(--text-muted)', fontSize: 20 }}>›</span>
              </div>
            </div>
          </Link>
        )}

        {/* Próximas recorrências */}
        {upcomingRecurrences.length > 0 && (
          <div className="card animate-in" style={{ padding: '16px 20px' }}>
            <SectionHeader title="🔁 Próximas contas (7 dias)" href="/recurrences" linkLabel="Ver todas →" />
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {upcomingRecurrences.map((r, i) => {
                const overdue = r.next_date <= today;
                return (
                  <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < upcomingRecurrences.length - 1 ? '1px solid var(--border2)' : 'none' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.name || '—'}</div>
                      <div style={{ fontSize: 11, color: overdue ? 'var(--red)' : 'var(--text-muted)', marginTop: 2 }}>
                        {new Date(r.next_date + 'T12:00:00').toLocaleDateString('pt-BR')} · {daysUntil(r.next_date)}
                      </div>
                    </div>
                    <span style={{ fontWeight: 700, color: overdue ? 'var(--red)' : 'var(--text)', fontSize: 13, backgroundColor: overdue ? 'rgba(255,92,124,0.1)' : 'var(--bg2)', padding: '4px 10px', borderRadius: 'var(--radius-sm)' }}>
                      {formatCurrency(Number(r.amount || 0))}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Metas */}
        {activeGoals.length > 0 && (
          <div className="card animate-in" style={{ padding: '16px 20px' }}>
            <SectionHeader title="🎯 Metas em andamento" href="/goals" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activeGoals.map((g) => {
                const pct = Number(g.target_amount) > 0 ? (Number(g.current_amount) / Number(g.target_amount)) * 100 : 0;
                return (
                  <div key={g.id}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 5 }}>
                      <span style={{ color: 'var(--text)', fontWeight: 600 }}>{g.type === 'shared' ? '👫' : '👤'} {g.name}</span>
                      <span style={{ color: 'var(--text-muted)' }}>{formatCurrency(Number(g.current_amount))} / {formatCurrency(Number(g.target_amount))}</span>
                    </div>
                    <ProgressBar pct={pct} color="var(--blue)" />
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>{pct.toFixed(0)}% concluído</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Módulos */}
        <div style={{ paddingTop: 4 }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12, fontFamily: 'var(--font-display)' }}>Módulos</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {MODULES.map(m => <ModuleBtn key={m.href} {...m} />)}
          </div>
        </div>

      </main>
    </>
  );
}