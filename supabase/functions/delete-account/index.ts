/**
 * Edge Function: delete-account
 *
 * Conformidade LGPD (Lei 13.709/2018):
 *   - Art. 18, VI: direito à exclusão dos dados pessoais tratados
 *   - Art. 16: dados devem ser eliminados após término do tratamento
 *   - Art. 46: segurança no tratamento (autenticação obrigatória via JWT)
 *
 * O que esta função faz:
 *   1. Valida o JWT do usuário autenticado (nunca aceita user_id externo)
 *   2. Apaga todos os dados pessoais vinculados ao usuário
 *   3. Apaga households onde o usuário é o único membro
 *   4. Registra um log de deleção anonimizado (sem PII) para auditoria
 *   5. Deleta o registro de autenticação via Admin API
 *
 * Chamada pelo client após limpar o estado local:
 *   POST /functions/v1/delete-account
 *   Authorization: Bearer <user_jwt>
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Preflight CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Método não permitido.' }), {
      status: 405, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  // ── 1. Autenticar o usuário via JWT ───────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ error: 'Token de autenticação ausente.' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const jwt = authHeader.replace('Bearer ', '');

  // Cliente com a chave do usuário para validar o JWT
  const userClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });

  const { data: { user }, error: authError } = await userClient.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Usuário não autenticado.' }), {
      status: 401, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const userId = user.id;

  // Cliente admin com service_role para operações privilegiadas
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const deletionLog: string[] = [];
  const errors: string[] = [];

  try {
    // ── 2. Buscar todos os households do usuário ──────────────────
    const { data: memberships } = await admin
      .from('household_members')
      .select('household_id, role')
      .eq('user_id', userId);

    for (const membership of memberships || []) {
      const hid = membership.household_id;

      // Verificar quantos membros há neste household
      const { data: allMembers } = await admin
        .from('household_members')
        .select('user_id, role')
        .eq('household_id', hid);

      const otherMembers = (allMembers || []).filter((m) => m.user_id !== userId);

      if (otherMembers.length === 0) {
        // ── Household só tem este usuário → deletar tudo ──────────
        const tables = [
          'transaction_comments',
          'transaction_shares',
          'transactions',
          'incomes',
          'goal_movements',
          'goals',
          'budgets',
          'financing_intermediaries',
          'financings',
          'recurrence_rules',
          'invoices',
          'credit_cards',
          'balance_history',
          'balances',
          'monthly_closings',
          'crypto_key_transfers',
          'accounts',
          'categories',
          'household_members',
          'households',
        ];

        for (const table of tables) {
          const col = table === 'households' ? 'id' : 'household_id';
          const { error } = await admin.from(table).delete().eq(col, hid);
          if (error) {
            errors.push(`${table}: ${error.message}`);
          } else {
            deletionLog.push(`Tabela ${table} limpa para household ${hid}`);
          }
        }
      } else {
        // ── Household tem outros membros → só remover este usuário ─
        // Se ele é o único admin, promover outro membro
        const otherAdmins = otherMembers.filter((m) => m.role === 'admin');
        if (membership.role === 'admin' && otherAdmins.length === 0) {
          const nextMember = otherMembers[0];
          await admin
            .from('household_members')
            .update({ role: 'admin' })
            .eq('household_id', hid)
            .eq('user_id', nextMember.user_id);
          deletionLog.push(`Novo admin promovido no household ${hid}`);
        }

        // Anonimizar transações do usuário neste household (mantém histórico do grupo)
        await admin
          .from('transactions')
          .update({ user_id: null, payer_id: null })
          .eq('household_id', hid)
          .eq('user_id', userId);

        await admin
          .from('incomes')
          .update({ user_id: null })
          .eq('household_id', hid)
          .eq('user_id', userId);

        // Remover membro
        await admin
          .from('household_members')
          .delete()
          .eq('household_id', hid)
          .eq('user_id', userId);

        deletionLog.push(`Usuário removido do household compartilhado ${hid}`);
      }
    }

    // ── 3. Deletar dados pessoais diretos ─────────────────────────
    await admin.from('transaction_comments').delete().eq('user_id', userId);
    await admin.from('profiles').delete().eq('id', userId);
    deletionLog.push('Perfil e comentários deletados');

    // ── 4. Log de auditoria anonimizado (sem PII) ─────────────────
    // Armazena apenas: timestamp, ação e hash do user_id
    // Nunca armazena e-mail, nome ou qualquer dado identificável
    // Útil para auditorias LGPD sem re-identificar o titular
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(userId));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const userHash = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    console.log(JSON.stringify({
      event: 'account_deleted',
      // LGPD Art. 18 VI: exercício do direito de exclusão pelo titular
      lgpd_basis: 'art_18_vi',
      user_hash: userHash, // hash unidirecional — não permite re-identificação
      timestamp: new Date().toISOString(),
      households_cleaned: (memberships || []).length,
    }));

    // ── 5. Deletar o registro de autenticação (Admin API) ─────────
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(userId);

    if (deleteAuthError) {
      // Mesmo que a deleção do auth falhe, os dados já foram apagados
      errors.push(`auth.deleteUser: ${deleteAuthError.message}`);
      return new Response(JSON.stringify({
        success: false,
        message: 'Dados apagados, mas houve erro ao remover a conta de autenticação. Entre em contato com o suporte.',
        errors,
      }), {
        status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Conta e todos os dados pessoais excluídos com sucesso. Direito de exclusão LGPD Art. 18 VI exercido.',
    }), {
      status: 200, headers: { ...CORS, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    console.error('delete-account error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: 'Erro interno ao excluir conta.',
      detail: err.message,
    }), {
      status: 500, headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
});