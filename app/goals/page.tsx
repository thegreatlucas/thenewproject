'use client';

import { useState, useEffect } from 'react';
import { formatCurrency } from '@/lib/format';
import { supabase } from '@/lib/supabaseClient';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEncryptedInsert } from '@/lib/useEncryptedInsert';

type Goal = {
  id: string;
  name: string;
  type: 'individual' | 'shared';
  target_amount: number;
  current_amount: number;
  deadline: string | null;
  owner_id: string | null;
};

type MovementForm = {
  amount: string;
  type: 'deposit' | 'withdrawal';
};

export default function GoalsPage() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [householdId, setHouseholdId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [activeMovement, setActiveMovement] = useState<string | null>(null);
  const [movementForm, setMovementForm] = useState<MovementForm>({ amount: '', type: 'deposit' });
  const [savingMovement, setSavingMovement] = useState(false);
  const [newGoal, setNewGoal] = useState({
    name: '',
    target: '',
    deadline: '',
    type: 'individual' as 'individual' | 'shared',
  });
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const router = useRouter();
  const { encryptRecord } = useEncryptedInsert();

  useEffect(() => {
    init();
  }, []);

  async function init() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push('/login'); return; }
    setCurrentUserId(user.id);

    const { data: member } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .single();

    if (!member) { router.push('/setup'); return; }
    setHouseholdId(member.household_id);
    await loadGoals(member.household_id, user.id);
    setLoading(false);
  }

  async function loadGoals(hid: string, uid: string) {
    const { data, error } = await supabase
      .from('goals')
      .select('*')
      .eq('household_id', hid)
      .or(`type.eq.shared,owner_id.eq.${uid}`)
      .order('created_at', { ascending: false });

    if (error) { console.error(error); return; }
    setGoals(data || []);
  }

  async function createGoal(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(null);

    if (!newGoal.name.trim()) { setErrorMsg('Digite um nome.'); return; }
    if (!newGoal.target || parseFloat(newGoal.target) <= 0) { setErrorMsg('Digite um valor alvo válido.'); return; }
    if (!householdId || !currentUserId) return;

    setCreating(true);

    const base = {
      household_id: householdId,
      owner_id: newGoal.type === 'individual' ? currentUserId : null,
      type: newGoal.type,
      name: newGoal.name.trim(),
      target_amount: parseFloat(newGoal.target),
      current_amount: 0,
      deadline: newGoal.deadline || null,
    };

    const payload = await encryptRecord(base);
    const { error } = await supabase.from('goals').insert(payload);

    setCreating(false);

    if (error) { setErrorMsg('Erro ao criar: ' + error.message); return; }

    setNewGoal({ name: '', target: '', deadline: '', type: 'individual' });
    setShowCreateForm(false);
    await loadGoals(householdId, currentUserId);
  }

  async function saveMovement(goalId: string) {
    const amount = parseFloat(movementForm.amount);
    if (!amount || amount <= 0) { alert('Digite um valor válido.'); return; }

    const goal = goals.find(g => g.id === goalId);
    if (!goal) return;

    if (movementForm.type === 'withdrawal' && amount > goal.current_amount) {
      alert(`Saldo insuficiente. Disponível: {ormatCurrency(goal.current_amount)}`);
      return;
    }

    setSavingMovement(true);

    const { error: mvErr } = await supabase.from('goal_movements').insert({
      goal_id: goalId,
      amount,
      type: movementForm.type,
      date: new Date().toISOString().split('T')[0],
    });

    if (mvErr) { alert('Erro: ' + mvErr.message); setSavingMovement(false); return; }

    const delta = movementForm.type === 'deposit' ? amount : -amount;
    const newAmount = Math.max(0, goal.current_amount + delta);

    const { error: goalErr } = await supabase
      .from('goals')
      .update({ current_amount: newAmount })
      .eq('id', goalId);

    setSavingMovement(false);

    if (goalErr) { alert('Movimento salvo mas erro ao atualizar saldo: ' + goalErr.message); return; }

    setActiveMovement(null);
    setMovementForm({ amount: '', type: 'deposit' });
    if (householdId && currentUserId) await loadGoals(householdId, currentUserId);
  }

  async function deleteGoal(goalId: string, goalName: string) {
    if (!confirm(`Excluir a meta "${goalName}"? Os movimentos também serão removidos.`)) return;
    await supabase.from('goal_movements').delete().eq('goal_id', goalId);
    const { error } = await supabase.from('goals').delete().eq('id', goalId);
    if (error) { alert('Erro ao excluir: ' + error.message); return; }
    if (householdId && currentUserId) await loadGoals(householdId, currentUserId);
  }

  function daysUntilDeadline(deadline: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dl = new Date(deadline + 'T12:00:00');
    const diff = Math.round((dl.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff < 0) return { label: `${Math.abs(diff)} dias em atraso`, color: 'var(--red)' };
    if (diff === 0) return { label: 'Prazo hoje!', color: 'var(--orange)' };
    if (diff <= 30) return { label: `${diff} dias restantes`, color: 'var(--orange)' };
    return { label: `${diff} dias restantes`, color: '#27ae60' };
  }

  if (loading) return <main style={{ padding: 16, color: 'var(--text-muted)' }}>Carregando...</main>;

  const sharedGoals = goals.filter(g => g.type === 'shared');
  const individualGoals = goals.filter(g => g.type === 'individual');

  function GoalCard({ goal }: { goal: Goal }) {
    const progress = goal.target_amount > 0 ? (goal.current_amount / goal.target_amount) * 100 : 0;
    const isComplete = progress >= 100;
    const deadline = goal.deadline ? daysUntilDeadline(goal.deadline) : null;
    const isMoving = activeMovement === goal.id;

    return (
      <div style={{
        border: isComplete ? '2px solid #2ecc71' : '1px solid #ddd',
        borderRadius: 'var(--radius)', padding: 18, marginBottom: 14,
        backgroundColor: isComplete ? '#f0fff4' : 'white',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div>
            <span style={{ fontWeight: 'bold', fontSize: 16 }}>
              {isComplete ? '🏆 ' : '🎯 '}{goal.name}
            </span>
            {goal.type === 'shared' && (
              <span style={{ marginLeft: 8, fontSize: 11, backgroundColor: 'rgba(108,99,255,0.08)', color: '#1565c0', padding: '2px 8px', borderRadius: 12 }}>
                👫 Casal
              </span>
            )}
          </div>
          <button onClick={() => deleteGoal(goal.id, goal.name)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ccc', fontSize: 16, padding: 0 }}>
            🗑️
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 'bold', color: isComplete ? '#27ae60' : '#333' }}>
            R$ {Number(goal.current_amount).toFixed(2)}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>de R$ {Number(goal.target_amount).toFixed(2)}</span>
        </div>

        <div style={{ width: '100%', height: 10, backgroundColor: 'var(--bg3)', borderRadius: 'var(--radius)', marginBottom: 6, overflow: 'hidden' }}>
          <div style={{
            width: `${Math.min(progress, 100)}%`, height: '100%',
            backgroundColor: isComplete ? '#2ecc71' : progress > 66 ? '#f39c12' : '#3498db',
            borderRadius: 'var(--radius)', transition: 'width 0.3s',
          }} />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 4 }}>
          {progress.toFixed(1)}% concluído
          {goal.target_amount > 0 && goal.current_amount < goal.target_amount && (
            <span style={{ color: 'var(--text-muted)' }}>{' · '}faltam R$ {(goal.target_amount - goal.current_amount).toFixed(2)}</span>
          )}
        </div>

        {deadline && (
          <div style={{ fontSize: 12, color: deadline.color, marginBottom: 10 }}>
            📅 {new Date(goal.deadline! + 'T12:00:00').toLocaleDateString('pt-BR')} — {deadline.label}
          </div>
        )}

        {!isComplete && !isMoving && (
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button
              onClick={() => { setActiveMovement(goal.id); setMovementForm({ amount: '', type: 'deposit' }); }}
              style={{ flex: 1, padding: '8px', backgroundColor: 'var(--blue)', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>
              ➕ Depositar
            </button>
            {goal.current_amount > 0 && (
              <button
                onClick={() => { setActiveMovement(goal.id); setMovementForm({ amount: '', type: 'withdrawal' }); }}
                style={{ flex: 1, padding: '8px', backgroundColor: '#e67e22', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: 13, fontWeight: 'bold' }}>
                ➖ Resgatar
              </button>
            )}
          </div>
        )}

        {isMoving && (
          <div style={{ marginTop: 12, backgroundColor: 'var(--bg2)', borderRadius: 'var(--radius-sm)', padding: 14, border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <button onClick={() => setMovementForm(f => ({ ...f, type: 'deposit' }))}
                style={{ flex: 1, padding: '8px', border: movementForm.type === 'deposit' ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: movementForm.type === 'deposit' ? '#e3f2fd' : 'white', cursor: 'pointer', fontWeight: movementForm.type === 'deposit' ? 'bold' : 'normal' }}>
                ➕ Depositar
              </button>
              <button onClick={() => setMovementForm(f => ({ ...f, type: 'withdrawal' }))}
                style={{ flex: 1, padding: '8px', border: movementForm.type === 'withdrawal' ? '2px solid #e67e22' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: movementForm.type === 'withdrawal' ? '#fff3e0' : 'white', cursor: 'pointer', fontWeight: movementForm.type === 'withdrawal' ? 'bold' : 'normal' }}>
                ➖ Resgatar
              </button>
            </div>

            <input type="number" placeholder="0,00" value={movementForm.amount}
              onChange={e => setMovementForm(f => ({ ...f, amount: e.target.value }))}
              min="0.01" step="0.01" autoFocus
              style={{ width: '100%', padding: 10, fontSize: 18, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', marginBottom: 10, textAlign: 'center' }}
            />

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => saveMovement(goal.id)} disabled={savingMovement}
                style={{ flex: 1, padding: '10px', backgroundColor: savingMovement ? '#95a5a6' : (movementForm.type === 'deposit' ? '#27ae60' : '#e67e22'), color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: savingMovement ? 'not-allowed' : 'pointer', fontWeight: 'bold' }}>
                {savingMovement ? '⏳' : '✅ Confirmar'}
              </button>
              <button onClick={() => setActiveMovement(null)}
                style={{ padding: '10px 16px', backgroundColor: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', color: 'var(--text3)' }}>
                Cancelar
              </button>
            </div>
          </div>
        )}

        {isComplete && (
          <div style={{ textAlign: 'center', marginTop: 10, color: '#27ae60', fontWeight: 'bold', fontSize: 14 }}>
            🏆 Meta alcançada!
          </div>
        )}
      </div>
    );
  }

  return (
    <main style={{ padding: 16, maxWidth: 600, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ margin: 0 }}>🎯 Metas</h1>
        <button
          onClick={() => { setShowCreateForm(!showCreateForm); setErrorMsg(null); }}
          style={{ padding: '10px 18px', backgroundColor: showCreateForm ? '#95a5a6' : '#3498db', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 'bold' }}>
          {showCreateForm ? '✕ Fechar' : '+ Nova meta'}
        </button>
      </div>

      {showCreateForm && (
        <form onSubmit={createGoal} style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 20, marginBottom: 24, backgroundColor: 'var(--bg2)' }}>
          <h3 style={{ margin: '0 0 16px' }}>Nova meta</h3>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6, fontSize: 14 }}>Nome:</label>
            <input type="text" placeholder="Ex: Viagem para Europa" value={newGoal.name}
              onChange={e => setNewGoal(g => ({ ...g, name: e.target.value }))}
              style={{ width: '100%', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 15 }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6, fontSize: 14 }}>Valor alvo (R$):</label>
              <input type="number" placeholder="5000" value={newGoal.target}
                onChange={e => setNewGoal(g => ({ ...g, target: e.target.value }))}
                min="0.01" step="0.01"
                style={{ width: '100%', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 15 }} />
            </div>
            <div>
              <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 6, fontSize: 14 }}>Prazo (opcional):</label>
              <input type="date" value={newGoal.deadline}
                onChange={e => setNewGoal(g => ({ ...g, deadline: e.target.value }))}
                style={{ width: '100%', padding: 10, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)', fontSize: 14 }} />
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: 8, fontSize: 14 }}>Tipo:</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button type="button" onClick={() => setNewGoal(g => ({ ...g, type: 'individual' }))}
                style={{ padding: 12, border: newGoal.type === 'individual' ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: newGoal.type === 'individual' ? '#e3f2fd' : 'white', cursor: 'pointer', fontWeight: newGoal.type === 'individual' ? 'bold' : 'normal' }}>
                👤 Individual<br /><span style={{ fontSize: 11, color: 'var(--text3)' }}>Só pra mim</span>
              </button>
              <button type="button" onClick={() => setNewGoal(g => ({ ...g, type: 'shared' }))}
                style={{ padding: 12, border: newGoal.type === 'shared' ? '2px solid #3498db' : '1px solid #ddd', borderRadius: 'var(--radius-sm)', backgroundColor: newGoal.type === 'shared' ? '#e3f2fd' : 'white', cursor: 'pointer', fontWeight: newGoal.type === 'shared' ? 'bold' : 'normal' }}>
                👫 Casal<br /><span style={{ fontSize: 11, color: 'var(--text3)' }}>Compartilhada</span>
              </button>
            </div>
          </div>

          {errorMsg && (
            <div style={{ color: 'var(--red)', backgroundColor: '#fde8e8', border: '1px solid #f5c6cb', borderRadius: 'var(--radius-sm)', padding: 10, marginBottom: 12, fontSize: 13 }}>
              ❌ {errorMsg}
            </div>
          )}

          <button type="submit" disabled={creating}
            style={{ width: '100%', padding: '12px', backgroundColor: creating ? '#95a5a6' : '#2ecc71', color: 'white', border: 'none', borderRadius: 'var(--radius-sm)', cursor: creating ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 15 }}>
            {creating ? '⏳ Criando...' : '✅ Criar meta'}
          </button>
        </form>
      )}

      {sharedGoals.length > 0 && (
        <section style={{ marginBottom: 28 }}>
          <h3 style={{ color: 'var(--text3)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>👫 Metas do casal</h3>
          {sharedGoals.map(g => <GoalCard key={g.id} goal={g} />)}
        </section>
      )}

      {individualGoals.length > 0 && (
        <section>
          <h3 style={{ color: 'var(--text3)', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>👤 Suas metas individuais</h3>
          {individualGoals.map(g => <GoalCard key={g.id} goal={g} />)}
        </section>
      )}

      {goals.length === 0 && !showCreateForm && (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--text3)', border: '1px dashed #ddd', borderRadius: 12 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🎯</div>
          <h3>Nenhuma meta ainda</h3>
          <p style={{ fontSize: 14 }}>Crie sua primeira meta individual ou compartilhada com o casal.</p>
        </div>
      )}

      <div style={{ marginTop: 32 }}>
        <Link href="/dashboard">
          <button style={{ padding: '12px 24px', fontSize: 15 }}>⬅️ Voltar ao Dashboard</button>
        </Link>
      </div>
    </main>
  );
}