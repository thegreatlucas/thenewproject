'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Header from '@/app/components/Header'
import { generateHouseholdKey, encryptHouseholdKey } from '@/lib/crypto'
import { useCrypto } from '@/lib/cryptoContext'
import { useFinanceGroup } from '@/lib/financeGroupContext'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Loader2, Copy, KeyRound, Home, UserPlus, Settings, AlertTriangle, Trash2, LogOut, Lock, ChevronLeft, CheckCircle2, AlertCircle, Calendar, Users } from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type View = 'loading' | 'settings' | 'choose' | 'create' | 'join'

export default function SetupPage() {
  const [view, setView] = useState<View>('loading')
  const [household, setHousehold] = useState<any>(null)
  const [householdId, setHouseholdId] = useState<string | null>(null)

  const [userName, setUserName] = useState('')
  const [householdName, setHouseholdName] = useState('')
  const [shipName, setShipName] = useState('')
  const [closeMode, setCloseMode] = useState<'manual' | 'auto'>('manual')
  const [closeDay, setCloseDay] = useState('')
  const [vaultPin, setVaultPin] = useState('')

  const [newHouseholdName, setNewHouseholdName] = useState('')
  const [joinCode, setJoinCode] = useState('')

  const [loading, setLoading] = useState(false)
  const [savingSettings, setSavingSettings] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const router = useRouter()
  const { setHouseholdKey } = useCrypto()
  const { groups, activeGroup, activeGroupId } = useFinanceGroup()

  useEffect(() => { init() }, [activeGroupId, activeGroup, groups.length])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserName(user.user_metadata?.name || '')
    if (activeGroup && activeGroupId) {
      setHousehold(activeGroup)
      setHouseholdId(activeGroupId)
      setHouseholdName(activeGroup.name || '')
      setShipName(activeGroup.shipName || '')
      setCloseMode(activeGroup.closeMode || 'manual')
      setCloseDay(activeGroup.closeDay ? String(activeGroup.closeDay) : '')
      setView('settings')
    } else {
      setView('choose')
    }
  }

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault()
    setSavingSettings(true)
    setErrorMsg(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSavingSettings(false); return }
    await supabase.auth.updateUser({ data: { name: userName.trim() } })
    await supabase.from('profiles').upsert({ id: user.id, name: userName.trim() }, { onConflict: 'id' })
    if (householdId) {
      const updates: any = {
        name: householdName.trim() || household?.name,
        ship_name: shipName.trim() || null,
        close_mode: closeMode,
        close_day: closeMode === 'auto' && closeDay ? parseInt(closeDay) : null,
      }
      const { error } = await supabase.from('households').update(updates).eq('id', householdId)
      if (error) { setErrorMsg('Erro ao salvar: ' + error.message); setSavingSettings(false); return }
      setHousehold((prev: any) => ({ ...prev, ...updates }))
    }
    setSavingSettings(false)
    toast.success('Configuracoes salvas com sucesso!')
  }

  async function handleCreateHousehold(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    if (!newHouseholdName.trim()) { setErrorMsg('Digite um nome para o grupo.'); return }
    if (vaultPin && vaultPin.length < 4) { setErrorMsg('O PIN deve ter pelo menos 4 digitos.'); return }
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setErrorMsg('Faca login primeiro.'); setLoading(false); return }
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    let encryptedKey: string | undefined, salt: string | undefined, hKey: CryptoKey | undefined
    if (vaultPin && vaultPin.length >= 4) {
      hKey = await generateHouseholdKey()
      const result = await encryptHouseholdKey(hKey, vaultPin)
      encryptedKey = result.encryptedKey
      salt = result.salt
    }
    const { data: hh, error: householdError } = await supabase.from('households').insert({
      name: newHouseholdName.trim(),
      invite_code: code,
      ...(encryptedKey ? { encrypted_key: encryptedKey, key_salt: salt } : {}),
    }).select().single()
    if (householdError) { setErrorMsg('Erro ao criar: ' + householdError.message); setLoading(false); return }
    await supabase.from('household_members').insert({ household_id: hh.id, user_id: user.id, role: 'admin' })
    await supabase.auth.updateUser({ data: { name: userName.trim() || user.email } })
    await supabase.from('profiles').upsert({ id: user.id, name: userName.trim() || '' }, { onConflict: 'id' })
    if (hKey) setHouseholdKey(hKey)
    setLoading(false)
    window.location.href = '/dashboard'
  }

  async function handleJoinHousehold(e: React.FormEvent) {
    e.preventDefault()
    setErrorMsg(null)
    const code = joinCode.trim().toUpperCase()
    if (!code) { setErrorMsg('Digite o codigo de convite.'); return }
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setErrorMsg('Faca login primeiro.'); setLoading(false); return }
    const { data: hh, error } = await supabase.from('households').select('*').eq('invite_code', code).single()
    if (error || !hh) { setErrorMsg('Codigo invalido ou nao encontrado.'); setLoading(false); return }
    const { data: existing } = await supabase.from('household_members').select('*').eq('household_id', hh.id).eq('user_id', user.id).maybeSingle()
    if (existing) { setErrorMsg('Voce ja faz parte deste espaco.'); setLoading(false); return }
    await supabase.from('household_members').insert({ household_id: hh.id, user_id: user.id, role: 'member' })
    await supabase.auth.updateUser({ data: { name: userName.trim() || user.email } })
    await supabase.from('profiles').upsert({ id: user.id, name: userName.trim() || '' }, { onConflict: 'id' })
    setLoading(false)
    window.location.href = '/dashboard'
  }

  async function handleLeave() {
    if (!confirm('Sair deste espaco financeiro? Seus dados nao serao apagados.')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('household_members').delete().eq('household_id', household.id).eq('user_id', user.id)
    setHousehold(null)
    setHouseholdId(null)
    setView('choose')
  }

  async function handleDeleteAccount() {
    const confirmed1 = confirm('Tem certeza que deseja EXCLUIR sua conta permanentemente?\n\nEm conformidade com a LGPD (Art. 18, VI), todos os seus dados pessoais serao eliminados e esta acao nao pode ser desfeita.')
    if (!confirmed1) return
    const confirmed2 = confirm('ULTIMA CONFIRMACAO\n\nSua conta, perfil e todos os dados dos seus espacos financeiros exclusivos serao excluidos permanentemente. Continuar?')
    if (!confirmed2) return
    setLoading(true)
    setErrorMsg(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setErrorMsg('Sessao expirada. Faca login novamente.'); setLoading(false); return }
      const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
      })
      const result = await res.json()
      if (!res.ok || !result.success) { setErrorMsg(result.message || result.error || 'Erro ao excluir conta.'); setLoading(false); return }
      await supabase.auth.signOut()
      window.location.href = '/login?deleted=true'
    } catch (err: any) {
      setErrorMsg('Erro ao excluir: ' + (err.message || 'Tente novamente.'))
      setLoading(false)
    }
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code)
    toast.success('Codigo copiado!')
  }

  // Loading
  if (view === 'loading') return (
    <>
      <Header title="Configuracoes" />
      <main className="flex items-center justify-center p-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    </>
  )

  // Settings
  if (view === 'settings' && household) return (
    <>
      <Header title="Configuracoes" action={{ label: 'Dashboard', href: '/dashboard' }} />
      <main className="mx-auto max-w-lg px-4 py-6 pb-24">
        {errorMsg && (
          <div className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive mb-4">
            <AlertCircle className="h-4 w-4 shrink-0" />
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSaveSettings} className="flex flex-col gap-4">
          {/* Profile */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Users className="h-4 w-4" />
                Seu perfil
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-1.5">
                <Label>Seu nome</Label>
                <Input value={userName} onChange={e => setUserName(e.target.value)} placeholder="Como voce quer ser chamado(a)" />
              </div>
            </CardContent>
          </Card>

          {/* Group identity */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Home className="h-4 w-4" />
                Identidade do espaco financeiro
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label>Nome do grupo</Label>
                <Input value={householdName} onChange={e => setHouseholdName(e.target.value)} placeholder="Lucas & Victoria" />
                <p className="text-xs text-muted-foreground">Nome exibido no dashboard e relatorios.</p>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Ship name <span className="text-muted-foreground font-normal">(opcional)</span></Label>
                <Input value={shipName} onChange={e => setShipName(e.target.value)} placeholder="The Rich Couple..." />
                <p className="text-xs text-muted-foreground">Apelido criativo que aparece no topo do dashboard.</p>
              </div>
            </CardContent>
          </Card>

          {/* Closing */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Fechamento mensal
              </CardTitle>
              <CardDescription>
                Salva um snapshot do mes: renda, gastos, saldo e acertos entre membros.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3">
                {(['manual', 'auto'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setCloseMode(mode)}
                    className={cn(
                      'flex flex-col items-center gap-1 rounded-lg border-2 p-4 text-center transition-all',
                      closeMode === mode
                        ? 'border-primary bg-primary/5 text-foreground'
                        : 'border-border bg-card text-muted-foreground hover:border-muted-foreground/30'
                    )}
                    style={{ borderRadius: 'var(--card-radius)' }}
                  >
                    <span className="text-sm font-semibold">{mode === 'manual' ? 'Manual' : 'Automatico'}</span>
                    <span className="text-[11px]">{mode === 'manual' ? 'Voce decide quando fechar' : 'Fecha num dia fixo'}</span>
                  </button>
                ))}
              </div>
              {closeMode === 'auto' && (
                <div className="flex flex-col gap-1.5">
                  <Label>Dia do mes para fechar</Label>
                  <select
                    value={closeDay}
                    onChange={e => setCloseDay(e.target.value)}
                    className="flex h-10 w-full border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    style={{ borderRadius: 'var(--input-radius)' }}
                  >
                    <option value="">Selecione o dia</option>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <option key={d} value={d}>Dia {d}</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">Limitado ao dia 28 para funcionar em todos os meses.</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Button type="submit" disabled={savingSettings} className="w-full h-11">
            {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar configuracoes'}
          </Button>
        </form>

        {/* Invite code */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Codigo de convite
            </CardTitle>
            <CardDescription>
              Compartilhe para que outras pessoas entrem neste espaco.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div className="flex-1 rounded-lg border-2 border-dashed border-primary/40 bg-muted p-3 text-center font-mono text-2xl font-bold tracking-[0.3em] text-foreground" style={{ borderRadius: 'var(--card-radius)' }}>
                {household.invite_code}
              </div>
              <Button variant="outline" size="icon" className="h-12 w-12 shrink-0" onClick={() => copyCode(household.invite_code)}>
                <Copy className="h-5 w-5" />
                <span className="sr-only">Copiar codigo</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Crypto key */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4" />
              Chave do cofre
            </CardTitle>
            <CardDescription>
              Compartilhe a chave AES para que o parceiro(a) veja dados criptografados.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/setup-crypto">
              <Button variant="secondary" className="w-full">
                <Lock className="h-4 w-4" />
                Compartilhar / Receber chave via QR
              </Button>
            </Link>
            <p className="text-xs text-muted-foreground mt-2">
              QR de 1 uso que expira em 10 min. Nunca trafega a chave em texto puro.
            </p>
          </CardContent>
        </Card>

        {/* Danger zone */}
        <Card className="mt-4 border-destructive/30">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Zona de perigo
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div>
              <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" onClick={handleLeave}>
                <LogOut className="h-4 w-4" />
                Sair deste espaco
              </Button>
              <p className="text-xs text-muted-foreground mt-2">Seus dados financeiros nao serao apagados.</p>
            </div>
            <Separator />
            <div>
              <p className="text-sm font-semibold text-destructive mb-2">Excluir conta permanentemente</p>
              <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
                Remove sua conta, perfil e todos os dados exclusivos. Esta acao nao pode ser desfeita.
              </p>
              <Button variant="destructive" onClick={handleDeleteAccount} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4" /> Excluir minha conta</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      </main>
    </>
  )

  // Choose view
  if (view === 'choose') return (
    <>
      <Header title="Configuracoes" />
      <main className="mx-auto max-w-md px-4 py-8">
        <h2 className="text-xl font-bold text-foreground mb-1">Bem-vindo(a)!</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Voce ainda nao esta em nenhum espaco financeiro. Crie um novo ou entre com um codigo de convite.
        </p>

        <Card className="mb-6">
          <CardContent className="p-4">
            <Label>Seu nome <span className="text-muted-foreground font-normal">(opcional)</span></Label>
            <Input className="mt-2" value={userName} onChange={e => setUserName(e.target.value)} placeholder="Como voce quer ser chamado(a)" />
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => { setView('create'); setErrorMsg(null) }}
            className="flex flex-col items-center gap-2 rounded-lg border-2 border-primary/30 bg-primary/5 p-6 text-center transition-all hover:border-primary/60"
            style={{ borderRadius: 'var(--card-radius)' }}
          >
            <Home className="h-8 w-8 text-primary" />
            <span className="font-bold text-foreground">Criar espaco</span>
            <span className="text-xs text-muted-foreground">Sou o primeiro(a)</span>
          </button>
          <button
            onClick={() => { setView('join'); setErrorMsg(null) }}
            className="flex flex-col items-center gap-2 rounded-lg border-2 border-accent/30 bg-accent/5 p-6 text-center transition-all hover:border-accent/60"
            style={{ borderRadius: 'var(--card-radius)' }}
          >
            <UserPlus className="h-8 w-8 text-accent" />
            <span className="font-bold text-foreground">Entrar com codigo</span>
            <span className="text-xs text-muted-foreground">Tenho um convite</span>
          </button>
        </div>
      </main>
    </>
  )

  // Create view
  if (view === 'create') return (
    <>
      <Header title="Criar espaco" />
      <main className="mx-auto max-w-md px-4 py-6">
        <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" onClick={() => setView('choose')}>
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Button>
        <h2 className="text-xl font-bold text-foreground mb-1">Criar espaco financeiro</h2>
        <p className="text-sm text-muted-foreground mb-6">Depois de criar, voce recebera um codigo para compartilhar.</p>

        <form onSubmit={handleCreateHousehold} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Nome do grupo</Label>
            <Input value={newHouseholdName} onChange={e => setNewHouseholdName(e.target.value)} placeholder="Familia Silva, Meu financeiro pessoal..." />
            <p className="text-xs text-muted-foreground">Pode mudar depois nas configuracoes.</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>PIN do cofre <span className="text-muted-foreground font-normal">(recomendado)</span></Label>
            <Input type="password" inputMode="numeric" value={vaultPin} onChange={e => setVaultPin(e.target.value)} placeholder="Minimo 4 digitos" />
            <p className="text-xs text-muted-foreground leading-relaxed">Protege dados com criptografia. Guarde bem -- nao e possivel recupera-lo.</p>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {errorMsg}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full h-11">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar espaco'}
          </Button>
        </form>
      </main>
    </>
  )

  // Join view
  return (
    <>
      <Header title="Entrar com codigo" />
      <main className="mx-auto max-w-md px-4 py-6">
        <Button variant="ghost" size="sm" className="mb-4 text-muted-foreground" onClick={() => setView('choose')}>
          <ChevronLeft className="h-4 w-4" />
          Voltar
        </Button>
        <h2 className="text-xl font-bold text-foreground mb-1">Entrar com codigo</h2>
        <p className="text-sm text-muted-foreground mb-6">Digite o codigo que seu parceiro(a) te enviou.</p>

        <form onSubmit={handleJoinHousehold} className="flex flex-col gap-4">
          <Input
            value={joinCode}
            onChange={e => setJoinCode(e.target.value.toUpperCase())}
            placeholder="ABC123"
            maxLength={8}
            className="h-14 text-center text-2xl font-bold tracking-[0.3em] font-mono border-dashed border-2"
          />
          <p className="text-xs text-muted-foreground">6 caracteres, nao diferencia maiusculas/minusculas.</p>

          {errorMsg && (
            <div className="flex items-center gap-2.5 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 shrink-0" /> {errorMsg}
            </div>
          )}

          <Button type="submit" disabled={loading} className="w-full h-11 bg-accent text-accent-foreground hover:bg-accent/90">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Entrar no casal'}
          </Button>
        </form>
      </main>
    </>
  )
}
