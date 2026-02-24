'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { Loader2, ChevronRight, ChevronLeft, Check, Plus, X, Rocket, Wallet, Landmark, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils'

const INCOME_TYPES = [
  { value: 'salary', label: 'Salario' },
  { value: 'freelance', label: 'Freelance' },
  { value: 'bonus', label: 'Bonus' },
  { value: 'vr', label: 'Vale Refeicao' },
  { value: 'va', label: 'Vale Alimentacao' },
  { value: 'investment', label: 'Rendimento' },
  { value: 'other', label: 'Outro' },
]

const ACCOUNT_TYPES = [
  { value: 'checking', label: 'Conta Corrente' },
  { value: 'savings', label: 'Poupanca' },
  { value: 'cash', label: 'Dinheiro' },
  { value: 'meal_voucher', label: 'Vale Refeicao' },
  { value: 'food_voucher', label: 'Vale Alimentacao' },
  { value: 'investment', label: 'Investimento' },
  { value: 'other', label: 'Outro' },
]

const RECURRENCE_SUGGESTIONS = [
  { name: 'Netflix', amount: '' },
  { name: 'Spotify', amount: '' },
  { name: 'Internet', amount: '' },
  { name: 'Academia', amount: '' },
  { name: 'Aluguel', amount: '' },
]

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const [userName, setUserName] = useState('')
  const [loading, setLoading] = useState(false)
  const [initLoading, setInitLoading] = useState(true)
  const router = useRouter()

  const [incomes, setIncomes] = useState([{ description: '', amount: '', type: 'salary' }])
  const [accounts, setAccounts] = useState([{ name: '', type: 'checking' }])
  const [recurrences, setRecurrences] = useState([{ name: '', amount: '', due_day: '1' }])

  useEffect(() => { init() }, [])

  async function init() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserId(user.id)
    setUserName(user.user_metadata?.name || user.email?.split('@')[0] || '')

    const { data: members } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', user.id)
      .limit(1)
    const member = members?.[0] ?? null

    if (!member) { router.push('/setup'); return }
    setHouseholdId(member.household_id)
    setInitLoading(false)
  }

  async function handleSaveIncomes() {
    if (!householdId || !userId) return
    setLoading(true)
    const validIncomes = incomes.filter(i => i.description.trim() && parseFloat(i.amount) > 0)
    if (validIncomes.length > 0) {
      const now = new Date()
      const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      await supabase.from('incomes').insert(
        validIncomes.map(i => ({
          household_id: householdId,
          user_id: userId,
          description: i.description.trim(),
          amount: parseFloat(i.amount),
          type: i.type,
          recurrence: 'monthly',
          month,
        }))
      )
    }
    setLoading(false)
    setStep(2)
  }

  async function handleSaveAccounts() {
    if (!householdId || !userId) return
    setLoading(true)
    const validAccounts = accounts.filter(a => a.name.trim())
    if (validAccounts.length > 0) {
      await supabase.from('accounts').insert(
        validAccounts.map(a => ({
          household_id: householdId,
          owner_id: userId,
          name: a.name.trim(),
          type: a.type,
        }))
      )
    }
    setLoading(false)
    setStep(3)
  }

  async function handleSaveRecurrences() {
    if (!householdId) return
    setLoading(true)
    const validRec = recurrences.filter(r => r.name.trim() && parseFloat(r.amount) > 0)
    if (validRec.length > 0) {
      const now = new Date()
      for (const r of validRec) {
        const dueDay = parseInt(r.due_day) || 1
        const nextDate = new Date(now.getFullYear(), now.getMonth(), dueDay)
        if (nextDate <= now) nextDate.setMonth(nextDate.getMonth() + 1)
        await supabase.from('recurrence_rules').insert({
          household_id: householdId,
          name: r.name.trim(),
          recurrence_type: 'fixed',
          amount: parseFloat(r.amount),
          due_day: dueDay,
          day_of_month: dueDay,
          frequency: 'monthly',
          next_date: nextDate.toISOString().split('T')[0],
          active: true,
          split: 'individual',
          payment_method: 'pix',
        })
      }
    }
    await supabase.from('households').update({ onboarding_done: true }).eq('id', householdId)
    setLoading(false)
    router.push('/dashboard')
  }

  if (initLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </main>
    )
  }

  const steps = [
    { label: 'Renda', icon: Wallet },
    { label: 'Contas', icon: Landmark },
    { label: 'Recorrencias', icon: RotateCcw },
  ]
  const progressValue = ((step - 1) / steps.length) * 100

  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-lg px-4 py-8 pb-24">
        {/* Header */}
        <div className="mb-8 text-center animate-fade-in">
          <h1 className="text-xl font-bold text-foreground text-balance">
            Ola{userName ? `, ${userName}` : ''}! Vamos configurar tudo.
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            3 passos rapidos para comecar a usar o app.
          </p>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <Progress value={progressValue} className="h-2 mb-4" />
          <div className="flex justify-between">
            {steps.map((s, i) => {
              const n = i + 1
              const done = n < step
              const active = n === step
              const StepIcon = s.icon
              return (
                <div key={s.label} className="flex flex-col items-center gap-1.5">
                  <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition-all',
                    done ? 'bg-accent text-accent-foreground' :
                    active ? 'bg-primary text-primary-foreground' :
                    'bg-muted text-muted-foreground'
                  )}>
                    {done ? <Check className="h-4 w-4" /> : <StepIcon className="h-4 w-4" />}
                  </div>
                  <span className={cn(
                    'text-[11px] font-medium',
                    active ? 'text-primary' : done ? 'text-accent' : 'text-muted-foreground'
                  )}>
                    {s.label}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Step 1: Income */}
        {step === 1 && (
          <div className="animate-slide-up">
            <h2 className="text-lg font-bold text-foreground mb-1">Sua renda mensal</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Adicione suas fontes de renda. Pode pular e adicionar depois.
            </p>

            <div className="flex flex-col gap-3">
              {incomes.map((inc, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Descricao</Label>
                        <Input
                          type="text"
                          placeholder="Ex: Salario CLT"
                          value={inc.description}
                          onChange={e => setIncomes(incomes.map((x, j) => j === i ? { ...x, description: e.target.value } : x))}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Valor (R$)</Label>
                        <Input
                          type="number"
                          placeholder="5000"
                          value={inc.amount}
                          onChange={e => setIncomes(incomes.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                        />
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Tipo</Label>
                      <select
                        value={inc.type}
                        onChange={e => setIncomes(incomes.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
                        className="flex h-10 w-full border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        style={{ borderRadius: 'var(--input-radius)' }}
                      >
                        {INCOME_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                    {incomes.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-destructive h-8"
                        onClick={() => setIncomes(incomes.filter((_, j) => j !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                        Remover
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              variant="outline"
              className="w-full mt-3 border-dashed"
              onClick={() => setIncomes([...incomes, { description: '', amount: '', type: 'salary' }])}
            >
              <Plus className="h-4 w-4" />
              Adicionar outra renda
            </Button>

            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep(2)}>
                Pular
              </Button>
              <Button onClick={handleSaveIncomes} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Proximo</span><ChevronRight className="h-4 w-4" /></>}
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Accounts */}
        {step === 2 && (
          <div className="animate-slide-up">
            <h2 className="text-lg font-bold text-foreground mb-1">Suas contas</h2>
            <p className="text-sm text-muted-foreground mb-5">
              Cadastre suas contas bancarias para rastrear de onde saem os gastos.
            </p>

            <div className="flex flex-col gap-3">
              {accounts.map((acc, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Nome</Label>
                        <Input
                          type="text"
                          placeholder="Nubank, Inter..."
                          value={acc.name}
                          onChange={e => setAccounts(accounts.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Tipo</Label>
                        <select
                          value={acc.type}
                          onChange={e => setAccounts(accounts.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
                          className="flex h-10 w-full border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          style={{ borderRadius: 'var(--input-radius)' }}
                        >
                          {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    </div>
                    {accounts.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-destructive h-8"
                        onClick={() => setAccounts(accounts.filter((_, j) => j !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                        Remover
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              variant="outline"
              className="w-full mt-3 border-dashed"
              onClick={() => setAccounts([...accounts, { name: '', type: 'checking' }])}
            >
              <Plus className="h-4 w-4" />
              Adicionar outra conta
            </Button>

            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={handleSaveAccounts} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><span>Proximo</span><ChevronRight className="h-4 w-4" /></>}
              </Button>
            </div>
            <Button variant="ghost" className="w-full mt-2 text-muted-foreground" onClick={() => setStep(3)}>
              Pular
            </Button>
          </div>
        )}

        {/* Step 3: Recurrences */}
        {step === 3 && (
          <div className="animate-slide-up">
            <h2 className="text-lg font-bold text-foreground mb-1">Contas fixas mensais</h2>
            <p className="text-sm text-muted-foreground mb-4">
              Adicione contas que se repetem todo mes. O app vai lembra-los de pagar.
            </p>

            {/* Quick suggestions */}
            <div className="mb-4">
              <p className="text-xs text-muted-foreground mb-2">Sugestoes rapidas:</p>
              <div className="flex flex-wrap gap-2">
                {RECURRENCE_SUGGESTIONS.map(s => {
                  const added = recurrences.some(r => r.name === s.name)
                  return (
                    <Badge
                      key={s.name}
                      variant={added ? 'default' : 'outline'}
                      className="cursor-pointer"
                      onClick={() => {
                        if (!added) {
                          setRecurrences([...recurrences.filter(r => r.name.trim() || r.amount.trim()), { name: s.name, amount: '', due_day: '1' }])
                        }
                      }}
                    >
                      {s.name}
                    </Badge>
                  )
                })}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {recurrences.map((rec, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="grid grid-cols-[2fr_1fr_1fr] gap-3">
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Nome</Label>
                        <Input
                          type="text"
                          placeholder="Netflix"
                          value={rec.name}
                          onChange={e => setRecurrences(recurrences.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Valor</Label>
                        <Input
                          type="number"
                          placeholder="55,90"
                          value={rec.amount}
                          onChange={e => setRecurrences(recurrences.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))}
                        />
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <Label className="text-xs">Dia</Label>
                        <Input
                          type="number"
                          placeholder="1"
                          min={1}
                          max={28}
                          value={rec.due_day}
                          onChange={e => setRecurrences(recurrences.map((x, j) => j === i ? { ...x, due_day: e.target.value } : x))}
                        />
                      </div>
                    </div>
                    {recurrences.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-2 text-destructive h-8"
                        onClick={() => setRecurrences(recurrences.filter((_, j) => j !== i))}
                      >
                        <X className="h-3.5 w-3.5" />
                        Remover
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Button
              variant="outline"
              className="w-full mt-3 border-dashed"
              onClick={() => setRecurrences([...recurrences, { name: '', amount: '', due_day: '1' }])}
            >
              <Plus className="h-4 w-4" />
              Adicionar outra recorrencia
            </Button>

            <div className="grid grid-cols-2 gap-3 mt-6">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ChevronLeft className="h-4 w-4" />
                Voltar
              </Button>
              <Button onClick={handleSaveRecurrences} disabled={loading} className="bg-accent text-accent-foreground hover:bg-accent/90">
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Rocket className="h-4 w-4" /><span>Concluir</span></>}
              </Button>
            </div>
            <Button variant="ghost" className="w-full mt-2 text-muted-foreground" onClick={() => router.push('/dashboard')}>
              Pular e ir para o dashboard
            </Button>
          </div>
        )}
      </div>
    </main>
  )
}
