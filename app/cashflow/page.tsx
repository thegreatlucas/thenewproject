'use client';
// app/cashflow/page.tsx — Fluxo de caixa: calendário mensal com entradas e saídas

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Header from '@/app/components/Header';

interface DayData {
  date: string;
  income: number;
  expense: number;
  items: { description: string; amount: number; type: 'income' | 'expense' }[];
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS_PT = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

export default function CashflowPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [year,  setYear]  = useState(() => new Date().getFullYear());
  const [month, setMonth] = useState(() => new Date().getMonth());
  const [dayMap, setDayMap] = useState<Record<string, DayData>>({});
  const [loading,     setLoading]     = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [selected,    setSelected]    = useState<string | null>(null);
  const [totalIncome,  setTotalIncome]  = useState(0);
  const [totalExpense, setTotalExpense] = useState(0);
  const router = useRouter();

  // Bootstrap
  useEffect(() => {
    async function boot() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      const { data: rows } = await supabase
        .from('household_members').select('household_id')
        .eq('user_id', user.id).limit(1);
      const hid = rows?.[0]?.household_id ?? null;
      if (!hid) { router.push('/setup'); return; }
      setHouseholdId(hid);
      setLoading(false);
    }
    boot();
  }, [router]);

  const loadMonth = useCallback(async (hid: string, y: number, m: number) => {
    setDataLoading(true);
    const from = new Date(y, m, 1).toISOString();
    const to   = new Date(y, m + 1, 0, 23, 59, 59).toISOString();

    // Busca transações e receitas em paralelo
    // transactions usa created_at; incomes usa a coluna 'month' (date)
    const fromMonth = new Date(y, m, 1).toISOString().split('T')[0];      // ex: 2026-02-01
    const toMonth   = new Date(y, m + 1, 0).toISOString().split('T')[0];  // ex: 2026-02-28

    const [{ data: txs }, { data: incomes }] = await Promise.all([
      supabase.from('transactions').select('amount, description, created_at')
        .eq('household_id', hid).gte('created_at', from).lte('created_at', to),
      supabase.from('incomes').select('amount, description, month')
        .eq('household_id', hid).gte('month', fromMonth).lte('month', toMonth),
    ]);

    const map: Record<string, DayData> = {};

    const ensure = (d: string) => {
      if (!map[d]) map[d] = { date: d, income: 0, expense: 0, items: [] };
      return map[d];
    };

    let totIn = 0, totEx = 0;

    for (const t of txs || []) {
      const d = t.created_at.slice(0, 10);
      const day = ensure(d);
      day.expense += Number(t.amount);
      day.items.push({ description: t.description || 'Sem descrição', amount: Number(t.amount), type: 'expense' });
      totEx += Number(t.amount);
    }

    for (const i of incomes || []) {
      const d = (i.month || i.created_at || '').slice(0, 10);
      const day = ensure(d);
      day.income += Number(i.amount);
      day.items.push({ description: i.description || 'Receita', amount: Number(i.amount), type: 'income' });
      totIn += Number(i.amount);
    }

    setDayMap(map);
    setTotalIncome(totIn);
    setTotalExpense(totEx);
    setDataLoading(false);
  }, []);

  useEffect(() => {
    if (householdId) loadMonth(householdId, year, month);
  }, [householdId, year, month, loadMonth]);

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
    setSelected(null);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
    setSelected(null);
  }

  // Calcula grade do calendário
  const firstDay = new Date(year, month, 1).getDay(); // 0=dom
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  // Completa para múltiplo de 7
  while (cells.length % 7 !== 0) cells.push(null);

  const today = new Date().toISOString().slice(0, 10);
  const selectedDay = selected ? dayMap[selected] : null;

  if (loading) return (
    <>
      <Header title="📅 Fluxo de Caixa" backHref="/dashboard" />
      <main style={{ padding: 32, textAlign: 'center' }}>
        <p style={{ color: 'var(--text-muted)' }}>Carregando...</p>
      </main>
    </>
  );

  return (
    <>
      <Header title="📅 Fluxo de Caixa" backHref="/dashboard" />
      <main style={{ padding: 16, maxWidth: 680, margin: '0 auto', paddingBottom: 80 }}>

        {/* Navegação de mês */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <button onClick={prevMonth} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 18, color: 'var(--text)' }}>‹</button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 17, color: 'var(--text)' }}>{MONTHS_PT[month]}</div>
            <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>{year}</div>
          </div>
          <button onClick={nextMonth} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontSize: 18, color: 'var(--text)' }}>›</button>
        </div>

        {/* KPIs do mês */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { label: 'Entradas', value: totalIncome,  color: '#2ecc71', bg: 'linear-gradient(135deg,#2ecc71,#27ae60)' },
            { label: 'Saídas',   value: totalExpense, color: '#e74c3c', bg: 'linear-gradient(135deg,#e74c3c,#c0392b)' },
            { label: 'Saldo',    value: totalIncome - totalExpense,
              bg: (totalIncome - totalExpense) >= 0 ? 'linear-gradient(135deg,#3498db,#2980b9)' : 'linear-gradient(135deg,#e67e22,#d35400)' },
          ].map((k) => (
            <div key={k.label} style={{ background: k.bg, borderRadius: 10, padding: '12px 10px', color: 'white', textAlign: 'center' }}>
              <div style={{ fontSize: 10, opacity: 0.85, marginBottom: 3 }}>{k.label}</div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>
                {k.value >= 0 ? '' : '-'}R$ {Math.abs(k.value).toFixed(0)}
              </div>
            </div>
          ))}
        </div>

        {/* Calendário */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', marginBottom: 16 }}>
          {/* Cabeçalho dias da semana */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)' }}>
            {WEEKDAYS.map((d) => (
              <div key={d} style={{ textAlign: 'center', padding: '8px 0', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>{d}</div>
            ))}
          </div>

          {/* Células */}
          {dataLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>Carregando...</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
              {cells.map((day, i) => {
                if (!day) return <div key={i} style={{ minHeight: 54, borderRight: (i+1)%7!==0 ? '1px solid var(--border2)' : 'none', borderBottom: '1px solid var(--border2)' }} />;

                const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
                const data    = dayMap[dateStr];
                const isToday = dateStr === today;
                const isSel   = dateStr === selected;
                const hasIn   = data?.income  > 0;
                const hasEx   = data?.expense > 0;

                return (
                  <div key={i}
                    onClick={() => setSelected(isSel ? null : dateStr)}
                    style={{
                      minHeight: 54, padding: '6px 4px',
                      borderRight: (i+1)%7!==0 ? '1px solid var(--border2)' : 'none',
                      borderBottom: '1px solid var(--border2)',
                      cursor: data ? 'pointer' : 'default',
                      backgroundColor: isSel ? 'var(--bg3)' : isToday ? 'rgba(46,204,113,0.08)' : 'transparent',
                      transition: 'background 0.1s',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                    }}
                  >
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%', display: 'flex',
                      alignItems: 'center', justifyContent: 'center',
                      fontSize: 12, fontWeight: isToday ? 700 : 400,
                      backgroundColor: isToday ? '#2ecc71' : 'transparent',
                      color: isToday ? 'white' : 'var(--text)',
                    }}>
                      {day}
                    </div>

                    {/* Dots de entrada/saída */}
                    <div style={{ display: 'flex', gap: 2 }}>
                      {hasIn  && <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#2ecc71' }} />}
                      {hasEx  && <div style={{ width: 5, height: 5, borderRadius: '50%', backgroundColor: '#e74c3c' }} />}
                    </div>

                    {/* Mini valor se tiver movimento */}
                    {data && (
                      <div style={{ fontSize: 8, color: data.expense > data.income ? '#e74c3c' : '#2ecc71', lineHeight: 1, textAlign: 'center' }}>
                        {data.expense > 0 && <div>-{data.expense.toFixed(0)}</div>}
                        {data.income  > 0 && <div style={{ color: '#2ecc71' }}>+{data.income.toFixed(0)}</div>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detalhe do dia selecionado */}
        {selected && (
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 15, color: 'var(--text)' }}>
              📅 {new Date(selected + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>

            {!selectedDay ? (
              <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Nenhum lançamento neste dia.</p>
            ) : (
              <>
                {/* Resumo do dia */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
                  {selectedDay.income > 0 && (
                    <div style={{ background: 'rgba(46,204,113,0.1)', border: '1px solid rgba(46,204,113,0.3)', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ fontSize: 11, color: '#27ae60' }}>Entradas</div>
                      <div style={{ fontWeight: 700, color: '#27ae60' }}>R$ {selectedDay.income.toFixed(2)}</div>
                    </div>
                  )}
                  {selectedDay.expense > 0 && (
                    <div style={{ background: 'rgba(231,76,60,0.1)', border: '1px solid rgba(231,76,60,0.3)', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ fontSize: 11, color: '#e74c3c' }}>Saídas</div>
                      <div style={{ fontWeight: 700, color: '#e74c3c' }}>R$ {selectedDay.expense.toFixed(2)}</div>
                    </div>
                  )}
                </div>

                {/* Lista de lançamentos */}
                <div style={{ display: 'grid', gap: 6 }}>
                  {selectedDay.items
                    .sort((a, b) => b.amount - a.amount)
                    .map((item, i) => (
                      <div key={i} style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '8px 10px', borderRadius: 8,
                        background: 'var(--bg2)', border: '1px solid var(--border2)',
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{item.type === 'income' ? '📈' : '📉'}</span>
                          <span style={{ fontSize: 13, color: 'var(--text)' }}>{item.description}</span>
                        </div>
                        <span style={{ fontWeight: 600, fontSize: 13, color: item.type === 'income' ? '#27ae60' : '#e74c3c', flexShrink: 0 }}>
                          {item.type === 'income' ? '+' : '-'}R$ {item.amount.toFixed(2)}
                        </span>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        )}
      </main>
    </>
  );
}