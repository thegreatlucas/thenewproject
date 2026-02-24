'use client';
// app/transactions/[id]/page.tsx — Detalhe + comentários em estilo chat

import { useState, useEffect, useRef } from 'react';
import { formatCurrency } from '@/lib/format';
import { useParams, useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Header from '@/app/components/Header';

interface Comment {
  id: string;
  user_id: string;
  content: string;
  created_at: string;
  profiles?: { name: string };
}

export default function TransactionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tx, setTx] = useState<any>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/login'); return; }
      setCurrentUserId(user.id);
      await Promise.all([loadTx(), loadComments()]);
      setLoading(false);
    }
    init();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [comments]);

  async function loadTx() {
    const { data } = await supabase
      .from('transactions')
      .select('*, categories(name, icon, color), accounts(name)')
      .eq('id', id)
      .single();
    setTx(data);
  }

  async function loadComments() {
    const { data } = await supabase
      .from('transaction_comments')
      .select('*, profiles(name)')
      .eq('transaction_id', id)
      .order('created_at', { ascending: true });
    setComments(data || []);
  }

  async function sendComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim() || !currentUserId) return;
    setSending(true);
    await supabase.from('transaction_comments').insert({ transaction_id: id, user_id: currentUserId, content: newComment.trim() });
    setNewComment('');
    await loadComments();
    setSending(false);
  }

  async function deleteComment(cid: string) {
    if (!confirm('Remover comentário?')) return;
    await supabase.from('transaction_comments').delete().eq('id', cid);
    setComments(prev => prev.filter(c => c.id !== cid));
  }

  if (loading) return <main style={{ padding: 16, color: 'var(--text)' }}>Carregando...</main>;
  if (!tx) return <main style={{ padding: 16, color: 'var(--text)' }}>Transação não encontrada.</main>;

  const display = tx.installments_count > 1 && tx.installment_value ? Number(tx.installment_value) : Number(tx.amount);

  return (
    <>
      <Header title="Transação" backHref="/transactions" />
      <main style={{ padding: 16, maxWidth: 580, margin: '0 auto', paddingBottom: 120 }}>

        {/* Card da transação */}
        <div style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: 20, marginBottom: 24, boxShadow: 'var(--shadow)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 19, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
                {tx.categories?.icon || '📁'} {tx.description}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text3)', marginBottom: 4 }}>
                {tx.categories?.name || 'Sem categoria'}
                {tx.accounts?.name && ` · ${tx.accounts.name}`}
                {tx.split === 'shared' && ' · 👫 Compartilhado'}
                {tx.installments_count > 1 && ` · ${tx.installments_count}x`}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                📅 {new Date(tx.date + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}
              </div>
              {tx.payment_method && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>💳 {tx.payment_method}</div>
              )}
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--red)' }}>{formatCurrency(display)}</div>
              {tx.installments_count > 1 && (
                <div style={{ fontSize: 12, color: 'var(--orange)' }}>total R$ {Number(tx.amount).toFixed(2)}</div>
              )}
            </div>
          </div>
        </div>

        {/* Comentários */}
        <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
          💬 Comentários {comments.length > 0 && `(${comments.length})`}
        </h3>

        {comments.length === 0 && (
          <div style={{ padding: 20, border: '1px dashed var(--border)', borderRadius: 'var(--radius)', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
            Nenhum comentário ainda. Deixe uma nota! ✍️
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
          {comments.map((c) => {
            const isMe = c.user_id === currentUserId;
            const initials = (c.profiles?.name || 'U')[0].toUpperCase();
            return (
              <div key={c.id} style={{ display: 'flex', flexDirection: isMe ? 'row-reverse' : 'row', gap: 8, alignItems: 'flex-end' }}>
                {/* Avatar */}
                <div style={{ width: 32, height: 32, borderRadius: '50%', backgroundColor: isMe ? '#2ecc71' : '#3498db', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'white', fontWeight: 700, flexShrink: 0 }}>
                  {initials}
                </div>
                {/* Balão */}
                <div style={{ maxWidth: '72%', backgroundColor: isMe ? '#dcf8c6' : 'var(--surface)', border: `1px solid ${isMe ? '#b7e4a0' : 'var(--border)'}`, borderRadius: isMe ? '14px 14px 4px 14px' : '14px 14px 14px 4px', padding: '8px 12px', position: 'relative' }}>
                  {!isMe && (
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--blue)', marginBottom: 3 }}>
                      {c.profiles?.name || 'Parceiro(a)'}
                    </div>
                  )}
                  <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.4 }}>{c.content}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                    {new Date(c.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · {new Date(c.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                  </div>
                  {isMe && (
                    <button onClick={() => deleteComment(c.id)} style={{ position: 'absolute', top: 4, right: 6, background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: 'var(--text-muted)', lineHeight: 1 }} title="Remover">×</button>
                  )}
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input fixo de comentário */}
        <div style={{ position: 'fixed', bottom: 'env(safe-area-inset-bottom, 0)', left: 0, right: 0, padding: '10px 16px', backgroundColor: 'var(--surface)', borderTop: '1px solid var(--border)', zIndex: 50 }}>
          <form onSubmit={sendComment} style={{ display: 'flex', gap: 8, alignItems: 'center', maxWidth: 580, margin: '0 auto' }}>
            <input
              type="text"
              value={newComment}
              onChange={e => setNewComment(e.target.value)}
              placeholder="Escreva um comentário..."
              maxLength={300}
              style={{ flex: 1, padding: '10px 14px', fontSize: 14, borderRadius: 22, border: '1px solid var(--border)', outline: 'none' }}
            />
            <button type="submit" disabled={!newComment.trim() || sending}
              style={{ width: 44, height: 44, borderRadius: '50%', backgroundColor: newComment.trim() && !sending ? '#2ecc71' : 'var(--border)', color: 'white', border: 'none', cursor: newComment.trim() && !sending ? 'pointer' : 'default', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {sending ? '⏳' : '➤'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}