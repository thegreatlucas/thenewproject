'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Header from '@/app/components/Header';
import {
  PieChart, Pie, Cell, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  BarChart, Bar,
} from 'recharts';

interface CategoryData { name: string; value: number; color: string; icon: string; }
interface MonthlyData  { month: string; amount: number; }

export default function AnalyticsPage() {
  const [householdId, setHouseholdId]                   = useState<string | null>(null);
  const [categoryData, setCategoryData]                 = useState<CategoryData[]>([]);
  const [monthlyData,  setMonthlyData]                  = useState<MonthlyData[]>([]);
  const [insights,     setInsights]                     = useState<string[]>([]);
  const [period,       setPeriod]                       = useState('3months');
  const [totalSpent,   setTotalSpent]                   = useState(0);
  const [avgPerDay,    setAvgPerDay]                    = useState(0);
  const [topCategory,  setTopCategory]                  = useState('');
  const [totalInterestPaid, setTotalInterestPaid]       = useState(0);
  const [interestTransactions, setInterestTransactions] = useState<any[]>([]);
  const [loading,      setLoading]                      = useState(true);
  const [dataLoading,  setDataLoading]                  = useState(false);
  const router = useRouter();

  // 1. Busca householdId uma vez
  useEffect(() => {
    async function bootstrap() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }

      const { data: rows } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .limit(1);

      setHouseholdId(rows?.[0]?.household_id ?? null);
      setLoading(false);
    }
    bootstrap();
  }, [router]);

  // 2. Carrega dados sempre que hid ou período mudar
  const loadAnalytics = useCallback(async (hid: string, selectedPeriod: string) => {
    setDataLoading(true);

    const now = new Date();
    let startDate: Date;
    switch (selectedPeriod) {
      case '6months': startDate = new Date(now.getFullYear(), now.getMonth() - 6, 1); break;
      case 'year':    startDate = new Date(now.getFullYear() - 1, now.getMonth(), 1); break;
      default:        startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    }

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*, categories(name, icon, color)')
      .eq('household_id', hid)
      .gte('date', startDate.toISOString().split('T')[0])
      .order('date', { ascending: true });

    if (error) {
      console.error('[Analytics] erro:', error.message);
      setDataLoading(false);
      return;
    }

    if (!transactions || transactions.length === 0) {
      setCategoryData([]); setMonthlyData([]); setInsights(['📭 Nenhum gasto neste período.']);
      setTotalSpent(0); setAvgPerDay(0); setTotalInterestPaid(0); setInterestTransactions([]);
      setDataLoading(false);
      return;
    }

    // Categorias
    const catMap = new Map<string, CategoryData>();
    let total = 0;
    transactions.forEach((t) => {
      const val = Number(t.amount) || 0;
      total += val;
      const key = t.categories?.name || 'Sem categoria';
      const cur = catMap.get(key);
      catMap.set(key, { name: key, value: (cur?.value || 0) + val, color: t.categories?.color || '#95a5a6', icon: t.categories?.icon || '📁' });
    });
    const catData = Array.from(catMap.values()).sort((a, b) => b.value - a.value);
    setCategoryData(catData);
    setTotalSpent(total);
    if (catData[0]) setTopCategory(catData[0].name);

    // Mensal
    const monthMap = new Map<string, number>();
    transactions.forEach((t) => {
      const m = t.date.slice(0, 7);
      monthMap.set(m, (monthMap.get(m) || 0) + Number(t.amount));
    });
    const monthlyArr = Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([m, amount]) => ({
        month: new Date(m + '-02').toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        amount,
      }));
    setMonthlyData(monthlyArr);

    // Juros
    const interestTxs = transactions.filter(
      (t) => t.total_with_interest != null && t.original_amount != null
        && Number(t.total_with_interest) > Number(t.original_amount)
    );
    const totalInterest = interestTxs.reduce((s, t) => s + (Number(t.total_with_interest) - Number(t.original_amount)), 0);
    setTotalInterestPaid(totalInterest);
    setInterestTransactions(interestTxs);

    // Insights
    const days   = Math.max(1, Math.ceil((now.getTime() - startDate.getTime()) / 86400000));
    const avgDay = total / days;
    setAvgPerDay(avgDay);

    const ins: string[] = [];
    if (catData[0]) ins.push(`${catData[0].icon} ${((catData[0].value / total) * 100).toFixed(0)}% dos gastos em ${catData[0].name}`);
    ins.push(`💸 Média de R$ ${avgDay.toFixed(2)} por dia`);
    if (monthlyArr.length >= 2) {
      const last = monthlyArr[monthlyArr.length - 1].amount;
      const prev = monthlyArr[monthlyArr.length - 2].amount;
      const diff = ((last - prev) / prev * 100).toFixed(0);
      ins.push(Number(diff) > 0 ? `📈 Gastos +${diff}% no último mês` : `📉 Economia de ${Math.abs(Number(diff))}% no último mês`);
    }
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    ins.push(`🔮 Projeção do mês: R$ ${(avgDay * daysInMonth).toFixed(2)}`);
    if (catData.length >= 3) {
      const top3 = ((catData.slice(0,3).reduce((s,c) => s+c.value,0) / total) * 100).toFixed(0);
      ins.push(`🎯 ${top3}% dos gastos em apenas 3 categorias`);
    }
    ins.push(totalInterest > 0
      ? `📈 R$ ${totalInterest.toFixed(2)} pagos em juros (${((totalInterest/total)*100).toFixed(1)}% do total)`
      : '✅ Nenhum juro pago neste período');
    setInsights(ins);
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (householdId) loadAnalytics(householdId, period);
  }, [householdId, period, loadAnalytics]);

  // Render
  const RADIAN = Math.PI / 180;
  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null;
    const r = innerRadius + (outerRadius - innerRadius) * 0.5;
    return (
      <text x={cx + r * Math.cos(-midAngle * RADIAN)} y={cy + r * Math.sin(-midAngle * RADIAN)}
        fill="white" textAnchor="middle" dominantBaseline="central" fontWeight="bold" fontSize={13}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    );
  };

  if (loading) return (
    <>
      <Header title="📊 Analytics" backHref="/dashboard" />
      <main style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 48 }}>📊</div>
        <p style={{ color: 'var(--text-muted)', marginTop: 12 }}>Carregando...</p>
      </main>
    </>
  );

  if (!householdId) return (
    <>
      <Header title="📊 Analytics" backHref="/dashboard" />
      <main style={{ padding: 32, textAlign: 'center' }}>
        <p>Você não está em nenhum espaço financeiro.</p>
        <Link href="/setup"><button style={{ marginTop: 16, padding: '12px 24px' }}>Configurar</button></Link>
      </main>
    </>
  );

  return (
    <>
      <Header title="📊 Analytics" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 900, margin: '0 auto', paddingBottom: 80 }}>

        {/* Seletor de período */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, marginTop: 8, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: 'var(--text2)', fontSize: 14, marginRight: 4 }}>📅 Período:</span>
          {[{ v: '3months', l: '3 meses' }, { v: '6months', l: '6 meses' }, { v: 'year', l: '1 ano' }].map((opt) => (
            <button key={opt.v} onClick={() => setPeriod(opt.v)} style={{
              padding: '6px 16px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 13,
              fontWeight: period === opt.v ? 700 : 400,
              backgroundColor: period === opt.v ? '#3498db' : 'var(--bg3)',
              color: period === opt.v ? 'white' : 'var(--text2)',
            }}>
              {opt.l}
            </button>
          ))}
          {dataLoading && <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>Atualizando...</span>}
        </div>

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            { label: 'Total gasto',   value: `R$ ${totalSpent.toFixed(2)}`,       bg: 'linear-gradient(135deg,#667eea,#764ba2)' },
            { label: 'Média/dia',     value: `R$ ${avgPerDay.toFixed(2)}`,         bg: 'linear-gradient(135deg,#f093fb,#f5576c)' },
            { label: 'Top categoria', value: topCategory || '—',                   bg: 'linear-gradient(135deg,#4facfe,#00f2fe)' },
            { label: 'Juros pagos',   value: `R$ ${totalInterestPaid.toFixed(2)}`, bg: totalInterestPaid > 0 ? 'linear-gradient(135deg,#e74c3c,#c0392b)' : 'linear-gradient(135deg,#2ecc71,#27ae60)' },
          ].map((c) => (
            <div key={c.label} style={{ background: c.bg, padding: '16px 18px', borderRadius: 12, color: 'white' }}>
              <div style={{ fontSize: 12, opacity: 0.85, marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700 }}>{c.value}</div>
            </div>
          ))}
        </div>

        {/* Insights */}
        {insights.length > 0 && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18, marginBottom: 24 }}>
            <div style={{ fontWeight: 700, marginBottom: 10, fontSize: 14 }}>💡 Insights</div>
            <div style={{ display: 'grid', gap: 7 }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 8, padding: '9px 13px', fontSize: 13, color: 'var(--text)' }}>
                  {ins}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Sem dados */}
        {categoryData.length === 0 && !dataLoading && (
          <div style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-muted)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
            <p>Nenhum gasto encontrado neste período.</p>
            <Link href="/transactions/new">
              <button style={{ marginTop: 12, padding: '10px 24px', backgroundColor: '#3498db', color: 'white', border: 'none', borderRadius: 8, cursor: 'pointer' }}>
                + Lançar gasto
              </button>
            </Link>
          </div>
        )}

        {categoryData.length > 0 && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 16 }}>

              {/* Pizza */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>🥧 Por categoria</div>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={categoryData} cx="50%" cy="50%" labelLine={false} label={renderLabel} outerRadius={90} dataKey="value">
                      {categoryData.map((e, i) => <Cell key={i} fill={e.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any) => `R$ ${Number(v).toFixed(2)}`} />
                  </PieChart>
                </ResponsiveContainer>
                <div style={{ marginTop: 10, display: 'grid', gap: 5 }}>
                  {categoryData.map((cat, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                      <div style={{ width: 11, height: 11, borderRadius: 3, backgroundColor: cat.color, flexShrink: 0 }} />
                      <span style={{ color: 'var(--text2)' }}>{cat.icon} {cat.name}</span>
                      <span style={{ marginLeft: 'auto', fontWeight: 600, color: 'var(--text)' }}>R$ {cat.value.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Evolução mensal */}
              {monthlyData.length > 1 && (
                <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
                  <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>📈 Evolução mensal</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={monthlyData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                      <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                      <Tooltip formatter={(v: any) => `R$ ${Number(v).toFixed(2)}`} />
                      <Line type="monotone" dataKey="amount" stroke="#3498db" strokeWidth={2.5} dot={{ r: 4, fill: '#3498db' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            {/* Ranking */}
            <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 14, fontSize: 14 }}>🏆 Ranking de categorias</div>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'var(--text3)' }} />
                  <Tooltip formatter={(v: any) => `R$ ${Number(v).toFixed(2)}`} />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {categoryData.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Juros */}
            {totalInterestPaid > 0 && (
              <div style={{ background: '#fdecea', border: '1px solid #f5b7b1', borderRadius: 12, padding: 20 }}>
                <div style={{ fontWeight: 700, color: '#c0392b', marginBottom: 12, fontSize: 14 }}>📈 Compras com juros</div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {interestTransactions.map((t, i) => {
                    const interest = Number(t.total_with_interest) - Number(t.original_amount);
                    return (
                      <div key={i} style={{ background: 'white', borderRadius: 8, padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 14 }}>{t.description || '—'}</div>
                          <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                            {new Date(t.date + 'T12:00:00').toLocaleDateString('pt-BR')}
                            {t.installments_count > 1 && ` · ${t.installments_count}x R$ ${Number(t.installment_value).toFixed(2)}`}
                          </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 700, color: '#e74c3c' }}>+R$ {interest.toFixed(2)}</div>
                          <div style={{ fontSize: 11, color: '#e74c3c' }}>+{((interest / Number(t.original_amount)) * 100).toFixed(1)}%</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}