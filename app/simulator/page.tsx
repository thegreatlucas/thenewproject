'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/format';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const VOUCHER_TYPES = ['meal_voucher', 'food_voucher'];

interface MonthProjection {
  month: string;
  monthKey: string;
  income: number;
  voucherIncome: number;
  fixedExpenses: number;
  simulatedExpense: number;
  extras: { label: string; amount: number }[];
  balance: number;
  isNegative: boolean;
  warnings: string[];
}

export default function SimulatorPage() {
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [simulating, setSimulating] = useState(false);

  // Dados financeiros carregados
  const [personalIncome, setPersonalIncome] = useState(0);
  const [coupleIncome, setCoupleIncome] = useState(0);
  const [personalVoucher, setPersonalVoucher] = useState(0);
  const [coupleVoucher, setCoupleVoucher] = useState(0);
  const [fixedExpenses, setFixedExpenses] = useState(0);
  const [recurrences, setRecurrences] = useState<any[]>([]);
  const [financings, setFinancings] = useState<any[]>([]);
  const [intermediaries, setIntermediaries] = useState<any[]>([]);
  const [invoices, setInvoices] = useState<any[]>([]);

  // Parâmetros da simulação
  const [scope, setScope] = useState<'personal' | 'couple'>('personal');
  const [purchaseDescription, setPurchaseDescription] = useState('');
  const [purchaseAmount, setPurchaseAmount] = useState('');
  const [purchaseType, setPurchaseType] = useState<'cash' | 'installment'>('cash');
  const [installments, setInstallments] = useState('1');
  const [startMonth, setStartMonth] = useState(new Date().toISOString().slice(0, 7));
  const [monthsAhead, setMonthsAhead] = useState('6');

  // Resultado
  const [projection, setProjection] = useState<MonthProjection[]>([]);
  const [verdict, setVerdict] = useState<'ok' | 'warning' | 'danger' | null>(null);
  const [verdictMessage, setVerdictMessage] = useState('');

  const router = useRouter();

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setUserId(user.id);

      const { data: member } = await supabase
        .from('household_members')
        .select('household_id')
        .eq('user_id', user.id)
        .single();

      if (!member) { router.push('/setup'); return; }
      setHouseholdId(member.household_id);
      await loadFinancialData(member.household_id, user.id);
      setLoading(false);
    }
    init();
  }, []);

  async function loadFinancialData(hid: string, uid: string) {
    const [incomesRes, recurrencesRes, financingsRes, intermediariesRes, invoicesRes] = await Promise.all([
      supabase.from('incomes').select('*, accounts(type)').eq('household_id', hid).eq('recurrence', 'monthly'),
      supabase.from('recurrence_rules').select('*, transactions(amount, description)').eq('household_id', hid).eq('active', true),
      supabase.from('financings').select('*').eq('household_id', hid),
      supabase.from('financing_intermediaries').select('*, financings(name, household_id)').eq('paid', false),
      supabase.from('invoices').select('*, credit_cards(name, household_id)').eq('status', 'open'),
    ]);

    const allIncomes = incomesRes.data || [];

    // Separa receitas normais de vouchers — por usuário e casal
    const isVoucher = (i: any) => VOUCHER_TYPES.includes(i.accounts?.type);

    const pIncome = allIncomes.filter(i => i.user_id === uid && !isVoucher(i)).reduce((s, i) => s + Number(i.amount), 0);
    const pVoucher = allIncomes.filter(i => i.user_id === uid && isVoucher(i)).reduce((s, i) => s + Number(i.amount), 0);
    const cIncome = allIncomes.filter(i => !isVoucher(i)).reduce((s, i) => s + Number(i.amount), 0);
    const cVoucher = allIncomes.filter(i => isVoucher(i)).reduce((s, i) => s + Number(i.amount), 0);

    setPersonalIncome(pIncome);
    setPersonalVoucher(pVoucher);
    setCoupleIncome(cIncome);
    setCoupleVoucher(cVoucher);

    setRecurrences(recurrencesRes.data || []);
    setFinancings(financingsRes.data || []);

    const allInter = (intermediariesRes.data || []).filter(i => i.financings?.household_id === hid);
    setIntermediaries(allInter);

    const allInvoices = (invoicesRes.data || []).filter(i => i.credit_cards?.household_id === hid);
    setInvoices(allInvoices);

    // Gastos fixos mensais
    const recurrenceTotal = (recurrencesRes.data || []).reduce((s: number, r: any) => s + Number(r.transactions?.amount || 0), 0);
    const financingTotal = (financingsRes.data || [])
      .filter(f => f.paid_installments < f.total_installments)
      .reduce((s: number, f: any) => s + Number(f.installment_amount), 0);

    setFixedExpenses(recurrenceTotal + financingTotal);
  }

  const activeIncome = scope === 'personal' ? personalIncome : coupleIncome;
  const activeVoucher = scope === 'personal' ? personalVoucher : coupleVoucher;
  const freeBalance = activeIncome - fixedExpenses;

  function simulate() {
    if (!purchaseAmount || parseFloat(purchaseAmount) <= 0) {
      alert('Digite o valor da compra');
      return;
    }

    setSimulating(true);

    const totalAmount = parseFloat(purchaseAmount);
    const numInstallments = purchaseType === 'installment' ? parseInt(installments) : 1;
    const installmentValue = totalAmount / numInstallments;
    const totalMonths = parseInt(monthsAhead);

    const months: MonthProjection[] = [];

    for (let i = 0; i < totalMonths; i++) {
      const d = new Date(startMonth + '-01');
      d.setMonth(d.getMonth() + i);
      const monthKey = d.toISOString().slice(0, 7);

      const extras: { label: string; amount: number }[] = [];
      const warnings: string[] = [];

      // Intermediárias do mês
      const monthInters = intermediaries.filter(inter => inter.due_date?.slice(0, 7) === monthKey);
      monthInters.forEach(inter => {
        extras.push({ label: `🏢 Intermediária — ${inter.financings?.name || 'Financiamento'}`, amount: Number(inter.amount) });
        warnings.push(`Intermediária de ${formatCurrency(Number(inter.amount))} vence em ${new Date(inter.due_date + 'T12:00:00').toLocaleDateString('pt-BR')}`);
      });

      // Faturas abertas do mês
      const monthInvoices = invoices.filter(inv => inv.month?.slice(0, 7) === monthKey);
      monthInvoices.forEach(inv => {
        extras.push({ label: `💳 Fatura ${inv.credit_cards?.name || 'Cartão'}`, amount: Number(inv.total) });
      });

      const simulatedExpense = i < numInstallments ? installmentValue : 0;
      const extrasTotal = extras.reduce((s, e) => s + e.amount, 0);
      const balance = activeIncome - fixedExpenses - simulatedExpense - extrasTotal;

      if (balance < 0) warnings.push(`Saldo negativo de ${formatCurrency(Math.abs(balance))}`);
      else if (balance < activeIncome * 0.1) warnings.push(`Saldo muito apertado (menos de 10% da renda)`);

      months.push({
        month: d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
        monthKey,
        income: activeIncome,
        voucherIncome: activeVoucher,
        fixedExpenses,
        simulatedExpense,
        extras,
        balance,
        isNegative: balance < 0,
        warnings,
      });
    }

    setProjection(months);

    // Veredito
    const negativeMonths = months.filter(m => m.isNegative);
    const tightMonths = months.filter(m => !m.isNegative && m.balance < activeIncome * 0.1);

    if (negativeMonths.length > 0) {
      setVerdict('danger');
      const worstMonths = negativeMonths.map(m => m.month).join(', ');
      setVerdictMessage(`❌ Não recomendado. Você ficará negativo em: ${worstMonths}.`);
    } else if (tightMonths.length >= 2) {
      setVerdict('warning');
      setVerdictMessage(`⚠️ Possível, mas arriscado. O orçamento ficará muito apertado em ${tightMonths.length} meses. Tenha reserva.`);
    } else {
      setVerdict('ok');
      const minBalance = Math.min(...months.map(m => m.balance));
      setVerdictMessage(`✅ Compra viável! Seu saldo mínimo nos próximos ${totalMonths} meses será de ${formatCurrency(minBalance)}.`);
    }

    setSimulating(false);
  }

  if (loading) return <main style={{ padding: 16 }}>Carregando dados financeiros...</main>;

  return (
    <main style={{ padding: 16, maxWidth: 800, margin: '0 auto' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ marginBottom: 4 }}>🧮 Simulador Financeiro</h1>
        <p style={{ color: 'var(--text3)', fontSize: 14 }}>Descubra se uma compra cabe no seu bolso antes de fazer</p>
      </div>

      {/* Resumo financeiro atual */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 24 }}>
        <div style={{ background: 'linear-gradient(135deg, #2ecc71, #27ae60)', padding: 16, borderRadius: 'var(--radius)', color: 'white' }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Renda mensal</div>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>{formatCurrency(activeIncome)}</div>
          <div style={{ fontSize: 11, opacity: 0.8 }}>{scope === 'personal' ? 'Pessoal' : 'Casal'}</div>
        </div>
        {activeVoucher > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #f39c12, #e67e22)', padding: 16, borderRadius: 'var(--radius)', color: 'white' }}>
            <div style={{ fontSize: 12, opacity: 0.9 }}>VR/VA (separado)</div>
            <div style={{ fontSize: 20, fontWeight: 'bold' }}>{formatCurrency(activeVoucher)}</div>
            <div style={{ fontSize: 11, opacity: 0.8 }}>Não entra no cálculo</div>
          </div>
        )}
        <div style={{ background: 'linear-gradient(135deg, #e74c3c, #c0392b)', padding: 16, borderRadius: 'var(--radius)', color: 'white' }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Gastos fixos</div>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>{formatCurrency(fixedExpenses)}</div>
        </div>
        <div style={{ background: `linear-gradient(135deg, ${freeBalance >= 0 ? '#3498db, #2980b9' : '#e74c3c, #c0392b'})`, padding: 16, borderRadius: 'var(--radius)', color: 'white' }}>
          <div style={{ fontSize: 12, opacity: 0.9 }}>Saldo livre</div>
          <div style={{ fontSize: 20, fontWeight: 'bold' }}>{formatCurrency(freeBalance)}</div>
        </div>
      </div>

      {activeIncome === 0 && (
        <div style={{ backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: 'var(--radius-sm)', padding: 12, marginBottom: 24, fontSize: 14 }}>
          ⚠️ Nenhuma receita mensal cadastrada. <Link href="/incomes" style={{ color: 'var(--blue)' }}>Cadastre suas receitas</Link> para o simulador funcionar corretamente.
        </div>
      )}

      {/* Formulário */}
      <div style={{ backgroundColor: 'var(--bg2)', padding: 20, borderRadius: 'var(--radius)', marginBottom: 24, border: '1px solid var(--border)' }}>
        <h2 style={{ marginTop: 0, marginBottom: 16 }}>🛒 O que você quer comprar?</h2>

        {/* Escopo */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Simular para:</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" onClick={() => setScope('personal')}
              style={{ padding: 12, border: scope === 'personal' ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: scope === 'personal' ? '#e3f2fd' : 'white', cursor: 'pointer', fontWeight: scope === 'personal' ? 'bold' : 'normal' }}
            >
              👤 Minha renda<br />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{formatCurrency(personalIncome)}/mês</span>
            </button>
            <button type="button" onClick={() => setScope('couple')}
              style={{ padding: 12, border: scope === 'couple' ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: scope === 'couple' ? '#e3f2fd' : 'white', cursor: 'pointer', fontWeight: scope === 'couple' ? 'bold' : 'normal' }}
            >
              👥 Renda do casal<br />
              <span style={{ fontSize: 12, color: 'var(--text3)' }}>{formatCurrency(coupleIncome)}/mês</span>
            </button>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Descrição da compra:</label>
          <input
            type="text" value={purchaseDescription}
            onChange={(e) => setPurchaseDescription(e.target.value)}
            placeholder="Ex: iPhone 15, Sofá, Viagem..."
            style={{ width: '100%', padding: 10, fontSize: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Valor total:</label>
            <input
              type="number" value={purchaseAmount}
              onChange={(e) => setPurchaseAmount(e.target.value)}
              placeholder="0.00" step="0.01" min="0"
              style={{ width: '100%', padding: 10, fontSize: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Projetar por:</label>
            <select value={monthsAhead} onChange={(e) => setMonthsAhead(e.target.value)}
              style={{ width: '100%', padding: 10, fontSize: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
              <option value="3">3 meses</option>
              <option value="6">6 meses</option>
              <option value="12">12 meses</option>
              <option value="24">24 meses</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>Forma de pagamento:</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button type="button" onClick={() => setPurchaseType('cash')}
              style={{ padding: 12, border: purchaseType === 'cash' ? '2px solid #2ecc71' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: purchaseType === 'cash' ? '#e8f8f0' : 'white', cursor: 'pointer', fontWeight: purchaseType === 'cash' ? 'bold' : 'normal' }}
            >💵 À vista</button>
            <button type="button" onClick={() => setPurchaseType('installment')}
              style={{ padding: 12, border: purchaseType === 'installment' ? '2px solid #2ecc71' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: purchaseType === 'installment' ? '#e8f8f0' : 'white', cursor: 'pointer', fontWeight: purchaseType === 'installment' ? 'bold' : 'normal' }}
            >📅 Parcelado</button>
          </div>
        </div>

        {purchaseType === 'installment' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Número de parcelas:</label>
            <input
              type="number" value={installments}
              onChange={(e) => setInstallments(e.target.value)}
              placeholder="Ex: 12" min="2" max="60"
              style={{ width: '100%', padding: 10, fontSize: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
            />
            {purchaseAmount && installments && (
              <div style={{ marginTop: 8, fontSize: 14, color: 'var(--text3)' }}>
                Parcela de <strong style={{ color: 'var(--red)' }}>R$ {(parseFloat(purchaseAmount) / parseInt(installments)).toFixed(2)}</strong>/mês
              </div>
            )}
          </div>
        )}

        <div style={{ marginBottom: 20 }}>
          <label style={{ display: 'block', marginBottom: 4, fontWeight: 'bold' }}>Mês inicial da compra:</label>
          <input
            type="month" value={startMonth}
            onChange={(e) => setStartMonth(e.target.value)}
            style={{ width: '100%', padding: 10, fontSize: 16, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}
          />
        </div>

        <button
          onClick={simulate}
          disabled={simulating || !purchaseAmount}
          style={{ width: '100%', padding: '14px 24px', fontSize: 18, fontWeight: 'bold', backgroundColor: simulating || !purchaseAmount ? '#95a5a6' : '#3498db', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: simulating || !purchaseAmount ? 'not-allowed' : 'pointer' }}
        >
          {simulating ? '⏳ Simulando...' : '🧮 Simular compra'}
        </button>
      </div>

      {/* Veredito */}
      {verdict && (
        <div style={{
          padding: 20, borderRadius: 'var(--radius)', marginBottom: 24,
          backgroundColor: verdict === 'ok' ? '#e8f8f0' : verdict === 'warning' ? '#fff8e1' : '#fdecea',
          border: `2px solid ${verdict === 'ok' ? '#2ecc71' : verdict === 'warning' ? '#f39c12' : '#e74c3c'}`,
        }}>
          <h2 style={{ margin: '0 0 8px 0', color: verdict === 'ok' ? '#27ae60' : verdict === 'warning' ? '#e67e22' : '#c0392b' }}>
            {purchaseDescription || 'Resultado da simulação'}
          </h2>
          <p style={{ margin: 0, fontSize: 16 }}>{verdictMessage}</p>
          {activeVoucher > 0 && (
            <p style={{ margin: '8px 0 0 0', fontSize: 13, color: 'var(--text3)' }}>
              🍽️ Nota: seu VR/VA de {formatCurrency(activeVoucher)}/mês não foi contabilizado acima pois é de uso restrito (alimentação).
            </p>
          )}
        </div>
      )}

      {/* Projeção mês a mês */}
      {projection.length > 0 && (
        <div>
          <h2 style={{ marginBottom: 16 }}>📅 Projeção mês a mês</h2>
          {projection.map((month, i) => (
            <div key={i} style={{
              border: month.isNegative ? '2px solid #e74c3c' : '1px solid #ddd',
              borderRadius: 'var(--radius)', marginBottom: 12,
              backgroundColor: month.isNegative ? '#fdecea' : 'white',
              overflow: 'hidden',
            }}>
              <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 'bold', fontSize: 16, textTransform: 'capitalize' }}>{month.month}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                    Renda: {formatCurrency(month.income)}
                    {' · '}Fixos: {formatCurrency(month.fixedExpenses)}
                    {month.simulatedExpense > 0 && ` · Compra: ${formatCurrency(month.simulatedExpense)}`}
                    {month.extras.length > 0 && ` · Extras: ${formatCurrency(month.extras.reduce((s, e) => s + e.amount, 0))}`}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: 'bold', fontSize: 20, color: month.isNegative ? '#e74c3c' : '#2ecc71' }}>
                    {month.isNegative ? '-' : '+'}R$ {Math.abs(month.balance).toFixed(2)}
                  </div>
                  <div style={{ fontSize: 12, color: month.isNegative ? '#e74c3c' : '#666' }}>
                    {month.isNegative ? '⚠️ Negativo' : 'Saldo restante'}
                  </div>
                </div>
              </div>

              {(month.extras.length > 0 || month.warnings.filter(w => !w.includes('Saldo') && !w.includes('apertado')).length > 0) && (
                <div style={{ padding: '8px 16px 12px', borderTop: '1px solid var(--border2)', backgroundColor: month.isNegative ? '#fff5f5' : '#fafafa' }}>
                  {month.extras.map((extra, j) => (
                    <div key={j} style={{ fontSize: 13, color: 'var(--orange)', marginBottom: 2 }}>
                      ⚡ {extra.label}: {formatCurrency(extra.amount)}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <Link href="/dashboard">
          <button style={{ padding: '12px 24px', fontSize: 16 }}>⬅️ Voltar ao Dashboard</button>
        </Link>
      </div>
    </main>
  );
}